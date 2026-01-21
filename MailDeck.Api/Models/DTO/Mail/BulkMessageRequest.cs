namespace MailDeck.Api.Models.DTO.Mail;

public class BulkMessageRequest
{
    public Guid ConfigId { get; set; }
    public List<int> MessageIds { get; set; } = new();
    public string? SourceFolder { get; set; } // Optional: defaults to INBOX if not specified
}
