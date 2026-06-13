namespace MailDeck.Api.Models.DTO.Mail;

public class ThreadMessageSummaryResponse
{
    public uint Id { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Cc { get; set; } = string.Empty;
    public DateTimeOffset Date { get; set; }
    public bool IsRead { get; set; }
    public string? MessageId { get; set; }
    public string? InReplyTo { get; set; }
    public string ThreadKey { get; set; } = string.Empty;
}
