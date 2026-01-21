namespace MailDeck.Api.Models.DTO.Labels;

public class LabelDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#3B82F6";
    public bool HideFromInbox { get; set; } = false;
    public bool NotifyEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static LabelDetailResponse FromEntity(Models.Label entity)
    {
        return new LabelDetailResponse
        {
            Id = entity.Id,
            Name = entity.Name,
            Color = entity.Color,
            HideFromInbox = entity.HideFromInbox,
            NotifyEnabled = entity.NotifyEnabled,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt
        };
    }
}
