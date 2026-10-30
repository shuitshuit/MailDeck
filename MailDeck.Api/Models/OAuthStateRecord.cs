using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("oauth_states")]
public class OAuthStateRecord
{
    [Name("state")]
    [Key]
    public string State { get; set; } = string.Empty;
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;
    [Name("provider")]
    public string Provider { get; set; } = string.Empty;
    [Name("redirect_uri")]
    public string RedirectUri { get; set; } = string.Empty;
    [Name("config_id")]
    public Guid? ConfigId { get; set; }
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
    [Name("expires_at")]
    public DateTime ExpiresAt { get; set; }
}
