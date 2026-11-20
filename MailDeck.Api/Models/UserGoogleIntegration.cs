using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Google Calendar / Tasks grant of a user. Independent of the Gmail mail accounts.
/// </summary>
[Name("user_google_integrations")]
public class UserGoogleIntegration
{
    [Name("user_id")]
    [Key]
    public string UserId { get; set; } = string.Empty;
    [Name("google_email")]
    public string GoogleEmail { get; set; } = string.Empty;
    [Name("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty; // Encrypted
    [Name("access_token")]
    public string? AccessToken { get; set; } // Encrypted
    [Name("token_expires_at")]
    public DateTime? TokenExpiresAt { get; set; }
    [Name("scopes")]
    public string Scopes { get; set; } = string.Empty;
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
