using System.Collections.Concurrent;
using MailDeck.Api.Models;
using MailKit;
using MailKit.Security;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Services;

/// <summary>
/// Single entry point for opening an authenticated IMAP/SMTP session for a
/// <see cref="UserServerConfig"/>. Password accounts authenticate with the
/// KMS-decrypted password; OAuth2 accounts authenticate with XOAUTH2, refreshing
/// the access token transparently when it has expired.
/// </summary>
public interface IMailConnectionService
{
    /// <summary>Connects and authenticates <paramref name="client"/> against the account's IMAP server.</summary>
    Task ConnectImapAsync(MailService client, UserServerConfig config, CancellationToken ct = default);

    /// <summary>Connects and authenticates <paramref name="client"/> against the account's SMTP server.</summary>
    Task ConnectSmtpAsync(MailService client, UserServerConfig config, CancellationToken ct = default);

    /// <summary>Drops any cached access token for an account, e.g. after it was deleted.</summary>
    void InvalidateCachedToken(Guid configId);
}

public class MailConnectionService : IMailConnectionService
{
    /// <summary>Refresh a little before the real expiry so a long IMAP session does not die mid-way.</summary>
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(5);

    private readonly IEncryptionService _encryptionService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MailConnectionService> _logger;

    private readonly ConcurrentDictionary<Guid, CachedToken> _tokenCache = new();
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _refreshLocks = new();

    public MailConnectionService(
        IEncryptionService encryptionService,
        IServiceScopeFactory scopeFactory,
        ILogger<MailConnectionService> logger)
    {
        _encryptionService = encryptionService;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task ConnectImapAsync(MailService client, UserServerConfig config, CancellationToken ct = default)
    {
        await client.ConnectAsync(
            config.ImapHost,
            config.ImapPort,
            GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled),
            ct);

        await AuthenticateAsync(client, config, config.ImapUsername, config.ImapPassword, ct);
    }

    public async Task ConnectSmtpAsync(MailService client, UserServerConfig config, CancellationToken ct = default)
    {
        await client.ConnectAsync(
            config.SmtpHost,
            config.SmtpPort,
            GetSecureSocketOptions(config.SmtpPort, config.SmtpSslEnabled),
            ct);

        await AuthenticateAsync(client, config, config.SmtpUsername, config.SmtpPassword, ct);
    }

    public void InvalidateCachedToken(Guid configId)
    {
        _tokenCache.TryRemove(configId, out _);
        _refreshLocks.TryRemove(configId, out _);
    }

    /// <summary>
    /// 465 (SMTP) and 993 (IMAP) are implicit TLS; every other port negotiates STARTTLS.
    /// With SSL turned off we fall back to opportunistic encryption.
    /// </summary>
    public static SecureSocketOptions GetSecureSocketOptions(int port, bool sslEnabled)
    {
        if (!sslEnabled) return SecureSocketOptions.Auto;

        return port is 465 or 993
            ? SecureSocketOptions.SslOnConnect
            : SecureSocketOptions.StartTls;
    }

    private async Task AuthenticateAsync(
        MailService client,
        UserServerConfig config,
        string username,
        string encryptedPassword,
        CancellationToken ct)
    {
        if (!string.Equals(config.AuthType, AuthTypes.OAuth2, StringComparison.OrdinalIgnoreCase))
        {
            var password = await _encryptionService.DecryptAsync(encryptedPassword);
            await client.AuthenticateAsync(username, password, ct);
            return;
        }

        var accessToken = await GetAccessTokenAsync(config, ct);
        await client.AuthenticateAsync(new SaslMechanismOAuth2(username, accessToken), ct);
    }

    private async Task<string> GetAccessTokenAsync(UserServerConfig config, CancellationToken ct)
    {
        if (TryGetCachedToken(config.Id, out var cached)) return cached;

        var gate = _refreshLocks.GetOrAdd(config.Id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            // Another caller may have refreshed while we waited on the gate.
            if (TryGetCachedToken(config.Id, out cached)) return cached;

            // The token stored on the entity is still usable more often than not
            // (e.g. right after the account was authorized, or after a restart).
            if (!string.IsNullOrEmpty(config.OauthAccessToken) &&
                config.OauthTokenExpiresAt is { } storedExpiry &&
                ToUtc(storedExpiry) > DateTime.UtcNow.Add(ExpiryMargin))
            {
                var stored = await _encryptionService.DecryptAsync(config.OauthAccessToken);
                _tokenCache[config.Id] = new CachedToken(stored, ToUtc(storedExpiry));
                return stored;
            }

            return await RefreshAccessTokenAsync(config, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<string> RefreshAccessTokenAsync(UserServerConfig config, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(config.OauthRefreshToken))
        {
            throw new OAuthReauthorizationRequiredException(config.Id,
                $"Account {config.Id} has no OAuth refresh token stored; the user must authorize it again.");
        }

        if (!string.Equals(config.OauthProvider, OAuthProviders.Google, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Unsupported OAuth provider '{config.OauthProvider}' for account {config.Id}.");
        }

        var refreshToken = await _encryptionService.DecryptAsync(config.OauthRefreshToken);

        using var scope = _scopeFactory.CreateScope();
        var google = scope.ServiceProvider.GetRequiredService<IGoogleOAuthService>();

        OAuthTokenResult token;
        try
        {
            token = await google.RefreshAccessTokenAsync(refreshToken, ct);
        }
        catch (Exception ex)
        {
            // invalid_grant means the user revoked access or changed their password:
            // no amount of retrying will help, only a fresh consent will.
            throw new OAuthReauthorizationRequiredException(config.Id,
                $"Failed to refresh the OAuth access token for account {config.Id}.", ex);
        }

        var encryptedAccessToken = await _encryptionService.EncryptAsync(token.AccessToken);
        var encryptedRefreshToken = token.RefreshToken is null
            ? null
            : await _encryptionService.EncryptAsync(token.RefreshToken);

        config.OauthAccessToken = encryptedAccessToken;
        config.OauthTokenExpiresAt = token.ExpiresAtUtc;
        if (encryptedRefreshToken is not null) config.OauthRefreshToken = encryptedRefreshToken;

        await PersistTokenAsync(scope, config.Id, encryptedAccessToken, encryptedRefreshToken, token.ExpiresAtUtc, ct);

        _tokenCache[config.Id] = new CachedToken(token.AccessToken, token.ExpiresAtUtc);
        _logger.LogInformation("Refreshed OAuth access token for account {ConfigId}", config.Id);

        return token.AccessToken;
    }

    /// <summary>
    /// Writes the new tokens against a freshly loaded row so we do not overwrite
    /// unrelated fields the caller's copy may have gone stale on.
    /// </summary>
    private async Task PersistTokenAsync(
        IServiceScope scope,
        Guid configId,
        string encryptedAccessToken,
        string? encryptedRefreshToken,
        DateTime expiresAtUtc,
        CancellationToken ct)
    {
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
            await db.OpenAsync();

            var current = await db.GetAsync<UserServerConfig>(configId);
            if (current is null) return;

            current.OauthAccessToken = encryptedAccessToken;
            current.OauthTokenExpiresAt = expiresAtUtc;
            if (encryptedRefreshToken is not null) current.OauthRefreshToken = encryptedRefreshToken;
            current.UpdatedAt = DateTime.UtcNow;

            await db.UpdateAsync(current);
        }
        catch (Exception ex)
        {
            // The token is valid in memory, so the caller can still connect; we just
            // lose the cache across restarts.
            _logger.LogWarning(ex, "Failed to persist refreshed OAuth token for account {ConfigId}", configId);
        }
    }

    private bool TryGetCachedToken(Guid configId, out string accessToken)
    {
        if (_tokenCache.TryGetValue(configId, out var cached) &&
            cached.ExpiresAtUtc > DateTime.UtcNow.Add(ExpiryMargin))
        {
            accessToken = cached.AccessToken;
            return true;
        }

        accessToken = string.Empty;
        return false;
    }

    /// <summary>
    /// Npgsql's legacy timestamp behaviour hands back timestamptz values as local
    /// time; anything we wrote ourselves is UTC.
    /// </summary>
    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };

    private record CachedToken(string AccessToken, DateTime ExpiresAtUtc);
}
