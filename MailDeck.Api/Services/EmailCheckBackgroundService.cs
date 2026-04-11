using System.Collections.Concurrent;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Security;
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
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error occurred during email check cycle.");
            }
        }
    }

    private async Task CheckEmailsAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting email check cycle...");
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        var encryptionService = scope.ServiceProvider.GetRequiredService<IEncryptionService>();

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
            await Task.Delay(TimeSpan.FromMinutes(_intervalMinutes), stoppingToken);
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
            tasks.Add(RunCheckWithThrottle(config, semaphore, db, encryptionService, stoppingToken));

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
        IEncryptionService encryptionService,
        CancellationToken stoppingToken)
    {
        await hostSemaphore.WaitAsync(stoppingToken);
        try
        {
            await RunCheckSingle(config, db, encryptionService, stoppingToken);
        }
        finally
        {
            hostSemaphore.Release();
        }
    }

    private async Task RunCheckSingle(UserServerConfig config, PostgreSqlConnect db, IEncryptionService encryptionService, CancellationToken stoppingToken)
    {
        try
        {
            // Decrypt password
            var password = await encryptionService.DecryptAsync(config.ImapPassword);

            var currentMax = await FetchLastMessageUIDAsync(config, password, stoppingToken);
            if (config.LastKnownUid == 0)
            {
                config.LastKnownUid = currentMax;
            }
            else if (currentMax > config.LastKnownUid)
            {
                // Found new messages
                var uidsToFetch = new List<UniqueId>();
                for (uint i = (uint)config.LastKnownUid + 1; i <= currentMax; i++)
                {
                    uidsToFetch.Add(new UniqueId(i));
                }

                if (uidsToFetch.Count > 0)
                {
                    var currentMsgID = 0;
                    try
                    {
                        var mimeMessages = await FetchMessageAsync(config, password, uidsToFetch, stoppingToken);
                        var (fetchedMessages, messages) = mimeMessages;
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
                                From: msg.Envelope.From.ToString(),
                                Subject: msg.Envelope.Subject ?? "",
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

                    config.LastKnownUid = currentMax;
                }
            }

            config.LastCheckedAt = DateTime.UtcNow;
            await db.UpdateAsync(config);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, $"Error checking email for config {config.Id} (User: {config.UserId})");
        }
    }

    private async Task<uint> FetchLastMessageUIDAsync(UserServerConfig config, string password, CancellationToken stoppingToken)
    {
        using var client = new ImapClient();
        var options = config.ImapSslEnabled ?
                    (config.ImapPort == 465 || config.ImapPort == 993 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls) :
                    SecureSocketOptions.Auto;

        await client.ConnectAsync(config.ImapHost, config.ImapPort, options, stoppingToken);
        await client.AuthenticateAsync(config.ImapUsername, password, stoppingToken);

        var inbox = client.Inbox;
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

    private async Task<MessageFetchResult> FetchMessageAsync(UserServerConfig config, string password, List<UniqueId> uids, CancellationToken stoppingToken)
    {
        using var client = new ImapClient();
        var options = config.ImapSslEnabled ?
                    (config.ImapPort == 465 || config.ImapPort == 993 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls) :
                    SecureSocketOptions.Auto;
        await client.ConnectAsync(config.ImapHost, config.ImapPort, options, stoppingToken);
        await client.AuthenticateAsync(config.ImapUsername, password, stoppingToken);
        var inbox = client.Inbox;
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