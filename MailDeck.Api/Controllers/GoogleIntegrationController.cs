using System.Globalization;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models.DTO.Google;
using MailDeck.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace MailDeck.Api.Controllers;

/// <summary>
/// Adds events to Google Calendar and tasks to Google Tasks through the user's
/// Calendar / Tasks integration (connected via /api/oauth/google/integration/authorize).
/// Returns 409 with error "google_integration_required" when the user has to (re)connect.
/// </summary>
[ApiController]
[Route("api/google")]
[Produces("application/json")]
public class GoogleIntegrationController : BaseAuthController
{
    private const string DefaultTimeZone = "Asia/Tokyo";

    private readonly IGoogleIntegrationAccessService _access;
    private readonly IGoogleWorkspaceClient _workspace;

    public GoogleIntegrationController(
        ILogger<GoogleIntegrationController> logger,
        IGoogleIntegrationAccessService access,
        IGoogleWorkspaceClient workspace)
        : base(logger)
    {
        _access = access;
        _workspace = workspace;
    }

    [HttpPost("calendar/events")]
    [ProducesResponseType(typeof(GoogleCreatedResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateEvent([FromBody] CreateCalendarEventRequest request, CancellationToken ct)
    {
        var userId = GetUserId();

        if (!TryParseLocal(request.Start, out var start)) return BadRequest("Invalid start.");

        DateTime end;
        if (string.IsNullOrWhiteSpace(request.End))
        {
            end = request.AllDay ? start.Date.AddDays(1) : start.AddHours(1);
        }
        else
        {
            if (!TryParseLocal(request.End, out end)) return BadRequest("Invalid end.");
            // The UI asks for an inclusive last day; Google wants an exclusive end date.
            if (request.AllDay) end = end.Date.AddDays(1);
        }

        if (end <= start) return BadRequest("End must be after start.");

        var timeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? DefaultTimeZone : request.TimeZone;
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _)) timeZone = DefaultTimeZone;

        return await CallGoogleAsync(userId, token => _workspace.CreateCalendarEventAsync(token,
            new GoogleCalendarEventInput(
                request.Title.Trim(),
                request.AllDay ? start.Date : start,
                end,
                request.AllDay,
                timeZone,
                NullIfBlank(request.Location),
                NullIfBlank(request.Notes)), ct));
    }

    [HttpPost("tasks")]
    [ProducesResponseType(typeof(GoogleCreatedResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateTask([FromBody] CreateTaskRequest request, CancellationToken ct)
    {
        var userId = GetUserId();

        DateOnly? due = null;
        if (!string.IsNullOrWhiteSpace(request.Due))
        {
            if (!TryParseLocal(request.Due, out var parsed)) return BadRequest("Invalid due.");
            due = DateOnly.FromDateTime(parsed);
        }

        return await CallGoogleAsync(userId, token => _workspace.CreateTaskAsync(token,
            new GoogleTaskInput(request.Title.Trim(), due, NullIfBlank(request.Notes)), ct));
    }

    private async Task<IActionResult> CallGoogleAsync(string userId, Func<string, Task<GoogleCreatedItem>> call)
    {
        try
        {
            var token = await _access.GetAccessTokenAsync(userId);
            var created = await call(token);
            return Ok(new GoogleCreatedResponse { Id = created.Id, HtmlLink = created.HtmlLink });
        }
        catch (GoogleIntegrationRequiredException ex)
        {
            _logger.LogInformation("Google integration required for user {UserId}: {Reason}", userId, ex.Message);
            return Conflict(new { error = "google_integration_required" });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Google API call failed for user {UserId}", userId);
            return StatusCode(500, "Failed to register with Google");
        }
    }

    private static bool TryParseLocal(string value, out DateTime result) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
