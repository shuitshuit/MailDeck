namespace MailDeck.Api.Models.DTO.Mail;

public class EmailRequest
{
    public string To { get; set; } = string.Empty;
    public string Cc { get; set; } = string.Empty;
    public string Bcc { get; set; } = string.Empty;
    public string ReplyTo { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public Guid ConfigId { get; set; }
}
