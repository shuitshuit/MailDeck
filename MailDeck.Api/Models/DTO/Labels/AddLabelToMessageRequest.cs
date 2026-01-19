namespace MailDeck.Api.Models.DTO.Labels;

public class AddLabelToMessageRequest
{
    public int MessageId { get; set; }
    public string LabelId { get; set; } = string.Empty;
    public string ServerConfigId { get; set; } = string.Empty;
}
