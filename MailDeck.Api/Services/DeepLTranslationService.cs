using System.Text.Json;

namespace MailDeck.Api.Services;

public class DeepLTranslationService : ITranslationService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DeepLTranslationService> _logger;

    public DeepLTranslationService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<DeepLTranslationService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;

        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<TranslationResult> TranslateAsync(string text, string targetLang)
    {
        var apiKey = _configuration["DeepL:ApiKey"];
        var apiUrl = _configuration["DeepL:ApiUrl"] ?? "https://api-free.deepl.com/v2/translate";

        if (string.IsNullOrEmpty(apiKey))
        {
            throw new InvalidOperationException("DeepL API key is not configured");
        }

        try
        {
            var requestContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("text", text),
                new KeyValuePair<string, string>("target_lang", targetLang.ToUpperInvariant())
            });

            using var request = new HttpRequestMessage(HttpMethod.Post, apiUrl);
            request.Headers.Add("Authorization", $"DeepL-Auth-Key {apiKey}");
            request.Content = requestContent;

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseBody = await response.Content.ReadAsStringAsync();
            var deepLResponse = JsonSerializer.Deserialize<DeepLApiResponse>(responseBody, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (deepLResponse?.Translations == null || deepLResponse.Translations.Length == 0)
            {
                throw new InvalidOperationException("No translation returned from DeepL API");
            }

            var translation = deepLResponse.Translations[0];
            return new TranslationResult
            {
                TranslatedText = translation.Text,
                DetectedSourceLang = translation.DetectedSourceLanguage ?? string.Empty
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "DeepL API request failed");
            throw new InvalidOperationException("Translation service is temporarily unavailable", ex);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse DeepL API response");
            throw new InvalidOperationException("Failed to process translation response", ex);
        }
    }

    private class DeepLApiResponse
    {
        public DeepLTranslation[] Translations { get; set; } = Array.Empty<DeepLTranslation>();
    }

    private class DeepLTranslation
    {
        public string Text { get; set; } = string.Empty;
        public string? DetectedSourceLanguage { get; set; }
    }
}
