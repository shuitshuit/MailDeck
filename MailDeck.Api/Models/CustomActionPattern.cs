using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents a custom action pattern for detecting and acting on specific patterns in email content.
/// Examples: OTP codes, tracking numbers, tokens, etc.
/// </summary>
[Name("custom_action_patterns")]
public class CustomActionPattern
{
    /// <summary>
    /// Unique pattern identifier (UUID)
    /// </summary>
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    /// <summary>
    /// User ID who owns this pattern (Cognito sub)
    /// </summary>
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// User-friendly name for the pattern (e.g., "6桁数字", "追跡番号")
    /// </summary>
    [Name("pattern_name")]
    public string PatternName { get; set; } = string.Empty;

    /// <summary>
    /// Type of pattern: otp, tracking, token, custom
    /// </summary>
    [Name("pattern_type")]
    public string PatternType { get; set; } = string.Empty;

    /// <summary>
    /// Regular expression pattern to match
    /// </summary>
    [Name("regex_pattern")]
    public string RegexPattern { get; set; } = string.Empty;

    /// <summary>
    /// Action to perform when pattern matches: copy, link, highlight
    /// </summary>
    [Name("action_type")]
    public string ActionType { get; set; } = string.Empty;

    /// <summary>
    /// Pattern evaluation priority (higher number = evaluated first, max 999)
    /// </summary>
    [Name("priority")]
    public int Priority { get; set; } = 0;

    /// <summary>
    /// Whether the pattern is active
    /// </summary>
    [Name("is_enabled")]
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Optional description of the pattern
    /// </summary>
    [Name("description")]
    public string? Description { get; set; }

    /// <summary>
    /// Timestamp when the pattern was created
    /// </summary>
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Timestamp when the pattern was last updated
    /// </summary>
    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
