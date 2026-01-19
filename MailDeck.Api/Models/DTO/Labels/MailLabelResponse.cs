namespace MailDeck.Api.Models.DTO.Labels;

public class MailLabelResponse
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public int MessageId { get; set; }
    public Guid LabelId { get; set; }
    public Guid ServerConfigId { get; set; }
    public DateTime CreatedAt { get; set; }

    public static MailLabelResponse FromEntity(Models.MailLabel entity)
    {
        return new MailLabelResponse
        {
            Id = entity.Id,
            UserId = entity.UserId,
            MessageId = entity.MessageId,
            LabelId = entity.LabelId,
            ServerConfigId = entity.ServerConfigId,
            CreatedAt = entity.CreatedAt
        };
    }
}
