namespace MailDeck.Api.Models.DTO.Translation;

public class TranslateResponse
{
    public string TranslatedText { get; set; } = string.Empty;
    public string DetectedSourceLang { get; set; } = string.Empty;
}
