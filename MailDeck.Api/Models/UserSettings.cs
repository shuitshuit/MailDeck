using System.Text.Json.Serialization;

namespace MailDeck.Api.Models;

/// <summary>
/// User preferences stored as JSONB in users table
/// </summary>
public class UserSettings
{
    /// <summary>
    /// Default IMAP folder names
    /// </summary>
    [JsonPropertyName("defaultFolders")]
    public DefaultFolders DefaultFolders { get; set; } = new();
}

/// <summary>
/// Default folder name mappings
/// </summary>
public class DefaultFolders
{
    [JsonPropertyName("trash")]
    public string Trash { get; set; } = "Trash";

    [JsonPropertyName("drafts")]
    public string Drafts { get; set; } = "Drafts";

    [JsonPropertyName("sent")]
    public string Sent { get; set; } = "Sent";

    [JsonPropertyName("spam")]
    public string Spam { get; set; } = "Spam";

    [JsonPropertyName("inbox")]
    public string Inbox { get; set; } = "INBOX";
}
