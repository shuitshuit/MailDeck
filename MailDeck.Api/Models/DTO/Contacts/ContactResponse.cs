namespace MailDeck.Api.Models.DTO.Contacts;

public class ContactResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static ContactResponse FromEntity(Models.Contact entity)
    {
        return new ContactResponse
        {
            Id = entity.Id,
            Name = entity.Name,
            Email = entity.Email,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt
        };
    }
}
