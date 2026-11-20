using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Durable link to a mail. Stores the Message-ID header rather than the IMAP UID,
/// because the UID changes when the message is moved or UIDVALIDITY is reset.
/// </summary>
[Name("mail_links")]
public class MailLink
{
    [Name("id")]
    [Key]
    public Guid Id { get; set; }
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;
    [Name("config_id")]
    public Guid ConfigId { get; set; }
    [Name("message_id_header")]
    public string MessageIdHeader { get; set; } = string.Empty;
    [Name("subject")]
    public string? Subject { get; set; }
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
}
