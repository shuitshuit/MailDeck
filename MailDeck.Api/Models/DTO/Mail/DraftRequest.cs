namespace MailDeck.Api.Models.DTO.Mail
{
    public class DraftRequest
    {
        public string? To { get; set; }
        public string? Subject { get; set; }
        public string? Body { get; set; }
        public Guid ConfigId { get; set; }
    }
}
