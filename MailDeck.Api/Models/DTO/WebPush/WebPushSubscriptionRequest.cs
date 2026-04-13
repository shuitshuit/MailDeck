namespace MailDeck.Api.Models.DTO.WebPush;

public class WebPushSubscriptionRequest
{
    public string Token { get; set; } = string.Empty;
    /// <summary>"web" or "android"</summary>
    public string Platform { get; set; } = "web";
}
