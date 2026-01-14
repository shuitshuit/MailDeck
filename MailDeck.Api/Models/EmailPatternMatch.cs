using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents a pattern match found in an email message.
/// Stores the result of pattern matching performed on email content.
/// </summary>
[Name("email_pattern_matches")]
public class EmailPatternMatch
{
    /// <summary>
    /// Unique match identifier (UUID)
    /// </summary>
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    /// <summary>
    /// User ID who owns this match (Cognito sub)
    /// </summary>
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Email account ID where this match was found
    /// </summary>
    [Name("server_config_id")]
    public Guid ServerConfigId { get; set; }

    /// <summary>
    /// IMAP UID of the email message
    /// </summary>
    [Name("message_uid")]
    public int MessageUid { get; set; }

    /// <summary>
    /// Pattern ID that matched
    /// </summary>
    [Name("pattern_id")]
    public Guid PatternId { get; set; }

    /// <summary>
    /// The actual matched string (OTP code, tracking number, token, etc.)
    /// </summary>
    [Name("matched_value")]
    public string MatchedValue { get; set; } = string.Empty;

    /// <summary>
    /// Position of this match if multiple matches in same email (0-indexed)
    /// </summary>
    [Name("match_position")]
    public int MatchPosition { get; set; } = 0;

    /// <summary>
    /// Timestamp when this match was created
    /// </summary>
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
}
