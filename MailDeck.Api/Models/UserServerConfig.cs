using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

[Name("user_server_configs")]
public class UserServerConfig
{
    [Name("id")]
    [Key]
    public string Id { get; set; } = string.Empty;
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;
    [Name("account_name")]
    public string AccountName { get; set; } = string.Empty;

    // IMAP
    [Name("imap_host")]
    public string ImapHost { get; set; } = string.Empty;
    [Name("imap_port")]
    public int ImapPort { get; set; }
    [Name("imap_username")]
    public string ImapUsername { get; set; } = string.Empty;
    [Name("imap_password")]
    public string ImapPassword { get; set; } = string.Empty; // Encrypted
    [Name("imap_ssl_enabled")]
    public bool ImapSslEnabled { get; set; } = true;

    // SMTP
    [Name("smtp_host")]
    public string SmtpHost { get; set; } = string.Empty;
    [Name("smtp_port")]
    public int SmtpPort { get; set; }
    [Name("smtp_username")]
    public string SmtpUsername { get; set; } = string.Empty;
    [Name("smtp_password")]
    public string SmtpPassword { get; set; } = string.Empty; // Encrypted
    [Name("smtp_ssl_enabled")]
    public bool SmtpSslEnabled { get; set; } = true;

    [Name("is_default")]
    public bool IsDefault { get; set; }
    
    [Name("last_known_uid")]
    public long LastKnownUid { get; set; }
    
    [Name("last_checked_at")]
    public DateTime? LastCheckedAt { get; set; }

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}

