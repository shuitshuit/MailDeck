using System.Text.Json.Serialization;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents an auto-labeling rule that applies labels to emails based on conditions.
/// </summary>
public class AutoLabelingRule
{
    /// <summary>
    /// Unique rule identifier (UUID)
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// User ID who owns this rule (Cognito sub)
    /// </summary>
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Label ID to apply when rule matches
    /// </summary>
    [JsonPropertyName("labelId")]
    public string LabelId { get; set; } = string.Empty;

    /// <summary>
    /// User-friendly name for the rule
    /// </summary>
    [JsonPropertyName("ruleName")]
    public string RuleName { get; set; } = string.Empty;

    /// <summary>
    /// Rule evaluation priority (higher number = evaluated first)
    /// </summary>
    [JsonPropertyName("priority")]
    public int Priority { get; set; } = 0;

    /// <summary>
    /// Whether the rule is active
    /// </summary>
    [JsonPropertyName("isEnabled")]
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Rule conditions as JSON string (JSONB in database)
    /// </summary>
    [JsonPropertyName("conditions")]
    public string Conditions { get; set; } = string.Empty;

    /// <summary>
    /// Timestamp when the rule was created
    /// </summary>
    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Timestamp when the rule was last updated
    /// </summary>
    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Represents the complete conditions structure for a rule
/// </summary>
public class RuleConditions
{
    /// <summary>
    /// Logical operator combining multiple conditions (AND or OR)
    /// </summary>
    [JsonPropertyName("operator")]
    public string Operator { get; set; } = "AND";

    /// <summary>
    /// List of individual rule conditions
    /// </summary>
    [JsonPropertyName("rules")]
    public List<RuleCondition> Rules { get; set; } = new();
}

/// <summary>
/// Represents a single condition within a rule
/// </summary>
public class RuleCondition
{
    /// <summary>
    /// Email field to evaluate (from, subject, body)
    /// </summary>
    [JsonPropertyName("field")]
    public string Field { get; set; } = string.Empty;

    /// <summary>
    /// Comparison operator (contains, equals, startsWith, endsWith)
    /// </summary>
    [JsonPropertyName("operator")]
    public string Operator { get; set; } = string.Empty;

    /// <summary>
    /// Value to compare against
    /// </summary>
    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;
}
