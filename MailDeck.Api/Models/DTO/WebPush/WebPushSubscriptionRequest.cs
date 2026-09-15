namespace MailDeck.Api.Models.DTO.WebPush;

public class WebPushSubscriptionRequest
{
    public string Token { get; set; } = string.Empty;
    /// <summary>"web" or "android"</summary>
    public string Platform { get; set; } = "web";
    /// <summary>
    /// Client user agent, used together with (user_id, platform) to identify the
    /// physical device so a refreshed FCM token replaces the old row instead of
    /// creating a duplicate subscription that would notify the same device twice.
    /// </summary>
    public string? UserAgent { get; set; }
}
