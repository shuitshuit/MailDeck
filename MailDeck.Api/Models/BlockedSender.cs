using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("blocked_senders")]
public class BlockedSender
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("email_address")]
    public string EmailAddress { get; set; } = string.Empty;

    [Name("note")]
    public string? Note { get; set; }

    [Name("is_enabled")]
    public bool IsEnabled { get; set; } = true;

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
