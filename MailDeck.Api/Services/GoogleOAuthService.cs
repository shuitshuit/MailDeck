using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MailDeck.Api.Services;

/// <summary>
/// Google OAuth2 authorization-code flow.
/// The https://mail.google.com/ scope is what Gmail requires for IMAP/SMTP XOAUTH2;
/// userinfo.email is only used to learn which mailbox the user consented with.
/// </summary>
public class GoogleOAuthService : IGoogleOAuthService
{
    private const string AuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string RevokeEndpoint = "https://oauth2.googleapis.com/revoke";
    private const string UserInfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo";

    private const string Scopes = "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email";

    private readonly HttpClient _httpClient;
    private readonly ILogger<GoogleOAuthService> _logger;
    private readonly string? _clientId;
    private readonly string? _clientSecret;

    public GoogleOAuthService(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleOAuthService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _clientId = configuration["OAuth:Google:ClientId"];
        _clientSecret = configuration["OAuth:Google:ClientSecret"];
        ConfiguredRedirectUri = configuration["OAuth:Google:RedirectUri"];
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_clientId) && !string.IsNullOrWhiteSpace(_clientSecret);

    public string? ConfiguredRedirectUri { get; }

    public string BuildAuthorizationUrl(string state, string redirectUri, string? loginHint = null)
    {
        EnsureConfigured();

        var query = new Dictionary<string, string>
        {
            ["client_id"] = _clientId!,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["scope"] = Scopes,
            ["state"] = state,
            // offline + consent guarantees a refresh token even when the user has
            // already granted access to this client before.
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["include_granted_scopes"] = "true"
        };

        if (!string.IsNullOrWhiteSpace(loginHint))
        {
            query["login_hint"] = loginHint;
        }

        var encoded = string.Join('&', query.Select(kv =>
            $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));

        return $"{AuthorizationEndpoint}?{encoded}";
    }

    public Task<OAuthTokenResult> ExchangeCodeAsync(string code, string redirectUri, CancellationToken ct = default)
    {
        EnsureConfigured();

        return RequestTokenAsync(new Dictionary<string, string>
        {
            ["client_id"] = _clientId!,
            ["client_secret"] = _clientSecret!,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = redirectUri
        }, ct);
    }

    public Task<OAuthTokenResult> RefreshAccessTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        EnsureConfigured();

        return RequestTokenAsync(new Dictionary<string, string>
        {
            ["client_id"] = _clientId!,
            ["client_secret"] = _clientSecret!,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token"
        }, ct);
    }

    public async Task<string> GetEmailAddressAsync(string accessToken, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, UserInfoEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Google userinfo request failed ({(int)response.StatusCode}): {body}");
        }

        var email = JsonSerializer.Deserialize<GoogleUserInfo>(body)?.Email;
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new InvalidOperationException("Google userinfo response did not contain an email address.");
        }

        return email;
    }

    public async Task RevokeAsync(string token, CancellationToken ct = default)
    {
        try
        {
            using var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token });
            using var response = await _httpClient.PostAsync(RevokeEndpoint, content, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google token revocation returned {StatusCode}", (int)response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            // Revocation is a courtesy to Google; losing it must not fail account deletion.
            _logger.LogWarning(ex, "Failed to revoke Google OAuth token");
        }
    }

    private async Task<OAuthTokenResult> RequestTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        using var content = new FormUrlEncodedContent(form);
        using var response = await _httpClient.PostAsync(TokenEndpoint, content, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            // The body carries Google's error code (invalid_grant when the user revoked
            // access), but it can also echo back request parameters, so keep it out of logs.
            var error = JsonSerializer.Deserialize<GoogleTokenError>(body);
            throw new InvalidOperationException(
                $"Google token request failed ({(int)response.StatusCode}): {error?.Error ?? "unknown_error"}");
        }

        var token = JsonSerializer.Deserialize<GoogleTokenResponse>(body);
        if (token is null || string.IsNullOrWhiteSpace(token.AccessToken))
        {
            throw new InvalidOperationException("Google token response did not contain an access token.");
        }

        return new OAuthTokenResult(
            token.AccessToken,
            string.IsNullOrWhiteSpace(token.RefreshToken) ? null : token.RefreshToken,
            DateTime.UtcNow.AddSeconds(token.ExpiresIn > 0 ? token.ExpiresIn : 3600));
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "Google OAuth is not configured. Set OAuth:Google:ClientId and OAuth:Google:ClientSecret.");
        }
    }

    internal sealed class GoogleTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }

        [JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }
    }

    internal sealed class GoogleTokenError
    {
        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }

    internal sealed class GoogleUserInfo
    {
        [JsonPropertyName("email")]
        public string? Email { get; set; }
    }
}
