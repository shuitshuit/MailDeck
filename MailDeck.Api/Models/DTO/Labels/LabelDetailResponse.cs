namespace MailDeck.Api.Models.DTO.Labels;

public class LabelDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#3B82F6";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static LabelDetailResponse FromEntity(Models.Label entity)
    {
        return new LabelDetailResponse
        {
            Id = entity.Id,
            Name = entity.Name,
            Color = entity.Color,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt
        };
    }
}
