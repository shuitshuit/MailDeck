using System.ComponentModel.DataAnnotations;

namespace MailDeck.Api.Models.DTO.Google;

public class CreateCalendarEventRequest
{
    [Required]
    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    /// <summary>"yyyy-MM-ddTHH:mm" (wall clock in <see cref="TimeZone"/>), or "yyyy-MM-dd" when <see cref="AllDay"/>.</summary>
    [Required]
    public string Start { get; set; } = string.Empty;

    /// <summary>Optional. Defaults to Start + 1 hour, or the same day for all-day events.</summary>
    public string? End { get; set; }

    public bool AllDay { get; set; }

    /// <summary>IANA time zone of the browser. Defaults to Asia/Tokyo.</summary>
    [MaxLength(100)]
    public string? TimeZone { get; set; }

    [MaxLength(500)]
    public string? Location { get; set; }

    [MaxLength(8000)]
    public string? Notes { get; set; }
}

public class CreateTaskRequest
{
    [Required]
    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    /// <summary>"yyyy-MM-dd". Google Tasks has no due time.</summary>
    public string? Due { get; set; }

    [MaxLength(8000)]
    public string? Notes { get; set; }
}

public class GoogleCreatedResponse
{
    public string Id { get; set; } = string.Empty;

    /// <summary>Link that opens the created event / task in Google's UI.</summary>
    public string? HtmlLink { get; set; }
}
