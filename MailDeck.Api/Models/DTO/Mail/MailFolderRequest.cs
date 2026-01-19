namespace MailDeck.Api.Models.DTO.Mail
{
    public class MailFolderRequest
    {
        public string Name { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int TotalMessages { get; set; }
        public int UnreadMessages { get; set; }
    }
}
