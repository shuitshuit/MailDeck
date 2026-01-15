using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models;

/// <summary>
/// Records usage statistics for custom action patterns.
/// Used for analytics and showing popular patterns.
/// </summary>
[Name("pattern_usage_stats")]
public class PatternUsageStat
{
    [Key]
    [Name("id")]
    public Guid Id { get; set; }

    [Name("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Name("pattern_id")]
    public Guid PatternId { get; set; }

    /// <summary>
    /// Type of action: 'copy', 'link_click', 'highlight_copy'
    /// </summary>
    [Name("action_type")]
    public string ActionType { get; set; } = string.Empty;

    /// <summary>
    /// SHA-256 hash of the matched value for privacy
    /// </summary>
    [Name("matched_value_hash")]
    public string? MatchedValueHash { get; set; }

    [Name("created_at")]
    public DateTime CreatedAt { get; set; }
}
