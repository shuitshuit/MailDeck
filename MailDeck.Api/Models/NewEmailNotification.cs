namespace MailDeck.Api.Models;

/// <summary>
/// Represents a notification about a newly received email.
/// This record is sent through the Channel for auto-labeling processing.
/// </summary>
/// <param name="UserId">Cognito user ID who owns this email account</param>
/// <param name="ConfigId">Server configuration ID (email account)</param>
/// <param name="MessageId">IMAP message UID</param>
/// <param name="From">Email sender address</param>
/// <param name="Subject">Email subject line</param>
/// <param name="BodyText">Email body text (plain text)</param>
/// <param name="MessageIdHeader">RFC 5322 Message-ID; used to build the durable /m/{id} link for push notifications</param>
public record NewEmailNotification(
    string UserId,
    string ConfigId,
    int MessageId,
    string From,
    string Subject,
    string BodyText,
    string? MessageIdHeader = null
);
