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

    /// <summary>"web" or "android"</summary>
    [Name("platform")]
    public string Platform { get; set; } = "web";

    /// <summary>
    /// Client user agent. With (user_id, platform) it identifies the physical device,
    /// so a refreshed FCM token updates this row instead of adding a duplicate.
    /// </summary>
    [Name("user_agent")]
    public string? UserAgent { get; set; }

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
