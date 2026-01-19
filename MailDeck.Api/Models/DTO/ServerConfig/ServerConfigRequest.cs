namespace MailDeck.Api.Models.DTO.ServerConfig;

public class ServerConfigRequest
{
    public string AccountName { get; set; } = string.Empty;

    // IMAP
    public string ImapHost { get; set; } = string.Empty;
    public int ImapPort { get; set; }
    public string ImapUsername { get; set; } = string.Empty;
    public string ImapPassword { get; set; } = string.Empty;
    public bool ImapSslEnabled { get; set; } = true;

    // SMTP
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; }
    public string SmtpUsername { get; set; } = string.Empty;
    public string SmtpPassword { get; set; } = string.Empty;
    public bool SmtpSslEnabled { get; set; } = true;

    public bool IsDefault { get; set; }
}
