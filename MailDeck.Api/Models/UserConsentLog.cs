using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("user_consent_logs")]
public class UserConsentLog
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("consent_type")]
    public string ConsentType { get; set; } = string.Empty;

    [Name("consent_version")]
    public string ConsentVersion { get; set; } = string.Empty;

    [Name("consented_at")]
    public DateTime ConsentedAt { get; set; } = DateTime.UtcNow;

    [Name("ip_address")]
    public string? IpAddress { get; set; }

    [Name("user_agent")]
    public string? UserAgent { get; set; }
}
