using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("contacts")]
public class Contact
{
    [Key]
    [Name("id")]
    public int Id { get; set; }

    [Name("name")]
    public string Name { get; set; } = string.Empty;

    [Name("email")]
    public string Email { get; set; } = string.Empty;

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
