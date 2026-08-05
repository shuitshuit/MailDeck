namespace MailDeck.Api.Services;

/// <summary>
/// Tokens returned by Google's OAuth2 token endpoint.
/// <paramref name="RefreshToken"/> is only present on the initial code exchange
/// (Google omits it when refreshing an existing grant).
/// </summary>
public record OAuthTokenResult(string AccessToken, string? RefreshToken, DateTime ExpiresAtUtc);

/// <summary>
/// Thrown when an OAuth2 account can no longer obtain an access token and the
/// user has to go through the consent screen again.
/// </summary>
public class OAuthReauthorizationRequiredException : Exception
{
    public Guid ConfigId { get; }

    public OAuthReauthorizationRequiredException(Guid configId, string message, Exception? inner = null)
        : base(message, inner)
    {
        ConfigId = configId;
    }
}

/// <summary>
/// Authorization-code flow against Google, used to obtain XOAUTH2 tokens for
/// Gmail's IMAP/SMTP endpoints.
/// </summary>
public interface IGoogleOAuthService
{
    /// <summary>False when no client id/secret is configured, so the UI can hide the button.</summary>
    bool IsConfigured { get; }

    /// <summary>Redirect URI from configuration, or null when it should be derived from the request.</summary>
    string? ConfiguredRedirectUri { get; }

    string BuildAuthorizationUrl(string state, string redirectUri, string? loginHint = null);

    Task<OAuthTokenResult> ExchangeCodeAsync(string code, string redirectUri, CancellationToken ct = default);

    Task<OAuthTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct = default);

    /// <summary>Reads the mailbox address the tokens were granted for.</summary>
    Task<string> GetEmailAddressAsync(string accessToken, CancellationToken ct = default);

    /// <summary>Best-effort revocation; never throws.</summary>
    Task RevokeAsync(string token, CancellationToken ct = default);
}
