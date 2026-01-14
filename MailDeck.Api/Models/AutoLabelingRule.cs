using ShuitNet.ORM.Attribute;
using System.Text.Json.Serialization;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents an auto-labeling rule that applies labels to emails based on conditions.
/// </summary>
[Name("auto_labeling_rules")]
public class AutoLabelingRule
{
    /// <summary>
    /// Unique rule identifier (UUID)
    /// </summary>
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    /// <summary>
    /// User ID who owns this rule (Cognito sub)
    /// </summary>
    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Label ID to apply when rule matches
    /// </summary>
    [Name("label_id")]
    public Guid LabelId { get; set; }

    /// <summary>
    /// User-friendly name for the rule
    /// </summary>
    [Name("rule_name")]
    public string RuleName { get; set; } = string.Empty;

    /// <summary>
    /// Rule evaluation priority (higher number = evaluated first)
    /// </summary>
    [Name("priority")]
    public int Priority { get; set; } = 0;

    /// <summary>
    /// Whether the rule is active
    /// </summary>
    [Name("is_enabled")]
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Rule conditions as JSON string (JSONB in database)
    /// </summary>
    [Name("conditions")]
    [Jsonb]
    public RuleConditions Conditions { get; set; } = new();

    /// <summary>
    /// Timestamp when the rule was created
    /// </summary>
    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Timestamp when the rule was last updated
    /// </summary>
    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Represents the complete conditions structure for a rule
/// </summary>
public class RuleConditions
{
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

    /// <summary>
    /// Logical operator to use with the NEXT condition (AND or OR)
    /// If this is the last condition, this field is ignored
    /// </summary>
    [JsonPropertyName("nextOperator")]
    public string? NextOperator { get; set; }
}
