using System.Collections.Concurrent;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailKit;
using MailKit.Net.Imap;
using MimeKit;
using ShuitNet.ORM.PostgreSQL;
using ShuitNet.ORM.PostgreSQL.LinqToSql;

namespace MailDeck.Api.Services;

public class EmailCheckBackgroundService : BackgroundService
{
    private readonly ILogger<EmailCheckBackgroundService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ChannelService _channelService;
    private readonly int _intervalMinutes;

    /// <summary>
    /// Per-host semaphore to limit concurrent IMAP connections to the same server.
    /// </summary>
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _hostSemaphores = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Maximum concurrent IMAP connections allowed per host.
    /// </summary>
    private const int MaxConnectionsPerHost = 2;

    /// <summary>
    /// Number of configs leased per batch. Small batches keep each pod's share
    /// bounded so multiple pods spread the work between them.
    /// </summary>
    private const int LeaseBatchSize = 20;

    public EmailCheckBackgroundService(
        ILogger<EmailCheckBackgroundService> logger,
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ChannelService channelService,
        IHostEnvironment environment)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _channelService = channelService;
        _intervalMinutes = 1; // 1 minute
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Email Check Background Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckEmailsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error occurred during email check cycle.");
            }

            // Guarantee a fixed interval between cycles. Without this delay the loop
            // would spin back-to-back whenever configs exist, re-checking the same
            // mailbox before the previous last_known_uid update settles and increasing
            // cross-pod polling collisions and load.
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(_intervalMinutes), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CheckEmailsAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting email check cycle...");
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        var mailConnection = scope.ServiceProvider.GetRequiredService<IMailConnectionService>();

        await db.OpenAsync();

        // Multi-pod safe cycle:
        // Repeatedly lease a small batch of the least-recently-checked configs with
        // "FOR UPDATE SKIP LOCKED". Each pod claims a disjoint set of configs, so the
        // same account is never processed by two pods at once (which would produce
        // duplicate notifications). We mark last_checked_at inside the lease transaction
        // and release the row lock immediately, so the slow IMAP work below does not
        // block other pods.
        var totalProcessed = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            var batch = await LeaseConfigBatchAsync(db, LeaseBatchSize, stoppingToken);
            if (batch.Count == 0)
                break;

            totalProcessed += batch.Count;

            // Round-robin interleave by IMAP host so consecutive configs hit different servers.
            var interleaved = InterleaveByHost(batch);

            var tasks = new List<Task>();
            foreach (var config in interleaved)
            {
                if (stoppingToken.IsCancellationRequested) break;

                var semaphore = _hostSemaphores.GetOrAdd(config.ImapHost, _ => new SemaphoreSlim(MaxConnectionsPerHost, MaxConnectionsPerHost));
                tasks.Add(RunCheckWithThrottle(config, semaphore, db, mailConnection, stoppingToken));
            }

            await Task.WhenAll(tasks);
        }

        _logger.LogInformation("Email check cycle finished. Configs processed by this pod: {Count}", totalProcessed);
    }

    /// <summary>
    /// Atomically lease a batch of configs that are due for checking, using
    /// <c>FOR UPDATE SKIP LOCKED</c> so concurrent pods claim disjoint rows.
    /// The lease is recorded by bumping <c>last_checked_at</c> inside the same
    /// transaction, and the row lock is released as soon as the transaction commits.
    /// </summary>
    private async Task<List<UserServerConfig>> LeaseConfigBatchAsync(PostgreSqlConnect db, int batchSize, CancellationToken stoppingToken)
    {
        // Only lease configs whose last check is older than the interval (or never checked),
        // so a pod does not re-grab rows another pod just refreshed within the same cycle.
        var dueBefore = DateTime.UtcNow - TimeSpan.FromMinutes(_intervalMinutes);

        // A single statement: select-and-lock the due rows, then stamp last_checked_at.
        // RETURNING gives us the leased rows to process. SKIP LOCKED makes concurrent
        // pods skip rows already locked by this UPDATE's sub-select.
        const string sql = @"
UPDATE user_server_configs
SET last_checked_at = @Now
WHERE id IN (
    SELECT id FROM user_server_configs
    WHERE last_checked_at IS NULL OR last_checked_at < @DueBefore
    ORDER BY last_checked_at ASC NULLS FIRST
    LIMIT @BatchSize
    FOR UPDATE SKIP LOCKED
)
RETURNING *;";

        try
        {
            var rows = await db.QueryAsync<UserServerConfig>(
                sql,
                new { Now = DateTime.UtcNow, DueBefore = dueBefore, BatchSize = batchSize });
            return rows?.ToList() ?? new List<UserServerConfig>();
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to lease config batch for email check.");
            return new List<UserServerConfig>();
        }
    }

    /// <summary>
    /// Interleave configs by IMAP host in round-robin order so that
    /// consecutive configs target different servers.
    /// </summary>
    private static List<UserServerConfig> InterleaveByHost(List<UserServerConfig> configs)
    {
        var grouped = configs
            .GroupBy(c => c.ImapHost, StringComparer.OrdinalIgnoreCase)
            .Select(g => new Queue<UserServerConfig>(g))
            .ToList();

        var result = new List<UserServerConfig>(configs.Count);
        while (grouped.Count > 0)
        {
            for (int i = grouped.Count - 1; i >= 0; i--)
            {
                result.Add(grouped[i].Dequeue());
                if (grouped[i].Count == 0)
                    grouped.RemoveAt(i);
            }
        }
        return result;
    }

    private async Task RunCheckWithThrottle(
        UserServerConfig config,
        SemaphoreSlim hostSemaphore,
        PostgreSqlConnect db,
        IMailConnectionService mailConnection,
        CancellationToken stoppingToken)
    {
        await hostSemaphore.WaitAsync(stoppingToken);
        try
        {
            await RunCheckSingle(config, db, mailConnection, stoppingToken);
        }
        finally
        {
            hostSemaphore.Release();
        }
    }

    private async Task RunCheckSingle(UserServerConfig config, PostgreSqlConnect db, IMailConnectionService mailConnection, CancellationToken stoppingToken)
    {
        try
        {
            var currentMax = await FetchLastMessageUIDAsync(config, mailConnection, stoppingToken);

            if (config.LastKnownUid == 0)
            {
                // First observation: initialize baseline without notifying existing mail.
                // Atomic claim so only one pod sets the initial UID.
                await TryAdvanceLastKnownUidAsync(db, config.Id, oldUid: 0, newUid: currentMax);
            }
            else if (currentMax > config.LastKnownUid)
            {
                // Fetch first (read-only IMAP is idempotent; double fetch is harmless).
                var uidsToFetch = new List<UniqueId>();
                for (uint i = (uint)config.LastKnownUid + 1; i <= currentMax; i++)
                {
                    uidsToFetch.Add(new UniqueId(i));
                }

                if (uidsToFetch.Count > 0)
                {
                    var mimeMessages = await FetchMessageAsync(config, mailConnection, uidsToFetch, stoppingToken);
                    var (fetchedMessages, messages) = mimeMessages;

                    // Atomically claim the UID range before enqueuing. Only the pod whose
                    // conditional UPDATE affects a row (i.e. last_known_uid still equals the
                    // value we read) is allowed to enqueue, preventing duplicate notifications
                    // when multiple pods observe the same new mail.
                    var claimed = await TryAdvanceLastKnownUidAsync(db, config.Id, oldUid: config.LastKnownUid, newUid: currentMax);
                    if (!claimed)
                    {
                        _logger.LogDebug(
                            "Skipped enqueue for config {ConfigId}: UID range already claimed by another pod (up to {Uid})",
                            config.Id, currentMax);
                        return;
                    }

                    var currentMsgID = 0;
                    try
                    {
                        for (int i = 0; i < fetchedMessages.Count; i++)
                        {
                            var msg = fetchedMessages[i];
                            var mimeMessage = messages[i];
                            currentMsgID = (int)msg.UniqueId.Id;
                            var bodyText = mimeMessage.TextBody ?? mimeMessage.HtmlBody ?? "";

                            var notification = new NewEmailNotification(
                                UserId: config.UserId,
                                ConfigId: config.Id.ToString(),
                                MessageId: (int)msg.UniqueId.Id,
                                From: msg.Envelope!.From.ToString(),
                                Subject: msg.Envelope!.Subject ?? "",
                                BodyText: bodyText
                            );
                            await _channelService.EnqueueAsync(notification, stoppingToken);
                            _logger.LogDebug(
                                "Enqueued new email for auto-labeling: UID={Uid}, From={From}, Subject={Subject}",
                                msg.UniqueId.Id, msg.Envelope.From, msg.Envelope.Subject
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogErrorWithSql(ex,
                            "Failed to enqueue message {Uid} for auto-labeling",
                            currentMsgID
                        );
                    }
                }
            }
            else
            {
                // No new messages: just record the check time. (last_checked_at was
                // already stamped when this config was leased; refreshing it here keeps
                // the timestamp accurate to when the check actually completed.)
                await db.ExecuteAsync(
                    "UPDATE user_server_configs SET last_checked_at = NOW() WHERE id = @Id",
                    new { Id = config.Id });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, $"Error checking email for config {config.Id} (User: {config.UserId})");
        }
    }

    /// <summary>
    /// Atomically advance last_known_uid using an optimistic conditional UPDATE.
    /// Returns true only if this pod won the claim (affected exactly one row), i.e.
    /// last_known_uid was still <paramref name="oldUid"/> at update time.
    /// Also refreshes last_checked_at.
    /// </summary>
    private static async Task<bool> TryAdvanceLastKnownUidAsync(PostgreSqlConnect db, Guid configId, long oldUid, uint newUid)
    {
        var affected = await db.ExecuteAsync(
            "UPDATE user_server_configs SET last_known_uid = @New, last_checked_at = NOW() WHERE id = @Id AND last_known_uid = @Old",
            new { Id = configId, New = (long)newUid, Old = oldUid });
        return affected == 1;
    }

    private async Task<uint> FetchLastMessageUIDAsync(UserServerConfig config, IMailConnectionService mailConnection, CancellationToken stoppingToken)
    {
        using var client = new ImapClient();
        await mailConnection.ConnectImapAsync(client, config, stoppingToken);

        var inbox = client.Inbox;
        if (inbox == null) return 0;
        await inbox.OpenAsync(FolderAccess.ReadOnly, stoppingToken);

        // Get appropriate max UID
        // Fetch the last message in the folder to see its UID
        uint currentMax = 0;
        if (inbox.Count > 0)
        {
            var lastMessage = await inbox.FetchAsync(inbox.Count - 1, inbox.Count - 1, MessageSummaryItems.UniqueId, stoppingToken);
            if (lastMessage.Count > 0)
            {
                currentMax = lastMessage[0].UniqueId.Id;
            }
        }
        return currentMax;
    }

    private async Task<MessageFetchResult> FetchMessageAsync(UserServerConfig config, IMailConnectionService mailConnection, List<UniqueId> uids, CancellationToken stoppingToken)
    {
        using var client = new ImapClient();
        await mailConnection.ConnectImapAsync(client, config, stoppingToken);
        var inbox = client.Inbox;
        if (inbox == null) return new MessageFetchResult([], []);
        await inbox.OpenAsync(FolderAccess.ReadOnly, stoppingToken);
        var messages = new List<MimeMessage>();
        foreach (var uid in uids)
        {
            messages.Add(await inbox.GetMessageAsync(uid, stoppingToken));
        }
        var fetchedMessages = await inbox.FetchAsync(uids, MessageSummaryItems.Envelope | MessageSummaryItems.UniqueId, stoppingToken);
        await client.DisconnectAsync(true, stoppingToken);
        return new MessageFetchResult(fetchedMessages, messages);
    }
}

internal record struct MessageFetchResult(IList<IMessageSummary> fetchedMessages, List<MimeMessage> messages)
{
    public static implicit operator (IList<IMessageSummary> fetchedMessages, List<MimeMessage> messages)(MessageFetchResult value)
    {
        return (value.fetchedMessages, value.messages);
    }

    public static implicit operator MessageFetchResult((IList<IMessageSummary> fetchedMessages, List<MimeMessage> messages) value)
    {
        return new MessageFetchResult(value.fetchedMessages, value.messages);
    }
}