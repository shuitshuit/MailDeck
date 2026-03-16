namespace MailDeck.Api.Models.DTO.Mail;

public class BulkMarkReadRequest
{
    public Guid ConfigId { get; set; }
    public List<string> MessageIds { get; set; } = new();
}
