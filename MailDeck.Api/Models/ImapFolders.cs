namespace MailDeck.Api.Models
{
    public class ImapFolders
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public Guid ConfigId { get; set; }
        public string DisplayName { get; set; } = string.Empty;
        public string ImapPath { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
