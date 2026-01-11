using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("mail_labels")]
public class MailLabel
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("message_id")]
    public string MessageId { get; set; } = string.Empty;

    [Name("label_id")]
    public Guid LabelId { get; set; }

    [Name("server_config_id")]
    public Guid ServerConfigId { get; set; }

    [Name("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
