using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailKit.Net.Imap;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

using MailKit;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class MailController : ControllerBase
{
    private readonly ILogger<MailController> _logger;
    private readonly ShuitNet.ORM.PostgreSQL.PostgreSqlConnect _db;
    private readonly Services.IEncryptionService _encryptionService;

    public MailController(ILogger<MailController> logger, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, Services.IEncryptionService encryptionService)
    {
        _logger = logger;
        _db = db;
        _encryptionService = encryptionService;
    }

    [HttpGet("inbox")]
    public async Task<IActionResult> GetInbox(int configId, int page = 1, int pageSize = 20)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try 
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);

            using (var client = new ImapClient()) {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                
                var inbox = client.Inbox;
                await inbox.OpenAsync(FolderAccess.ReadOnly);

                var total = inbox.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);
                
                if (start > end) return Ok(new { messages = new List<object>(), total });

                var summaries = await inbox.FetchAsync(start, end, MessageSummaryItems.Envelope | MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);
                
                var messages = summaries.Select(s => new {
                    Id = s.UniqueId.Id,
                    Subject = s.Envelope.Subject,
                    From = s.Envelope.From.ToString(),
                    Date = s.InternalDate ?? s.Date.DateTime,
                    IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false
                }).OrderByDescending(m => m.Date).ToList();

                await client.DisconnectAsync(true);
                
                return Ok(new { messages, total });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch inbox");
            return StatusCode(500, "Failed to fetch inbox: " + ex.Message);
        }
    }

    [HttpGet("message/{id}")]
    public async Task<IActionResult> GetMessage(string id, int configId)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try 
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");

            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);

            using (var client = new ImapClient()) {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                
                var inbox = client.Inbox;
                await inbox.OpenAsync(FolderAccess.ReadOnly);

                var message = await inbox.GetMessageAsync(uid);
                
                var result = new {
                    Id = uid.Id.ToString(),
                    Subject = message.Subject,
                    From = message.From.ToString(),
                    To = message.To.ToString(),
                    Cc = message.Cc.ToString(),
                    Date = message.Date.DateTime,
                    BodyHtml = message.HtmlBody,
                    BodyText = message.TextBody
                };

                await client.DisconnectAsync(true);
                
                return Ok(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch message");
            return StatusCode(500, "Failed to fetch message: " + ex.Message);
        }
    }

    [HttpPost("send")]
    public async Task<IActionResult> SendMail([FromBody] Models.EmailRequest request)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = request.ConfigId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");

            var password = await _encryptionService.DecryptAsync(config.SmtpPassword);

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(config.AccountName.Split('@')[0], config.AccountName));
            message.To.Add(new MailboxAddress("", request.To));
            message.Subject = request.Subject;

            message.Body = new TextPart("plain")
            {
                Text = request.Body
            };

            using (var client = new SmtpClient())
            {
                await client.ConnectAsync(config.SmtpHost, config.SmtpPort, GetSecureSocketOptions(config.SmtpPort, config.SmtpSslEnabled));
                await client.AuthenticateAsync(config.SmtpUsername, password);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);
            }
            
            _logger.LogInformation($"Email sent to {request.To}");

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email");
            return StatusCode(500, "Failed to send email: " + ex.Message);
        }
    }

    private SecureSocketOptions GetSecureSocketOptions(int port, bool sslEnabled)
    {
        if (sslEnabled)
        {
            // 465 (SMTP) and 993 (IMAP) are standard for Implicit SSL
            if (port == 465 || port == 993)
            {
                return SecureSocketOptions.SslOnConnect;
            }
            // All other ports (587, 143, 110, etc) use STARTTLS if SSL is enabled
            return SecureSocketOptions.StartTls;
        }
        // If SSL is disabled in UI, use Auto which supports opportunistic encryption but allows plain text
        return SecureSocketOptions.Auto;
    }
}
