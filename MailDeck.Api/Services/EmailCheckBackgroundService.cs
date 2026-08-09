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

            // Guarantee a fixed interval between cycles. Without this the loop would spin
            // back-to-back whenever configs exist, increasing cross-pod polling collisions
            // and load.
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

        // Fetch all configs ordered by least recently checked
        var allConfigs = new List<UserServerConfig>();
        var pageSize = 20;
        var pageNumber = 1;

        while (!stoppingToken.IsCancellationRequested)
        {
            var configs = await db.AsQueryable<UserServerConfig>()
                .OrderBy(c => c.LastCheckedAt)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            allConfigs.AddRange(configs);
            if (configs.Count < pageSize)
                break;
            pageNumber++;
        }

        if (allConfigs.Count == 0)
        {
            // Nothing to check; the common inter-cycle delay in ExecuteAsync handles the wait.
            return;
        }

        // Round-robin interleave by IMAP host to spread access across different servers
        var interleaved = InterleaveByHost(allConfigs);

        // Calculate stagger delay: spread all checks evenly across the interval
        var totalInterval = TimeSpan.FromMinutes(_intervalMinutes);
        var staggerDelay = interleaved.Count > 1
            ? TimeSpan.FromMilliseconds(totalInterval.TotalMilliseconds / interleaved.Count)
            : TimeSpan.Zero;

        _logger.LogInformation(
            "Processing {Count} configs across {HostCount} hosts, stagger delay: {StaggerMs}ms",
            interleaved.Count,
            allConfigs.Select(c => c.ImapHost).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
            staggerDelay.TotalMilliseconds);

        // Process configs with staggered starts and per-host concurrency control
        var tasks = new List<Task>();
        foreach (var config in interleaved)
        {
            if (stoppingToken.IsCancellationRequested) break;

            var semaphore = _hostSemaphores.GetOrAdd(config.ImapHost, _ => new SemaphoreSlim(MaxConnectionsPerHost, MaxConnectionsPerHost));
            tasks.Add(RunCheckWithThrottle(config, semaphore, db, mailConnection, stoppingToken));

            if (staggerDelay > TimeSpan.Zero)
            {
                await Task.Delay(staggerDelay, stoppingToken);
            }
        }

        await Task.WhenAll(tasks);
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
                // No new messages: just record the check time.
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