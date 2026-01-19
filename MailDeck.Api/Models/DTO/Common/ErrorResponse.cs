namespace MailDeck.Api.Models.DTO.Common;

public class ErrorResponse
{
    public string Error { get; set; } = string.Empty;
    public string? Details { get; set; }

    public static ErrorResponse FromMessage(string error, string? details = null)
        => new() { Error = error, Details = details };
}
