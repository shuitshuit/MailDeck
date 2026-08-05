namespace MailDeck.Api.Models.DTO.ServerConfig;

public class ServerConfigResponse
{
    public Guid Id { get; set; }
    public string AccountName { get; set; } = string.Empty;

    // Authentication
    /// <summary>"password" or "oauth2".</summary>
    public string AuthType { get; set; } = Models.AuthTypes.Password;
    /// <summary>"google" for OAuth2 accounts, null otherwise.</summary>
    public string? OauthProvider { get; set; }
    /// <summary>True when the OAuth grant is gone and the user has to consent again.</summary>
    public bool NeedsReauthorization { get; set; }

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
        var isOAuth = entity.AuthType == Models.AuthTypes.OAuth2;

        return new ServerConfigResponse
        {
            Id = entity.Id,
            AccountName = entity.AccountName,
            AuthType = entity.AuthType,
            OauthProvider = entity.OauthProvider,
            NeedsReauthorization = isOAuth && string.IsNullOrEmpty(entity.OauthRefreshToken),
            ImapHost = entity.ImapHost,
            ImapPort = entity.ImapPort,
            ImapUsername = entity.ImapUsername,
            // OAuth2 accounts have no password at all, so there is nothing to mask.
            ImapPassword = isOAuth ? string.Empty : "*****",
            ImapSslEnabled = entity.ImapSslEnabled,
            SmtpHost = entity.SmtpHost,
            SmtpPort = entity.SmtpPort,
            SmtpUsername = entity.SmtpUsername,
            SmtpPassword = isOAuth ? string.Empty : "*****",
            SmtpSslEnabled = entity.SmtpSslEnabled,
            IsDefault = entity.IsDefault,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt
        };
    }
}
