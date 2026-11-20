using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Services;

/// <summary>
/// The user has no usable Google Calendar / Tasks grant: never connected, revoked on
/// Google's side, or missing a scope. Only a fresh consent fixes it.
/// </summary>
public class GoogleIntegrationRequiredException : Exception
{
    public GoogleIntegrationRequiredException(string message, Exception? inner = null) : base(message, inner) { }
}

public interface IGoogleIntegrationAccessService
{
    /// <summary>Returns a valid access token, refreshing it when it is about to expire.</summary>
    /// <exception cref="GoogleIntegrationRequiredException">No usable grant exists.</exception>
    Task<string> GetAccessTokenAsync(string userId, CancellationToken ct = default);

    /// <summary>Removes the grant, e.g. after Google reported it as no longer valid.</summary>
    Task RemoveAsync(string userId);
}

/// <summary>
/// Access tokens for user_google_integrations. Scoped (it holds the request's
/// PostgreSqlConnect); calendar registration is user-initiated and infrequent, so the
/// token is read from the database each time instead of being cached in memory.
/// </summary>
public class GoogleIntegrationAccessService : IGoogleIntegrationAccessService
{
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(5);

    private readonly PostgreSqlConnect _db;
    private readonly IGoogleOAuthService _google;
    private readonly IEncryptionService _encryptionService;
    private readonly ILogger<GoogleIntegrationAccessService> _logger;

    public GoogleIntegrationAccessService(
        PostgreSqlConnect db,
        IGoogleOAuthService google,
        IEncryptionService encryptionService,
        ILogger<GoogleIntegrationAccessService> logger)
    {
        _db = db;
        _google = google;
        _encryptionService = encryptionService;
        _logger = logger;
    }

    public async Task<string> GetAccessTokenAsync(string userId, CancellationToken ct = default)
    {
        await _db.OpenAsync();
        var integration = await _db.GetAsync<UserGoogleIntegration>(userId)
            ?? throw new GoogleIntegrationRequiredException("Google Calendar / Tasks is not connected.");

        if (!string.IsNullOrEmpty(integration.AccessToken)
            && integration.TokenExpiresAt is { } expiresAt
            && expiresAt - ExpiryMargin > DateTime.UtcNow)
        {
            return await _encryptionService.DecryptAsync(integration.AccessToken);
        }

        var refreshToken = await _encryptionService.DecryptAsync(integration.RefreshToken);

        OAuthTokenResult token;
        try
        {
            token = await _google.RefreshAccessTokenAsync(refreshToken, ct);
        }
        catch (OAuthInvalidGrantException ex)
        {
            // Revoked or expired grant: keep nothing around that pretends to be connected.
            await RemoveAsync(userId);
            throw new GoogleIntegrationRequiredException("Google grant is no longer valid (invalid_grant).", ex);
        }

        integration.AccessToken = await _encryptionService.EncryptAsync(token.AccessToken);
        integration.TokenExpiresAt = token.ExpiresAtUtc;
        if (token.RefreshToken is not null)
        {
            integration.RefreshToken = await _encryptionService.EncryptAsync(token.RefreshToken);
        }
        integration.UpdatedAt = DateTime.UtcNow;

        await _db.UpdateAsync(integration);
        _logger.LogInformation("Refreshed Google integration access token for user {UserId}", userId);

        return token.AccessToken;
    }

    public async Task RemoveAsync(string userId)
    {
        await _db.OpenAsync();
        var integration = await _db.GetAsync<UserGoogleIntegration>(userId);
        if (integration is not null)
        {
            await _db.DeleteAsync(integration);
        }
    }
}
