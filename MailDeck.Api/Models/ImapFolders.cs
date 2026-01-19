using ShuitNet.ORM.Attribute;

namespace MailDeck.Api.Models
{
    [Name("imap_folders")]
    public class ImapFolders
    {
        [Name("id")]
        public Guid Id { get; set; }
        [Name("user_id")]
        public string UserId { get; set; } = string.Empty;
        [Name("config_id")]
        public Guid ConfigId { get; set; }
        [Name("display_name")]
        public string DisplayName { get; set; } = string.Empty;
        [Name("imap_path")]
        public string ImapPath { get; set; } = string.Empty;
        [Name("created_at")]
        public DateTime CreatedAt { get; set; }
        [Name("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }
}
