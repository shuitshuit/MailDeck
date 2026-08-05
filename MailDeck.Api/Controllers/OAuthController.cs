using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.OAuth;
using MailDeck.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Controllers;

/// <summary>
/// OAuth2 authorization-code flow for mail accounts that authenticate with
/// XOAUTH2 instead of a password (Gmail).
/// </summary>
[ApiController]
[Route("api/oauth")]
[Produces("application/json")]
public class OAuthController : BaseAuthController
{
    /// <summary>Gmail's IMAP/SMTP endpoints; filled in automatically after consent.</summary>
    private static readonly MailServerSettings GoogleMailServers = new(
        ImapHost: "imap.gmail.com", ImapPort: 993,
        SmtpHost: "smtp.gmail.com", SmtpPort: 465);

    private readonly PostgreSqlConnect _db;
    private readonly IGoogleOAuthService _google;
    private readonly IOAuthStateStore _stateStore;
    private readonly IEncryptionService _encryptionService;
    private readonly IMailConnectionService _mailConnection;
    private readonly IConfiguration _configuration;

    public OAuthController(
        ILogger<OAuthController> logger,
        PostgreSqlConnect db,
        IGoogleOAuthService google,
        IOAuthStateStore stateStore,
        IEncryptionService encryptionService,
        IMailConnectionService mailConnection,
        IConfiguration configuration)
        : base(logger)
    {
        _db = db;
        _google = google;
        _stateStore = stateStore;
        _encryptionService = encryptionService;
        _mailConnection = mailConnection;
        _configuration = configuration;
    }

    /// <summary>
    /// Which OAuth providers this deployment has credentials for, so the UI can
    /// hide the buttons it cannot use.
    /// </summary>
    [HttpGet("providers")]
    [ProducesResponseType(typeof(OAuthProvidersResponse), StatusCodes.Status200OK)]
    public IActionResult GetProviders()
    {
        return Ok(new OAuthProvidersResponse { Google = _google.IsConfigured });
    }

    /// <summary>
    /// Starts the Google consent flow and returns the URL the browser has to visit.
    /// Pass <c>configId</c> to re-authorize an account whose refresh token stopped working.
    /// </summary>
    [HttpPost("google/authorize")]
    [ProducesResponseType(typeof(OAuthAuthorizeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> StartGoogleAuthorization(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] OAuthAuthorizeRequest? request)
    {
        var userId = GetUserId();

        if (!_google.IsConfigured)
        {
            return BadRequest("Google OAuth is not configured on this server.");
        }

        var loginHint = request?.LoginHint;
        Guid? configId = null;

        if (!string.IsNullOrWhiteSpace(request?.ConfigId))
        {
            if (!Guid.TryParse(request.ConfigId, out var parsed))
            {
                return BadRequest("Invalid configId.");
            }

            await _db.OpenAsync();
            var existing = await _db.GetAsync<UserServerConfig>(parsed);
            if (existing is null || existing.UserId != userId) return NotFound();

            configId = parsed;
            loginHint ??= existing.ImapUsername;
        }

        var redirectUri = ResolveGoogleRedirectUri();
        var state = _stateStore.Create(new OAuthState(userId, OAuthProviders.Google, redirectUri, configId));

        return Ok(new OAuthAuthorizeResponse
        {
            AuthorizationUrl = _google.BuildAuthorizationUrl(state, redirectUri, loginHint)
        });
    }

    /// <summary>
    /// Google redirects the browser here after consent. There is no bearer token on
    /// this request, so the user is identified through the single-use state value.
    /// </summary>
    [HttpGet("google/callback")]
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> GoogleCallback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(error))
        {
            _logger.LogInformation("Google OAuth consent was not granted: {Error}", error);
            return RedirectToFrontend("error", error);
        }

        var pending = string.IsNullOrEmpty(state) ? null : _stateStore.Consume(state);
        if (pending is null)
        {
            _logger.LogWarning("Google OAuth callback carried an unknown or expired state value");
            return RedirectToFrontend("error", "invalid_state");
        }

        if (string.IsNullOrEmpty(code))
        {
            return RedirectToFrontend("error", "missing_code");
        }

        try
        {
            var token = await _google.ExchangeCodeAsync(code, pending.RedirectUri, ct);
            if (token.RefreshToken is null)
            {
                // Without a refresh token the account would stop working in an hour.
                _logger.LogError("Google did not return a refresh token for user {UserId}", pending.UserId);
                return RedirectToFrontend("error", "no_refresh_token");
            }

            var email = await _google.GetEmailAddressAsync(token.AccessToken, ct);
            await SaveGoogleAccountAsync(pending, email, token);

            return RedirectToFrontend("success", email);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to complete Google OAuth for user {UserId}", pending.UserId);
            return RedirectToFrontend("error", "exchange_failed");
        }
    }

    /// <summary>
    /// Creates the mail account for the authorized mailbox, or refreshes the tokens
    /// of the account that already represents it.
    /// </summary>
    private async Task SaveGoogleAccountAsync(OAuthState pending, string email, OAuthTokenResult token)
    {
        var encryptedAccessToken = await _encryptionService.EncryptAsync(token.AccessToken);
        var encryptedRefreshToken = await _encryptionService.EncryptAsync(token.RefreshToken!);

        await _db.OpenAsync();

        var existing = pending.ConfigId is { } configId
            ? await _db.GetAsync<UserServerConfig>(configId)
            : (await _db.GetMultipleAsync<UserServerConfig>(new
            {
                user_id = pending.UserId,
                oauth_provider = OAuthProviders.Google,
                imap_username = email
            })).FirstOrDefault();

        if (existing is not null && existing.UserId == pending.UserId)
        {
            existing.AuthType = AuthTypes.OAuth2;
            existing.OauthProvider = OAuthProviders.Google;
            existing.OauthRefreshToken = encryptedRefreshToken;
            existing.OauthAccessToken = encryptedAccessToken;
            existing.OauthTokenExpiresAt = token.ExpiresAtUtc;
            existing.ImapUsername = email;
            existing.SmtpUsername = email;
            existing.UpdatedAt = DateTime.UtcNow;

            await _db.UpdateAsync(existing);
            // The in-memory cache still holds the token of the previous grant.
            _mailConnection.InvalidateCachedToken(existing.Id);

            _logger.LogInformation("Re-authorized Google account {ConfigId} for user {UserId}", existing.Id, pending.UserId);
            return;
        }

        var accounts = await _db.GetMultipleAsync<UserServerConfig>(new { user_id = pending.UserId });

        var config = new UserServerConfig
        {
            Id = Guid.NewGuid(),
            UserId = pending.UserId,
            AccountName = email,
            AuthType = AuthTypes.OAuth2,
            OauthProvider = OAuthProviders.Google,
            OauthRefreshToken = encryptedRefreshToken,
            OauthAccessToken = encryptedAccessToken,
            OauthTokenExpiresAt = token.ExpiresAtUtc,
            ImapHost = GoogleMailServers.ImapHost,
            ImapPort = GoogleMailServers.ImapPort,
            ImapUsername = email,
            ImapPassword = string.Empty,
            ImapSslEnabled = true,
            SmtpHost = GoogleMailServers.SmtpHost,
            SmtpPort = GoogleMailServers.SmtpPort,
            SmtpUsername = email,
            SmtpPassword = string.Empty,
            SmtpSslEnabled = true,
            IsDefault = !accounts.Any(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _db.InsertAsync(config);

        _logger.LogInformation("Added Google account {ConfigId} for user {UserId}", config.Id, pending.UserId);
    }

    /// <summary>
    /// The redirect_uri has to match the one registered in the Google Cloud console
    /// exactly; behind a tunnel the request host is not always what the browser saw,
    /// so configuration wins over the derived value.
    /// </summary>
    private string ResolveGoogleRedirectUri()
    {
        var configured = _google.ConfiguredRedirectUri;
        return string.IsNullOrWhiteSpace(configured)
            ? $"{Request.Scheme}://{Request.Host}/api/oauth/google/callback"
            : configured;
    }

    private IActionResult RedirectToFrontend(string status, string? detail)
    {
        var query = $"?oauth={Uri.EscapeDataString(status)}";
        if (!string.IsNullOrEmpty(detail))
        {
            query += $"&detail={Uri.EscapeDataString(detail)}";
        }

        var baseUrl = _configuration["Frontend:Url"]?.TrimEnd('/');
        var target = string.IsNullOrEmpty(baseUrl) ? $"/settings{query}" : $"{baseUrl}/settings{query}";

        return Redirect(target);
    }

    private record MailServerSettings(string ImapHost, int ImapPort, string SmtpHost, int SmtpPort);
}
