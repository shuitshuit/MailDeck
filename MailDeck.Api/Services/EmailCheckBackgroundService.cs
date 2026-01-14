using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Security;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Services;

public class EmailCheckBackgroundService : BackgroundService
{
    private readonly ILogger<EmailCheckBackgroundService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly PushServiceClient _pushClient;
    private readonly IConfiguration _configuration;
    private readonly ChannelService _channelService;
    private readonly int _intervalMinutes;

    public EmailCheckBackgroundService(
        ILogger<EmailCheckBackgroundService> logger,
        IServiceScopeFactory scopeFactory,
        PushServiceClient pushClient,
        IConfiguration configuration,
        ChannelService channelService,
        IHostEnvironment environment)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        _pushClient = pushClient;
        _configuration = configuration;
        _channelService = channelService;
        _intervalMinutes = environment.IsDevelopment() ? 1 : 10; // 1 minute for dev, 10 for prod
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

            // Get all server configs
            // Using empty object to get all
            var allConfigs = await db.GetAllAsync<UserServerConfig>();
            
            foreach (var config in allConfigs)
            {
                if (stoppingToken.IsCancellationRequested) break;

                try
                {
                    // Decrypt password
                    var password = await encryptionService.DecryptAsync(config.ImapPassword);

                    using (var client = new ImapClient())
                    {
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
                                // Fetch summaries for these UIDs
                                // Note: UIDs that don't exist (deleted) will be ignored by MailKit or result in partial results
                                var newMessages = await inbox.FetchAsync(uidsToFetch, MessageSummaryItems.Envelope | MessageSummaryItems.UniqueId, stoppingToken);

                                if (newMessages.Count > 0)
                                {
                                    // Send each new message to Channel for auto-labeling
                                    foreach (var msg in newMessages)
                                    {
                                        try
                                        {
                                            // Fetch body text for this message
                                            var fullMessage = await inbox.GetMessageAsync(msg.UniqueId, stoppingToken);
                                            var bodyText = fullMessage.TextBody ?? fullMessage.HtmlBody ?? "";

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
                                        catch (Exception ex)
                                        {
                                            _logger.LogErrorWithSql(ex,
                                                "Failed to enqueue message {Uid} for auto-labeling",
                                                msg.UniqueId.Id
                                            );
                                        }
                                    }

                                    // Sort by UID to get the last one
                                    var lastMsg = newMessages.OrderByDescending(m => m.UniqueId).FirstOrDefault();
                                    if (lastMsg != null)
                                    {
                                        await SendPushNotificationAsync(db, config.UserId, newMessages.Count, lastMsg.Envelope.Subject, config.Id, stoppingToken);
                                    }
                                    config.LastKnownUid = currentMax;
                                }
                            }
                        }

                        config.LastCheckedAt = DateTime.UtcNow;
                        await db.UpdateAsync(config);
                        
                        await client.DisconnectAsync(true, stoppingToken);

                    }
                }
                catch (Exception ex)
                {
                    _logger.LogErrorWithSql(ex, $"Error checking email for config {config.Id} (User: {config.UserId})");
                }
            }
        }
    }

    private async Task SendPushNotificationAsync(PostgreSqlConnect db, string userId, int count, string lastSubject, Guid configId, CancellationToken stoppingToken)
    {
        var subscriptions = await db.GetMultipleAsync<WebPushSubscription>(new { user_id = userId });

        foreach (var sub in subscriptions)
        {
            try
            {
                var pushSubscription = new PushSubscription
                {
                    Endpoint = sub.Endpoint,
                    Keys = new Dictionary<string, string>
                    {
                        { "p256dh", sub.P256dh },
                        { "auth", sub.Auth }
                    }
                };

                // Payload
                var payload = System.Text.Json.JsonSerializer.Serialize(new 
                {
                    title = $"{count} new email(s)",
                    body = $"Last: {lastSubject}",
                    url = $"/inbox/{configId}"
                });

                var pushMessage = new PushMessage(payload)
                {
                    Topic = lastSubject
                };
                
                // Using VAPID
                var vapidSubject = _configuration["WebPush:Subject"];
                var publicKey = _configuration["WebPush:PublicKey"];
                var privateKey = _configuration["WebPush:PrivateKey"];

                if (!string.IsNullOrEmpty(publicKey) && !string.IsNullOrEmpty(privateKey))
                {
                    var vapidDetails = new VapidAuthentication(publicKey, privateKey) { Subject = vapidSubject };
                    _pushClient.DefaultAuthentication = vapidDetails;
                }

                await _pushClient.RequestPushMessageDeliveryAsync(pushSubscription, pushMessage, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, $"Failed to send push to subscription {sub.Id}");
                // Handle 410 Gone (remove subscription)
            }
        }
    }
}

