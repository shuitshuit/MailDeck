namespace MailDeck.Api.Models.DTO.Mail;

public class SendMailFormRequest
{
    public string To { get; set; } = string.Empty;
    public string? Cc { get; set; }
    public string? Bcc { get; set; }
    public string? ReplyTo { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool IsHtml { get; set; } = false;
    public Guid ConfigId { get; set; }
    public IFormFileCollection? Attachments { get; set; }
}
