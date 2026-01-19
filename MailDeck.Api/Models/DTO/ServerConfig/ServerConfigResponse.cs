namespace MailDeck.Api.Models.DTO.ServerConfig;

public class ServerConfigResponse
{
    public Guid Id { get; set; }
    public string AccountName { get; set; } = string.Empty;

    // IMAP
    public string ImapHost { get; set; } = string.Empty;
    public int ImapPort { get; set; }
    public string ImapUsername { get; set; } = string.Empty;
    public string ImapPassword { get; set; } = "*****"; // Always masked
    public bool ImapSslEnabled { get; set; }

    // SMTP
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; }
    public string SmtpUsername { get; set; } = string.Empty;
    public string SmtpPassword { get; set; } = "*****"; // Always masked
    public bool SmtpSslEnabled { get; set; }

    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static ServerConfigResponse FromEntity(Models.UserServerConfig entity)
    {
        return new ServerConfigResponse
        {
            Id = entity.Id,
            AccountName = entity.AccountName,
            ImapHost = entity.ImapHost,
            ImapPort = entity.ImapPort,
            ImapUsername = entity.ImapUsername,
            ImapPassword = "*****",
            ImapSslEnabled = entity.ImapSslEnabled,
            SmtpHost = entity.SmtpHost,
            SmtpPort = entity.SmtpPort,
            SmtpUsername = entity.SmtpUsername,
            SmtpPassword = "*****",
            SmtpSslEnabled = entity.SmtpSslEnabled,
            IsDefault = entity.IsDefault,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt
        };
    }
}
