namespace MailDeck.Api.Models.DTO.Users;

/// <summary>
/// Request from Cognito Lambda trigger for user setup
/// </summary>
public class SetupRequest
{
    /// <summary>
    /// Cognito user ID (sub)
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// User email address
    /// </summary>
    public string Email { get; set; } = string.Empty;
}
