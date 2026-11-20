using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Services;

/// <summary>
/// Get-or-create for <see cref="MailLink"/> rows (/m/{id}). Shared by the API (link
/// copy / calendar notes) and push notifications, so one mail always maps to one link.
/// </summary>
public static class MailLinkService
{
    /// <summary>Relative path of a mail link; the client resolves it against its own origin.</summary>
    public static string PathFor(Guid linkId) => $"/m/{linkId}";

    /// <summary>
    /// Returns the link id for the mail, inserting it on first use. Safe under concurrency:
    /// the unique (user_id, config_id, message_id_header) constraint decides the winner.
    /// The caller is responsible for having verified that <paramref name="configId"/> belongs to <paramref name="userId"/>.
    /// </summary>
    public static async Task<Guid> GetOrCreateAsync(
        PostgreSqlConnect db, string userId, Guid configId, string messageIdHeader, string? subject)
    {
        var header = messageIdHeader.Trim().Trim('<', '>');
        if (string.IsNullOrEmpty(header))
        {
            throw new ArgumentException("Message-ID header is empty.", nameof(messageIdHeader));
        }

        await db.ExecuteAsync(
            """
            INSERT INTO mail_links (id, user_id, config_id, message_id_header, subject, created_at)
            VALUES (@Id, @UserId, @ConfigId, @Header, @Subject, NOW())
            ON CONFLICT (user_id, config_id, message_id_header) DO NOTHING
            """,
            new
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ConfigId = configId,
                Header = header,
                Subject = subject is { Length: > 500 } ? subject[..500] : subject
            });

        var link = (await db.GetMultipleAsync<MailLink>(new
        {
            user_id = userId,
            config_id = configId,
            message_id_header = header
        })).First();

        return link.Id;
    }
}
