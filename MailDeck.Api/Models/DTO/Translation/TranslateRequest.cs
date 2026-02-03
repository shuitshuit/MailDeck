namespace MailDeck.Api.Models.DTO.Translation;

public class TranslateRequest
{
    public string Text { get; set; } = string.Empty;
    public string TargetLang { get; set; } = string.Empty;
}
