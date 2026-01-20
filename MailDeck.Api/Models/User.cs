using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("users")]
public class User
{
    [Key]
    [Name("id")]
    public string Id { get; set; } = string.Empty;

    [Name("email")]
    public string Email { get; set; } = string.Empty;

    [Name("settings")]
    [Jsonb]
    public UserSettings Settings { get; set; } = new();

    [Name("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
