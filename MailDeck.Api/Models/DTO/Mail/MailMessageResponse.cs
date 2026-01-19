namespace MailDeck.Api.Models.DTO.Mail;

public class MailMessageResponse
{
    public uint Id { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public DateTimeOffset Date { get; set; }
    public bool IsRead { get; set; }
    public List<LabelResponse> Labels { get; set; } = new();
}

public class LabelResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#3B82F6";
}
