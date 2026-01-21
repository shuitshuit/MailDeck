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
            // Wait for the next interval
            await Task.Delay(TimeSpan.FromMinutes(_intervalMinutes), stoppingToken);
        }
    }

    private async Task CheckEmailsAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting email check cycle...");
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
            var encryptionService = scope.ServiceProvider.GetRequiredService<IEncryptionService>();

            await db.OpenAsync();

            var pageSize = 20;
            var pageNumber = 1;
            var executeTaskList = new List<Task>();

            while (!stoppingToken.IsCancellationRequested)
            {
                var configs = await db.AsQueryable<UserServerConfig>()
                    .OrderBy(c => c.LastCheckedAt)
                    .Skip((pageNumber - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                executeTaskList.Add(RunCheck(configs, db, encryptionService, stoppingToken));
                if (configs.Count < pageSize)
                    break; // No more pages
            }
            await Task.WhenAll(executeTaskList);
        }
    }

    private async Task RunCheck(List<UserServerConfig> configs, PostgreSqlConnect db, IEncryptionService encryptionService, CancellationToken stoppingToken)
    {
        foreach (var config in configs)
        {
            if (stoppingToken.IsCancellationRequested) break;

            try
            {
                // Decrypt password
                var password = await encryptionService.DecryptAsync(config.ImapPassword);

                using var client = new ImapClient();

                var currentMax = await FetchLastMessageUIDAsync(config, password, stoppingToken);
                if (config.LastKnownUid == 0)
                {
                    config.LastKnownUid = currentMax;
                }
                else if (currentMax > config.LastKnownUid)
                {
                    // Found new messages
                    // Create list of UIDs to fetch
                    var uidsToFetch = new List<UniqueId>();
                    for (uint i = (uint)config.LastKnownUid + 1; i <= currentMax; i++)
                    {
                        uidsToFetch.Add(new UniqueId(i));
                    }

                    if (uidsToFetch.Count > 0)
                    {
                        List<IMessageSummary> newMessages = [];
                        var currentMsgID = 0;
                        try
                        {
                            var mimeMessages = await FetchMessageAsync(config, password, uidsToFetch, stoppingToken);
                            var (fetchedMessages, messages) = mimeMessages;
                            newMessages = fetchedMessages.ToList();
                            foreach (var msg in fetchedMessages)
                            {
                                currentMsgID = (int)msg.UniqueId.Id;
                                foreach (var mimeMessage in messages)
                                {
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
                        }
                        catch (Exception ex)
                        {
                            _logger.LogErrorWithSql(ex,
                                "Failed to enqueue message {Uid} for auto-labeling",
                                currentMsgID
                            );
                        }

                        // Note: Push notifications are now handled by AutoLabelingService after applying labels
                        config.LastKnownUid = currentMax;
                    }
                }

                config.LastCheckedAt = DateTime.UtcNow;
                await db.UpdateAsync(config);

                await client.DisconnectAsync(true, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, $"Error checking email for config {config.Id} (User: {config.UserId})");
            }
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