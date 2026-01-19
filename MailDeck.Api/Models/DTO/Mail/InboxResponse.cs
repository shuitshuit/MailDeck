namespace MailDeck.Api.Models.DTO.Mail;

public class InboxResponse
{
    public List<MailMessageResponse> Messages { get; set; } = new();
    public int Total { get; set; }
}
