using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.MailLinks;
using MailDeck.Api.Services;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using Microsoft.AspNetCore.Mvc;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Controllers;

/// <summary>
/// Durable links to a single mail (/m/{id}), meant to be pasted into calendar events,
/// tasks or notes. The link remembers the Message-ID header and is resolved to the
/// current IMAP UID each time it is opened.
/// </summary>
[ApiController]
[Route("api/mail-links")]
[Produces("application/json")]
public class MailLinksController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;
    private readonly IMailConnectionService _mailConnection;
    private readonly IConfiguration _configuration;

    public MailLinksController(
        ILogger<MailLinksController> logger,
        PostgreSqlConnect db,
        IMailConnectionService mailConnection,
        IConfiguration configuration)
        : base(logger)
    {
        _db = db;
        _mailConnection = mailConnection;
        _configuration = configuration;
    }

    /// <summary>Returns the link for a mail, creating it on first use (idempotent).</summary>
    [HttpPost]
    [ProducesResponseType(typeof(MailLinkResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create([FromBody] CreateMailLinkRequest request)
    {
        var userId = GetUserId();
        var header = request.MessageIdHeader.Trim().Trim('<', '>');
        if (string.IsNullOrEmpty(header)) return BadRequest("messageIdHeader is required.");

        try
        {
            await _db.OpenAsync();

            var config = await _db.GetAsync<UserServerConfig>(request.ConfigId);
            if (config is null || config.UserId != userId) return NotFound("Configuration not found");

            var linkId = await MailLinkService.GetOrCreateAsync(_db, userId, request.ConfigId, header, request.Subject);

            return Ok(new MailLinkResponse { Id = linkId, Url = BuildUrl(linkId) });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to create mail link");
            return StatusCode(500, "Failed to create mail link");
        }
    }

    /// <summary>Finds the mail a link points at in the account's INBOX.</summary>
    [HttpGet("{id:guid}/resolve")]
    [ProducesResponseType(typeof(ResolvedMailLinkResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Resolve(Guid id, CancellationToken ct)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();

            var link = await _db.GetAsync<MailLink>(id);
            // Same answer for "no such link" and "someone else's link": do not leak existence.
            if (link is null || link.UserId != userId) return NotFound(new { error = "link_not_found" });

            var config = await _db.GetAsync<UserServerConfig>(link.ConfigId);
            if (config is null || config.UserId != userId) return NotFound(new { error = "link_not_found" });

            using var client = new ImapClient();
            await _mailConnection.ConnectImapAsync(client, config, ct);

            var inbox = client.Inbox;
            if (inbox is null) return NotFound(new { error = "message_not_found", subject = link.Subject });
            await inbox.OpenAsync(FolderAccess.ReadOnly, ct);

            var uids = await inbox.SearchAsync(SearchQuery.HeaderContains("Message-ID", link.MessageIdHeader), ct);
            await client.DisconnectAsync(true, ct);

            if (uids.Count == 0)
            {
                // Moved to another folder or deleted; only INBOX is addressable by the UI.
                return NotFound(new { error = "message_not_found", subject = link.Subject });
            }

            return Ok(new ResolvedMailLinkResponse
            {
                ConfigId = link.ConfigId,
                MessageId = uids[^1].Id,
                Subject = link.Subject
            });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to resolve mail link {LinkId}", id);
            return StatusCode(500, "Failed to resolve mail link");
        }
    }

    private string? BuildUrl(Guid id)
    {
        var baseUrl = _configuration["Frontend:Url"]?.TrimEnd('/');
        return string.IsNullOrEmpty(baseUrl) ? null : $"{baseUrl}{MailLinkService.PathFor(id)}";
    }
}
