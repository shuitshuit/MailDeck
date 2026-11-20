namespace MailDeck.Api.Models.DTO.Mail;

public class MailMessageDetailResponse
{
    public string Id { get; set; } = string.Empty;
    /// <summary>RFC 5322 Message-ID (without angle brackets); used for durable mail links.</summary>
    public string? MessageIdHeader { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Cc { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string? BodyHtml { get; set; }
    public string? BodyText { get; set; }
    public string? ListUnsubscribeUrl { get; set; }
    public string? ListUnsubscribeMailto { get; set; }
    public bool ListUnsubscribeOneClick { get; set; }
    public List<AttachmentInfoResponse> Attachments { get; set; } = new();
}
