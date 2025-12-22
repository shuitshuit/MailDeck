using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("web_push_subscriptions")]
public class WebPushSubscription
{
    [Name("id")]
    [Key]
    public string Id { get; set; } = string.Empty;

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("endpoint")]
    public string Endpoint { get; set; } = string.Empty;

    [Name("p256dh")]
    public string P256dh { get; set; } = string.Empty;

    [Name("auth")]
    public string Auth { get; set; } = string.Empty;

    [Name("user_agent")]
    public string UserAgent { get; set; } = string.Empty;

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
