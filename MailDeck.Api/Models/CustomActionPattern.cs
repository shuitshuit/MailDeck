using ShuitNet.ORM.Attribute;
using System.Text.Json.Serialization;

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
    /// Regular expression pattern to match (legacy single pattern, kept for backward compatibility)
    /// </summary>
    [Name("regex_pattern")]
    public string RegexPattern { get; set; } = string.Empty;

    /// <summary>
    /// Multiple regex patterns with AND/OR logic.
    /// When non-empty, this takes precedence over RegexPattern.
    /// Structure: { "patterns": [{ "regex": "...", "nextOperator": "AND"|"OR"|null }, ...] }
    /// </summary>
    [Name("regex_patterns")]
    [Jsonb]
    public RegexPatterns RegexPatterns { get; set; } = new();

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
    /// URL template for 'link' action type.
    /// Use {value} as placeholder for the matched value.
    /// Example: https://track.example.com/{value}
    /// </summary>
    [Name("link_template")]
    public string? LinkTemplate { get; set; }

    /// <summary>
    /// Conditions for when this pattern should apply.
    /// Empty rules array means apply to all emails.
    /// Uses same structure as auto-labeling rules.
    /// </summary>
    [Name("conditions")]
    [Jsonb]
    public PatternConditions Conditions { get; set; } = new();

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

/// <summary>
/// Represents multiple regex patterns with AND/OR logic
/// </summary>
public class RegexPatterns
{
    [JsonPropertyName("patterns")]
    public List<RegexPatternEntry> Patterns { get; set; } = new();
}

/// <summary>
/// A single regex pattern entry in a multi-pattern group
/// </summary>
public class RegexPatternEntry
{
    /// <summary>
    /// The regular expression string
    /// </summary>
    [JsonPropertyName("regex")]
    public string Regex { get; set; } = string.Empty;

    /// <summary>
    /// Logical operator to use with the NEXT pattern (AND or OR).
    /// If this is the last pattern, this field is ignored.
    /// </summary>
    [JsonPropertyName("nextOperator")]
    public string? NextOperator { get; set; }
}

/// <summary>
/// Represents the complete conditions structure for a pattern
/// </summary>
public class PatternConditions
{
    /// <summary>
    /// List of individual pattern conditions
    /// </summary>
    [JsonPropertyName("rules")]
    public List<PatternCondition> Rules { get; set; } = new();
}

/// <summary>
/// Represents a single condition within a pattern
/// </summary>
public class PatternCondition
{
    /// <summary>
    /// Email field to evaluate (from, subject, body)
    /// </summary>
    [JsonPropertyName("field")]
    public string Field { get; set; } = string.Empty;

    /// <summary>
    /// Comparison operator (contains, equals, startsWith, endsWith, notcontains, notequals)
    /// </summary>
    [JsonPropertyName("operator")]
    public string Operator { get; set; } = string.Empty;

    /// <summary>
    /// Value to compare against
    /// </summary>
    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Logical operator to use with the NEXT condition (AND or OR)
    /// If this is the last condition, this field is ignored
    /// </summary>
    [JsonPropertyName("nextOperator")]
    public string? NextOperator { get; set; }
}
