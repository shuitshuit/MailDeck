using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("labels")]
public class Label
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("name")]
    public string Name { get; set; } = string.Empty;

    [Name("color")]
    public string Color { get; set; } = "#3B82F6"; // Default blue

    [Name("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
