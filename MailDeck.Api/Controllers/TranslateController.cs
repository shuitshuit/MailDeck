using MailDeck.Api.Models.DTO.Translation;
using MailDeck.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace MailDeck.Api.Controllers;

[Route("api/[controller]")]
[Produces("application/json")]
public class TranslateController : BaseAuthController
{
    private readonly ITranslationService _translationService;

    public TranslateController(
        ILogger<TranslateController> logger,
        ITranslationService translationService)
        : base(logger)
    {
        _translationService = translationService;
    }

    [HttpPost]
    [ProducesResponseType(typeof(TranslateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Translate([FromBody] TranslateRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest("Text is required");
        }

        if (string.IsNullOrWhiteSpace(request.TargetLang))
        {
            return BadRequest("Target language is required");
        }

        // テキスト長制限（DeepL無料版の制限に合わせる）
        const int maxTextLength = 5000;
        if (request.Text.Length > maxTextLength)
        {
            return BadRequest($"Text exceeds maximum length of {maxTextLength} characters");
        }

        try
        {
            _logger.LogInformation(
                "Translation requested by user {UserId}: {TextLength} chars to {TargetLang}",
                userId,
                request.Text.Length,
                request.TargetLang);

            var result = await _translationService.TranslateAsync(request.Text, request.TargetLang);

            return Ok(new TranslateResponse
            {
                TranslatedText = result.TranslatedText,
                DetectedSourceLang = result.DetectedSourceLang
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Translation failed for user {UserId}", userId);
            return StatusCode(500, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during translation for user {UserId}", userId);
            return StatusCode(500, "Translation failed unexpectedly");
        }
    }
}
