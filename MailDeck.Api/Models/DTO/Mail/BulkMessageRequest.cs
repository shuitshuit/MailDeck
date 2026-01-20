namespace MailDeck.Api.Models.DTO.Mail;

public class BulkMessageRequest
{
    public Guid ConfigId { get; set; }
    public List<int> MessageIds { get; set; } = new();
}
