namespace MailDeck.Api.Services;

public interface ITranslationService
{
    Task<TranslationResult> TranslateAsync(string text, string targetLang);
}

public class TranslationResult
{
    public string TranslatedText { get; set; } = string.Empty;
    public string DetectedSourceLang { get; set; } = string.Empty;
}
