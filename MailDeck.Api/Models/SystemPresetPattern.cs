using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Represents a system-defined preset pattern that users can import.
/// These patterns are read-only and maintained by the system.
/// </summary>
[Name("system_preset_patterns")]
public class SystemPresetPattern
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("pattern_name")]
    public string PatternName { get; set; } = string.Empty;

    [Name("pattern_type")]
    public string PatternType { get; set; } = string.Empty;

    [Name("regex_pattern")]
    public string RegexPattern { get; set; } = string.Empty;

    [Name("regex_patterns")]
    [Jsonb]
    public RegexPatterns RegexPatterns { get; set; } = new();

    [Name("action_type")]
    public string ActionType { get; set; } = string.Empty;

    [Name("link_template")]
    public string? LinkTemplate { get; set; }

    [Name("priority")]
    public int Priority { get; set; } = 50;

    [Name("description")]
    public string? Description { get; set; }

    [Name("category")]
    public string? Category { get; set; }

    [Name("is_recommended")]
    public bool IsRecommended { get; set; }

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }

    [Name("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
