namespace MailDeck.Api.Models.DTO.Mail;

public class AttachmentInfoResponse
{
    public int PartIndex { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}
