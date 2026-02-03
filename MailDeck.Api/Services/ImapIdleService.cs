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

/// <summary>
/// Maintains persistent IMAP IDLE connections for real-time new mail detection.
/// Each UserServerConfig gets one long-lived IMAP connection that uses the IDLE
/// command to receive instant notifications from the server when new messages arrive.
/// </summary>
public class ImapIdleService : BackgroundService
{
    private readonly ILogger<ImapIdleService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ChannelService _channelService;

    /// <summary>
    /// Tracks running IDLE tasks by config ID so we can detect added/removed configs.
    /// </summary>
    private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _activeConnections = new();

    /// <summary>
    /// Maximum time to stay in IDLE before re-issuing the command.
    /// RFC 2177 recommends clients re-IDLE before the server's 30-minute timeout.
    /// </summary>
    private static readonly TimeSpan IdleTimeout = TimeSpan.FromMinutes(25);

    /// <summary>
    /// Interval to scan the database for newly added or removed configs.
    /// </summary>
    private static readonly TimeSpan ConfigSyncInterval = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Maximum delay between staggered connection startups to avoid thundering herd.
    /// </summary>
    private static readonly TimeSpan MaxStaggerDelay = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Maximum reconnection backoff duration.
    /// </summary>
    private static readonly TimeSpan MaxReconnectBackoff = TimeSpan.FromMinutes(5);

    public ImapIdleService(
        ILogger<ImapIdleService> logger,
        IServiceScopeFactory scopeFactory,
        ChannelService channelService)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        _channelService = channelService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("IMAP IDLE Service started.");

        // Main loop: periodically sync configs and manage connections
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncConnectionsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error during IMAP IDLE connection sync.");
            }

            try
            {
                await Task.Delay(ConfigSyncInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        // Graceful shutdown: cancel all active connections
        _logger.LogInformation("IMAP IDLE Service shutting down, cancelling {Count} connections...", _activeConnections.Count);
        foreach (var (configId, cts) in _activeConnections)
        {
            cts.Cancel();
            cts.Dispose();
        }
        _activeConnections.Clear();
    }

    /// <summary>
    /// Fetches all configs from the database and starts/stops IDLE connections
    /// to match the current set of configs.
    /// </summary>
    private async Task SyncConnectionsAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        await db.OpenAsync();

        var allConfigs = await db.AsQueryable<UserServerConfig>().ToListAsync();
        var currentConfigIds = new HashSet<Guid>(allConfigs.Select(c => c.Id));

        // Start connections for new configs (staggered)
        var newConfigs = allConfigs.Where(c => !_activeConnections.ContainsKey(c.Id)).ToList();
        if (newConfigs.Count > 0)
        {
            _logger.LogInformation("Starting IDLE connections for {Count} new configs.", newConfigs.Count);

            var staggerDelay = newConfigs.Count > 1
                ? TimeSpan.FromMilliseconds(Math.Min(MaxStaggerDelay.TotalMilliseconds, 60_000.0 / newConfigs.Count))
                : TimeSpan.Zero;

            foreach (var config in newConfigs)
            {
                if (stoppingToken.IsCancellationRequested) break;

                var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                _activeConnections[config.Id] = cts;

                // Fire-and-forget: each connection runs independently
                _ = RunIdleConnectionAsync(config, cts.Token);

                if (staggerDelay > TimeSpan.Zero)
                {
                    await Task.Delay(staggerDelay, stoppingToken);
                }
            }
        }

        // Stop connections for removed configs
        var removedIds = _activeConnections.Keys.Where(id => !currentConfigIds.Contains(id)).ToList();
        foreach (var id in removedIds)
        {
            if (_activeConnections.TryRemove(id, out var cts))
            {
                _logger.LogInformation("Stopping IDLE connection for removed config {ConfigId}.", id);
                cts.Cancel();
                cts.Dispose();
            }
        }

        _logger.LogInformation(
            "IMAP IDLE connections: {Active} active, {New} started, {Removed} removed.",
            _activeConnections.Count, newConfigs.Count, removedIds.Count);
    }

    /// <summary>
    /// Manages a single persistent IMAP IDLE connection for one config.
    /// Handles reconnection with exponential backoff + jitter.
    /// </summary>
    private async Task RunIdleConnectionAsync(UserServerConfig config, CancellationToken ct)
    {
        var reconnectAttempt = 0;

        while (!ct.IsCancellationRequested)
        {
            ImapClient? client = null;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
                var encryptionService = scope.ServiceProvider.GetRequiredService<IEncryptionService>();
                await db.OpenAsync();

                // Reload config from DB to get latest LastKnownUid
                var freshConfig = await db.AsQueryable<UserServerConfig>()
                    .Where(c => c.Id == config.Id)
                    .FirstOrDefaultAsync();

                if (freshConfig == null)
                {
                    _logger.LogInformation("Config {ConfigId} no longer exists, stopping IDLE connection.", config.Id);
                    _activeConnections.TryRemove(config.Id, out _);
                    return;
                }

                var password = await encryptionService.DecryptAsync(freshConfig.ImapPassword);

                client = new ImapClient();
                var options = freshConfig.ImapSslEnabled
                    ? (freshConfig.ImapPort == 465 || freshConfig.ImapPort == 993
                        ? SecureSocketOptions.SslOnConnect
                        : SecureSocketOptions.StartTls)
                    : SecureSocketOptions.Auto;

                await client.ConnectAsync(freshConfig.ImapHost, freshConfig.ImapPort, options, ct);
                await client.AuthenticateAsync(freshConfig.ImapUsername, password, ct);

                var inbox = client.Inbox;
                await inbox.OpenAsync(FolderAccess.ReadOnly, ct);

                // Initialize LastKnownUid on first connection if needed
                if (freshConfig.LastKnownUid == 0 && inbox.Count > 0)
                {
                    var lastMessage = await inbox.FetchAsync(
                        inbox.Count - 1, inbox.Count - 1,
                        MessageSummaryItems.UniqueId, ct);
                    if (lastMessage.Count > 0)
                    {
                        freshConfig.LastKnownUid = lastMessage[0].UniqueId.Id;
                        freshConfig.LastCheckedAt = DateTime.UtcNow;
                        await db.UpdateAsync(freshConfig);
                    }
                }

                // Reset reconnect attempt counter on successful connection
                reconnectAttempt = 0;
                _logger.LogInformation(
                    "IMAP IDLE connected for config {ConfigId} ({Host}), LastKnownUid={Uid}.",
                    freshConfig.Id, freshConfig.ImapHost, freshConfig.LastKnownUid);

                // IDLE loop: stay connected and re-IDLE periodically
                await RunIdleLoopAsync(client, inbox, freshConfig, db, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                _logger.LogInformation("IMAP IDLE connection for config {ConfigId} cancelled.", config.Id);
                break;
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "IMAP IDLE connection error for config {ConfigId} ({Host}), attempt {Attempt}.",
                    config.Id, config.ImapHost, reconnectAttempt);
            }
            finally
            {
                if (client != null)
                {
                    try
                    {
                        if (client.IsConnected)
                            await client.DisconnectAsync(true);
                    }
                    catch { /* best-effort disconnect */ }
                    client.Dispose();
                }
            }

            // Exponential backoff + jitter before reconnecting
            if (!ct.IsCancellationRequested)
            {
                reconnectAttempt++;
                var backoff = CalculateBackoff(reconnectAttempt);
                _logger.LogInformation(
                    "Reconnecting IDLE for config {ConfigId} in {BackoffMs}ms (attempt {Attempt}).",
                    config.Id, backoff.TotalMilliseconds, reconnectAttempt);
                try
                {
                    await Task.Delay(backoff, ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    /// <summary>
    /// Runs the IDLE loop on an already-connected client.
    /// Periodically re-issues IDLE to avoid server timeout.
    /// When the server signals new messages (CountChanged), fetches and enqueues them.
    /// </summary>
    private async Task RunIdleLoopAsync(
        ImapClient client,
        IMailFolder inbox,
        UserServerConfig config,
        PostgreSqlConnect db,
        CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && client.IsConnected)
        {
            // Use a done token to break out of IDLE after the timeout period
            using var idleDone = new CancellationTokenSource();
            var newMessagesDetected = false;

            // Register for CountChanged event to detect new messages during IDLE
            void OnCountChanged(object? sender, EventArgs e)
            {
                newMessagesDetected = true;
                // Cancel IDLE so we can process the new messages
                try { idleDone.Cancel(); } catch { /* already cancelled */ }
            }

            inbox.CountChanged += OnCountChanged;
            try
            {
                // Schedule IDLE cancellation after the timeout
                idleDone.CancelAfter(IdleTimeout);

                // Enter IDLE - this blocks until cancelled or server sends an update
                await client.IdleAsync(idleDone.Token, ct);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                // idleDone was cancelled (timeout or new messages) - this is normal
            }
            finally
            {
                inbox.CountChanged -= OnCountChanged;
            }

            if (ct.IsCancellationRequested) break;

            if (newMessagesDetected)
            {
                _logger.LogInformation("New messages detected for config {ConfigId} ({Host}).", config.Id, config.ImapHost);
                await ProcessNewMessagesAsync(client, inbox, config, db, ct);
            }

            // Update LastCheckedAt even if no new messages (re-IDLE heartbeat)
            config.LastCheckedAt = DateTime.UtcNow;
            await db.UpdateAsync(config);
        }
    }

    /// <summary>
    /// Fetches new messages since LastKnownUid using the existing IDLE connection.
    /// No need to open a new connection since we already have one.
    /// </summary>
    private async Task ProcessNewMessagesAsync(
        ImapClient client,
        IMailFolder inbox,
        UserServerConfig config,
        PostgreSqlConnect db,
        CancellationToken ct)
    {
        try
        {
            // Re-fetch the folder status to get the latest count
            // The inbox is already open, just check for new UIDs
            uint currentMax = 0;
            if (inbox.Count > 0)
            {
                var lastMessage = await inbox.FetchAsync(
                    inbox.Count - 1, inbox.Count - 1,
                    MessageSummaryItems.UniqueId, ct);
                if (lastMessage.Count > 0)
                {
                    currentMax = lastMessage[0].UniqueId.Id;
                }
            }

            if (currentMax <= (uint)config.LastKnownUid) return;

            var uidsToFetch = new List<UniqueId>();
            for (uint i = (uint)config.LastKnownUid + 1; i <= currentMax; i++)
            {
                uidsToFetch.Add(new UniqueId(i));
            }

            if (uidsToFetch.Count == 0) return;

            _logger.LogInformation(
                "Fetching {Count} new messages for config {ConfigId} (UID {From}-{To}).",
                uidsToFetch.Count, config.Id, uidsToFetch[0].Id, uidsToFetch[^1].Id);

            // Fetch envelopes and full messages using the existing connection
            var fetchedMessages = await inbox.FetchAsync(
                uidsToFetch,
                MessageSummaryItems.Envelope | MessageSummaryItems.UniqueId, ct);

            foreach (var msg in fetchedMessages)
            {
                try
                {
                    var mimeMessage = await inbox.GetMessageAsync(msg.UniqueId, ct);
                    var bodyText = mimeMessage.TextBody ?? mimeMessage.HtmlBody ?? "";

                    var notification = new NewEmailNotification(
                        UserId: config.UserId,
                        ConfigId: config.Id.ToString(),
                        MessageId: (int)msg.UniqueId.Id,
                        From: msg.Envelope.From.ToString(),
                        Subject: msg.Envelope.Subject ?? "",
                        BodyText: bodyText
                    );
                    await _channelService.EnqueueAsync(notification, ct);
                    _logger.LogDebug(
                        "Enqueued new email for auto-labeling: UID={Uid}, From={From}, Subject={Subject}",
                        msg.UniqueId.Id, msg.Envelope.From, msg.Envelope.Subject);
                }
                catch (Exception ex)
                {
                    _logger.LogErrorWithSql(ex,
                        "Failed to fetch/enqueue message UID={Uid} for config {ConfigId}.",
                        msg.UniqueId.Id, config.Id);
                }
            }

            config.LastKnownUid = currentMax;
            config.LastCheckedAt = DateTime.UtcNow;
            await db.UpdateAsync(config);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Error processing new messages for config {ConfigId}.", config.Id);
        }
    }

    /// <summary>
    /// Calculate exponential backoff with jitter for reconnection.
    /// Base: 2^attempt seconds, capped at MaxReconnectBackoff, with ±25% jitter.
    /// </summary>
    private static TimeSpan CalculateBackoff(int attempt)
    {
        var baseSeconds = Math.Min(Math.Pow(2, attempt), MaxReconnectBackoff.TotalSeconds);
        var jitter = baseSeconds * 0.25 * (Random.Shared.NextDouble() * 2 - 1); // ±25%
        return TimeSpan.FromSeconds(Math.Max(1, baseSeconds + jitter));
    }
}
