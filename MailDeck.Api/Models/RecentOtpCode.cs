using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents a recently received OTP code (30-minute temporary storage).
/// Used to provide quick access to recent codes without re-scanning emails.
/// </summary>
[Name("recent_otp_codes")]
public class RecentOtpCode
{
    /// <summary>
    /// Unique code identifier (UUID)
    /// </summary>
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    /// <summary>
    /// User ID who received this code (Cognito sub)
    /// </summary>
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// The OTP code value
    /// </summary>
    [Name("code")]
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Name of the pattern that detected this code
    /// </summary>
    [Name("pattern_name")]
    public string? PatternName { get; set; }

    /// <summary>
    /// Sender email address
    /// </summary>
    [Name("source_email")]
    public string? SourceEmail { get; set; }

    /// <summary>
    /// Email subject for context
    /// </summary>
    [Name("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// Expiration time (30 minutes from creation)
    /// </summary>
    [Name("expires_at")]
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// Timestamp when this code was received
    /// </summary>
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
}
