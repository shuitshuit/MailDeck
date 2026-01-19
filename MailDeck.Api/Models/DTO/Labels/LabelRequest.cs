namespace MailDeck.Api.Models.DTO.Labels;

public class LabelRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
}
