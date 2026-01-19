namespace MailDeck.Api.Models.DTO.Common;

public class SuccessResponse
{
    public bool Success { get; set; } = true;
    public string? Message { get; set; }

    public static SuccessResponse Ok(string? message = null) => new() { Success = true, Message = message };
}
