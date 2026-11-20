using System.ComponentModel.DataAnnotations;

namespace MailDeck.Api.Models.DTO.MailLinks;

public class CreateMailLinkRequest
{
    [Required]
    public Guid ConfigId { get; set; }

    /// <summary>Message-ID header of the mail, as returned by /api/mail/message/{id}.</summary>
    [Required]
    [MaxLength(998)]
    public string MessageIdHeader { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Subject { get; set; }
}

public class MailLinkResponse
{
    public Guid Id { get; set; }

    /// <summary>
    /// Absolute link when Frontend:Url is configured; otherwise null and the client
    /// builds it from its own origin.
    /// </summary>
    public string? Url { get; set; }
}

public class ResolvedMailLinkResponse
{
    public Guid ConfigId { get; set; }

    /// <summary>Current IMAP UID of the mail in INBOX.</summary>
    public uint MessageId { get; set; }

    public string? Subject { get; set; }
}
