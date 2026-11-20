using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MailDeck.Api.Services;

/// <summary>What Google returned for a created event or task.</summary>
public record GoogleCreatedItem(string Id, string? HtmlLink);

/// <summary>Event to insert. Times are wall-clock values in <see cref="TimeZone"/>.</summary>
public record GoogleCalendarEventInput(
    string Title,
    DateTime Start,
    DateTime End,
    bool AllDay,
    string TimeZone,
    string? Location,
    string? Description);

/// <summary>Task to insert. Google Tasks keeps only the date part of <see cref="Due"/>.</summary>
public record GoogleTaskInput(string Title, DateOnly? Due, string? Notes);

public interface IGoogleWorkspaceClient
{
    Task<GoogleCreatedItem> CreateCalendarEventAsync(string accessToken, GoogleCalendarEventInput input, CancellationToken ct = default);
    Task<GoogleCreatedItem> CreateTaskAsync(string accessToken, GoogleTaskInput input, CancellationToken ct = default);
}

/// <summary>
/// Minimal REST client for Google Calendar (events.insert on "primary") and
/// Google Tasks (tasks.insert on "@default"). Plain HTTP rather than the Google SDK:
/// two calls do not justify the dependency.
/// </summary>
public class GoogleWorkspaceClient : IGoogleWorkspaceClient
{
    private const string CalendarEventsEndpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    private const string TasksEndpoint = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;

    public GoogleWorkspaceClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public Task<GoogleCreatedItem> CreateCalendarEventAsync(string accessToken, GoogleCalendarEventInput input, CancellationToken ct = default)
    {
        object start, end;
        if (input.AllDay)
        {
            // All-day events use an exclusive end date.
            start = new { date = input.Start.ToString("yyyy-MM-dd") };
            end = new { date = input.End.ToString("yyyy-MM-dd") };
        }
        else
        {
            start = new { dateTime = input.Start.ToString("yyyy-MM-ddTHH:mm:ss"), timeZone = input.TimeZone };
            end = new { dateTime = input.End.ToString("yyyy-MM-ddTHH:mm:ss"), timeZone = input.TimeZone };
        }

        var body = new Dictionary<string, object?>
        {
            ["summary"] = input.Title,
            ["location"] = input.Location,
            ["description"] = input.Description,
            ["start"] = start,
            ["end"] = end
        };

        return PostAsync(CalendarEventsEndpoint, accessToken, body, "htmlLink", ct);
    }

    public Task<GoogleCreatedItem> CreateTaskAsync(string accessToken, GoogleTaskInput input, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["title"] = input.Title,
            ["notes"] = input.Notes,
            // RFC 3339 is required, but only the date is kept.
            ["due"] = input.Due?.ToString("yyyy-MM-dd") + (input.Due is null ? null : "T00:00:00.000Z")
        };

        return PostAsync(TasksEndpoint, accessToken, body, "webViewLink", ct);
    }

    private async Task<GoogleCreatedItem> PostAsync(
        string url, string accessToken, Dictionary<string, object?> body, string linkProperty, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body.Where(kv => kv.Value is not null).ToDictionary(), options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);

        // 401: token rejected. 403: usually insufficientPermissions (scope not granted).
        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            throw new GoogleIntegrationRequiredException(
                $"Google API rejected the grant ({(int)response.StatusCode}).");
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Google API request failed ({(int)response.StatusCode}): {Truncate(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var id = root.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? string.Empty : string.Empty;
        var link = root.TryGetProperty(linkProperty, out var linkEl) ? linkEl.GetString() : null;

        return new GoogleCreatedItem(id, link);
    }

    private static string Truncate(string value) => value.Length <= 500 ? value : value[..500];
}
