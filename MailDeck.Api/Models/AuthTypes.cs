namespace MailDeck.Api.Models;

/// <summary>
/// Values allowed in <see cref="UserServerConfig.AuthType"/>.
/// Mirrors the chk_user_server_configs_auth_type constraint.
/// </summary>
public static class AuthTypes
{
    public const string Password = "password";
    public const string OAuth2 = "oauth2";
}

/// <summary>
/// Values allowed in <see cref="UserServerConfig.OauthProvider"/>.
/// </summary>
public static class OAuthProviders
{
    public const string Google = "google";
}
