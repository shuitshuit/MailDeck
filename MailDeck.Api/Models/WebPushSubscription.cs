using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("web_push_subscriptions")]
public class WebPushSubscription
{
    [Name("id")]
    [Key]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("token")]
    public string Token { get; set; } = string.Empty;

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
