using System.Text.RegularExpressions;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.Mail;
using MailDeck.Api.Services;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MimeKit;
using ShuitNet.ORM.PostgreSQL;
using SmtpClient = MailKit.Net.Smtp.SmtpClient;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MailController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;
    private readonly IEncryptionService _encryptionService;
    private readonly IClamAvService _clamAv;

    public MailController(
        ILogger<MailController> logger,
        PostgreSqlConnect db,
        IEncryptionService encryptionService,
        IClamAvService clamAv)
        : base(logger)
    {
        _db = db;
        _encryptionService = encryptionService;
        _clamAv = clamAv;
    }

    [HttpGet("inbox")]
    [ProducesResponseType(typeof(InboxResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetInbox(Guid configId, int page = 1, int pageSize = 20)
    {
        var userId = GetUserId();

        try 
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);

            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                
                await client.AuthenticateAsync(config.ImapUsername, password);

                var inbox = client.Inbox;

                if (inbox == null) return NotFound("Inbox folder not found");

                await inbox.OpenAsync(FolderAccess.ReadOnly);

                var total = inbox.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);

                if (start > end) return Ok(new { messages = new List<object>(), total });

                IList<IMessageSummary> summaries;

                summaries = await inbox.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);

                var messages = new List<MailMessageResponse>();
                var hiddenCount = 0;

                foreach (var s in summaries)
                {
                    var messageId = ((int)s.UniqueId.Id);

                    // Get labels for this message
                    var mailLabels = await _db.GetMultipleAsync<MailLabel>(new
                    {
                        user_id = userId,
                        message_id = messageId,
                        server_config_id = configId
                    });

                    var labelIds = mailLabels.Select(ml => ml.LabelId).ToList();
                    var labels = new List<LabelResponse>();
                    var shouldHideFromInbox = false;

                    foreach (var labelId in labelIds)
                    {
                        var label = await _db.GetAsync<Label>(labelId);
                        if (label != null)
                        {
                            labels.Add(new LabelResponse
                            {
                                Id = label.Id,
                                Name = label.Name,
                                Color = label.Color
                            });

                            // Check if this label hides messages from inbox
                            if (label.HideFromInbox)
                            {
                                shouldHideFromInbox = true;
                            }
                        }
                    }

                    // Skip messages with hide-from-inbox labels
                    if (shouldHideFromInbox)
                    {
                        hiddenCount++;
                        continue;
                    }

                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope!.Subject ?? string.Empty,
                        From = s.Envelope!.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false,
                        Labels = labels,
                        MessageId = s.Envelope!.MessageId,
                        InReplyTo = s.Envelope!.InReplyTo,
                        ThreadKey = NormalizeSubject(s.Envelope!.Subject ?? string.Empty)
                    });
                }

                messages = messages.OrderByDescending(m => m.Date).ToList();

                await client.DisconnectAsync(true);

                // Adjust total to exclude hidden messages
                return Ok(new InboxResponse { Messages = messages, Total = total - hiddenCount });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch inbox");
            return StatusCode(500, "Failed to fetch inbox: " + ex.Message);
        }
    }

    [HttpGet("inbox/{folder-name}")]
    [ProducesResponseType(typeof(InboxResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetInboxFolder(Guid configId, string folderName, int page = 1, int pageSize = 20)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var folder = await client.GetFolderAsync(folderName);
                await folder.OpenAsync(FolderAccess.ReadOnly);
                var total = folder.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);
                if (start > end) return Ok(new { messages = new List<object>(), total });
                IList<IMessageSummary> summaries;
                summaries = await folder.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    var messageId = ((int)s.UniqueId.Id);

                    // Get labels for this message
                    var mailLabels = await _db.GetMultipleAsync<MailLabel>(new
                    {
                        user_id = userId,
                        message_id = messageId,
                        server_config_id = configId
                    });

                    var labelIds = mailLabels.Select(ml => ml.LabelId).ToList();
                    var labels = new List<LabelResponse>();

                    foreach (var labelId in labelIds)
                    {
                        var label = await _db.GetAsync<Label>(labelId);
                        if (label != null)
                        {
                            labels.Add(new LabelResponse
                            {
                                Id = label.Id,
                                Name = label.Name,
                                Color = label.Color
                            });
                        }
                    }

                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope!.Subject ?? string.Empty,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false,
                        Labels = labels,
                        MessageId = s.Envelope!.MessageId,
                        InReplyTo = s.Envelope!.InReplyTo,
                        ThreadKey = NormalizeSubject(s.Envelope!.Subject ?? string.Empty)
                    });
                }

                messages = messages.OrderByDescending(m => m.Date).ToList();
                await client.DisconnectAsync(true);
                return Ok(new InboxResponse { Messages = messages, Total = total });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch inbox folder");
            return StatusCode(500, "Failed to fetch inbox folder: " + ex.Message);
        }
    }

    [HttpGet("folders")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetFolders(Guid configId, bool forceSync = false)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");

            // Check cache if not forcing sync
            if (!forceSync)
            {
                var cachedFolders = await _db.GetMultipleAsync<ImapFolders>(new { config_id = configId });
                if (cachedFolders.Any())
                {
                    var folders = cachedFolders.Select(f => new MailFolderResponse
                    {
                        Name = f.DisplayName,
                        FullName = f.ImapPath,
                        TotalMessages = 0,
                        UnreadMessages = 0
                    }).ToList();
                    return Ok(new { folders, fromCache = true });
                }
            }

            // Fetch from IMAP and cache
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);

                var folders = new List<MailFolderResponse>();
                var imapFolders = await client.GetFoldersAsync(client.PersonalNamespaces[0]);

                foreach (var folder in imapFolders)
                {
                    folders.Add(new MailFolderResponse
                    {
                        Name = folder.Name,
                        FullName = folder.FullName,
                        TotalMessages = folder.Count,
                        UnreadMessages = folder.Unread
                    });
                }

                // Cache folders in database
                await CacheFoldersAsync(userId, configId, imapFolders);

                await client.DisconnectAsync(true);
                return Ok(new { folders, fromCache = false });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch folders");
            return StatusCode(500, "Failed to fetch folders: " + ex.Message);
        }
    }

    [HttpPost("folders/sync")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> SyncFolders(Guid configId)
    {
        return await GetFolders(configId, forceSync: true);
    }

    private async Task CacheFoldersAsync(string userId, Guid configId, IEnumerable<IMailFolder> imapFolders)
    {
        try
        {
            // Delete existing cached folders for this config
            await _db.ExecuteAsync(
                "DELETE FROM imap_folders WHERE config_id = @ConfigId",
                new { ConfigId = configId });

            // Insert new folders
            foreach (var folder in imapFolders)
            {
                var displayName = DetermineDisplayName(folder.Name, folder.FullName);
                var imapFolder = new ImapFolders
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ConfigId = configId,
                    DisplayName = displayName,
                    ImapPath = folder.FullName,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _db.InsertAsync(imapFolder);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to cache folders, continuing without cache");
        }
    }

    private string DetermineDisplayName(string name, string fullName)
    {
        var lowerName = name.ToLowerInvariant();
        var lowerFullName = fullName.ToLowerInvariant();

        // Identify special folders by common names
        if (lowerName.Contains("draft") || lowerFullName.Contains("draft") || lowerName == "下書き")
            return "Drafts";
        if (lowerName.Contains("spam") || lowerName.Contains("junk") || lowerFullName.Contains("spam") || lowerName == "迷惑メール")
            return "Spam";
        if (lowerName.Contains("trash") || lowerName.Contains("deleted") || lowerName == "ゴミ箱")
            return "Trash";
        if (lowerName.Contains("sent") || lowerFullName.Contains("sent") || lowerName == "送信済み")
            return "Sent";
        if (lowerName == "inbox" || lowerFullName == "inbox")
            return "Inbox";

        // Return original name for custom folders
        return name;
    }

    [HttpGet("message/{id}")]
    [ProducesResponseType(typeof(MailMessageDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetMessage(string id, Guid configId)
    {
        var userId = GetUserId();

        try 
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");

            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);

            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));

                await client.AuthenticateAsync(config.ImapUsername, password);

                var inbox = client.Inbox;

                if (inbox == null) return NotFound("Inbox folder not found");

                await inbox.OpenAsync(FolderAccess.ReadOnly);

                MimeMessage message;

                message = await inbox.GetMessageAsync(uid);

                string? unsubscribeUrl = null;
                string? unsubscribeMailto = null;
                var listUnsubscribeRaw = message.Headers[HeaderId.ListUnsubscribe];
                if (listUnsubscribeRaw != null)
                {
                    var urlMatch = Regex.Match(listUnsubscribeRaw, @"<(https?://[^>]+)>");
                    if (urlMatch.Success) unsubscribeUrl = urlMatch.Groups[1].Value;

                    var mailtoMatch = Regex.Match(listUnsubscribeRaw, @"<(mailto:[^>]+)>");
                    if (mailtoMatch.Success) unsubscribeMailto = mailtoMatch.Groups[1].Value;
                }

                var attachments = new List<AttachmentInfoResponse>();
                int partIndex = 0;
                foreach (var bodyPart in message.BodyParts)
                {
                    if (bodyPart is MimePart mimePart && mimePart.IsAttachment && mimePart.Content != null)
                    {
                        using var ms = new MemoryStream();
                        await mimePart.Content.DecodeToAsync(ms);
                        attachments.Add(new AttachmentInfoResponse
                        {
                            PartIndex = partIndex,
                            FileName = mimePart.FileName ?? $"attachment_{partIndex}",
                            ContentType = mimePart.ContentType.MimeType,
                            SizeBytes = ms.Length
                        });
                    }
                    partIndex++;
                }

                var result = new MailMessageDetailResponse
                {
                    Id = uid.Id.ToString(),
                    Subject = message.Subject ?? string.Empty,
                    From = message.From.ToString(),
                    To = message.To.ToString(),
                    Cc = message.Cc.ToString(),
                    Date = message.Date.DateTime,
                    BodyHtml = message.HtmlBody,
                    BodyText = message.TextBody,
                    ListUnsubscribeUrl = unsubscribeUrl,
                    ListUnsubscribeMailto = unsubscribeMailto,
                    ListUnsubscribeOneClick = message.Headers["List-Unsubscribe-Post"]?.Contains("One-Click") == true,
                    Attachments = attachments,
                };

                await client.DisconnectAsync(true);

                return Ok(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch message");
            return StatusCode(500, "Failed to fetch message: " + ex.Message);
        }
    }

    [HttpGet("attachment/{messageId}/{partIndex}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DownloadAttachment(string messageId, int partIndex, Guid configId)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(messageId, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);

            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            await client.AuthenticateAsync(config.ImapUsername, password);

            var inbox = client.Inbox;
            if (inbox == null) return NotFound("Inbox folder not found");
            await inbox.OpenAsync(FolderAccess.ReadOnly);

            var message = await inbox.GetMessageAsync(uid);
            await client.DisconnectAsync(true);

            var parts = message.BodyParts.ToList();
            if (partIndex < 0 || partIndex >= parts.Count)
                return NotFound("Attachment not found");

            if (parts[partIndex] is not MimePart mimePart || !mimePart.IsAttachment || mimePart.Content == null)
                return NotFound("Attachment not found at specified index");

            using var ms = new MemoryStream();
            await mimePart.Content.DecodeToAsync(ms);
            var bytes = ms.ToArray();

            var fileName = mimePart.FileName ?? $"attachment_{partIndex}";
            var contentType = mimePart.ContentType.MimeType;

            var scanResult = await _clamAv.ScanBytesAsync(bytes, fileName);
            if (scanResult.Status == ScanStatus.Infected)
            {
                _logger.LogWarning("Virus detected in attachment {File}: {Virus}", fileName, scanResult.VirusName);
                return BadRequest($"ウイルスが検出されました: {scanResult.VirusName}");
            }
            if (scanResult.Status == ScanStatus.Error)
            {
                _logger.LogWarning("ClamAV scan error for {File}: {Msg}", fileName, scanResult.Message);
            }

            return File(bytes, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to download attachment");
            return StatusCode(500, "Failed to download attachment: " + ex.Message);
        }
    }

    [HttpDelete("message/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteMessage(string id, Guid configId)
    {
        var userId = GetUserId();

        try 
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var inbox = client.Inbox;
                if (inbox == null) return NotFound("Inbox folder not found");
                await inbox.OpenAsync(FolderAccess.ReadWrite);
                await inbox.AddFlagsAsync(uid, MessageFlags.Deleted, true);
                await inbox.ExpungeAsync();
                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete message");
            return StatusCode(500, "Failed to delete message: " + ex.Message);
        }
    }

    [HttpPut("message/{id}/mark-read")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> MarkMessageAsRead(string id, Guid configId)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var inbox = client.Inbox;
                if (inbox == null) return NotFound("Inbox folder not found");
                await inbox.OpenAsync(FolderAccess.ReadWrite);
                await inbox.AddFlagsAsync(uid, MessageFlags.Seen, true);
                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to mark message as read");
            return StatusCode(500, "Failed to mark message as read: " + ex.Message);
        }
    }

    [HttpPut("messages/mark-read")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> MarkMessagesAsRead([FromBody] BulkMarkReadRequest request)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = request.ConfigId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");

            var uids = new List<UniqueId>();
            foreach (var id in request.MessageIds)
            {
                if (!uint.TryParse(id, out var uidVal)) return BadRequest($"Invalid Message ID: {id}");
                uids.Add(new UniqueId(uidVal));
            }

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var inbox = client.Inbox;
                if (inbox == null) return NotFound("Inbox folder not found");
                await inbox.OpenAsync(FolderAccess.ReadWrite);
                await inbox.AddFlagsAsync(uids, MessageFlags.Seen, true);
                await client.DisconnectAsync(true);
                return Ok(new { success = true, count = uids.Count });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to bulk mark messages as read");
            return StatusCode(500, "Failed to bulk mark messages as read: " + ex.Message);
        }
    }

    [HttpPost("send")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> SendMail([FromForm] SendMailFormRequest request)
    {
        var userId = GetUserId();

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
            foreach (var addr in request.To.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                message.To.Add(new MailboxAddress("", addr));
            if (!string.IsNullOrWhiteSpace(request.Cc))
                foreach (var addr in request.Cc.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    message.Cc.Add(new MailboxAddress("", addr));
            if (!string.IsNullOrWhiteSpace(request.Bcc))
                foreach (var addr in request.Bcc.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    message.Bcc.Add(new MailboxAddress("", addr));
            if (!string.IsNullOrWhiteSpace(request.ReplyTo))
                message.ReplyTo.Add(new MailboxAddress("", request.ReplyTo));
            message.Subject = request.Subject;

            if (request.Attachments != null && request.Attachments.Count > 0)
            {
                var fileEntries = new List<(string Name, string MimeType, byte[] Bytes)>();
                for (int i = 0; i < request.Attachments.Count; i++)
                {
                    var file = request.Attachments[i];
                    using var fms = new MemoryStream();
                    await file.CopyToAsync(fms);
                    fileEntries.Add((file.FileName ?? $"attachment_{i}", file.ContentType ?? "application/octet-stream", fms.ToArray()));
                }

                foreach (var (name, _, bytes) in fileEntries)
                {
                    var scanResult = await _clamAv.ScanBytesAsync(bytes, name);
                    if (scanResult.Status == ScanStatus.Infected)
                    {
                        _logger.LogWarning("Virus detected in outgoing attachment {File}: {Virus}", name, scanResult.VirusName);
                        return BadRequest($"ウイルスが検出されました: {scanResult.VirusName} (ファイル: {name})");
                    }
                    if (scanResult.Status == ScanStatus.Error)
                        _logger.LogWarning("ClamAV scan error for {File}: {Msg}", name, scanResult.Message);
                }

                var multipart = new Multipart("mixed");
                multipart.Add(new TextPart("plain") { Text = request.Body });

                foreach (var (name, mimeType, bytes) in fileEntries)
                {
                    var part = new MimePart(mimeType)
                    {
                        Content = new MimeContent(new MemoryStream(bytes)),
                        ContentDisposition = new ContentDisposition(ContentDisposition.Attachment),
                        ContentTransferEncoding = ContentEncoding.Base64,
                        FileName = name
                    };
                    multipart.Add(part);
                }
                message.Body = multipart;
            }
            else
            {
                message.Body = new TextPart("plain") { Text = request.Body };
            }

            using (var client = new SmtpClient())
            {
                await client.ConnectAsync(config.SmtpHost, config.SmtpPort, GetSecureSocketOptions(config.SmtpPort, config.SmtpSslEnabled));

                await client.AuthenticateAsync(config.SmtpUsername, password);

                await client.SendAsync(message);

                await client.DisconnectAsync(true);
            }

            _logger.LogInformation($"Email sent to {request.To}");

            // Sentフォルダへコピー (失敗しても送信は成功扱い)
            try
            {
                var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
                {
                    config_id = request.ConfigId,
                    user_id = userId
                });
                var sentFolderPath = folderPaths
                    .FirstOrDefault(f => f.DisplayName is "Sent")?.ImapPath
                    ?? folderPaths.FirstOrDefault(f =>
                        f.ImapPath.Contains("sent", StringComparison.OrdinalIgnoreCase) ||
                        f.ImapPath == "送信済み")?.ImapPath
                    ?? "Sent";

                var imapPassword = await _encryptionService.DecryptAsync(config.ImapPassword);
                using var imapClient = new ImapClient();
                await imapClient.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await imapClient.AuthenticateAsync(config.ImapUsername, imapPassword);
                var sentFolder = await imapClient.GetFolderAsync(sentFolderPath);
                await sentFolder.OpenAsync(FolderAccess.ReadWrite);
                await sentFolder.AppendAsync(message, MessageFlags.Seen);
                await imapClient.DisconnectAsync(true);
            }
            catch (Exception sentEx)
            {
                _logger.LogWarning(sentEx, "Failed to copy sent message to Sent folder");
            }

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to send email");
            return StatusCode(500, "Failed to send email: " + ex.Message);
        }
    }

    [HttpPost("draft")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> SaveDraft([FromBody] DraftRequest request)
    {
        if (string.IsNullOrEmpty(request.To) && string.IsNullOrEmpty(request.Subject)
            && string.IsNullOrEmpty(request.Body))
            return BadRequest("Draft must have at least one of To, Subject, or Body filled.");

        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(request.ConfigId);
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = request.ConfigId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用
            // メール本文を作成
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(config.AccountName.Split('@')[0], config.AccountName));
            if (!string.IsNullOrEmpty(request.To))
                message.To.Add(new MailboxAddress("", request.To));
            message.Subject = request.Subject ?? string.Empty;
            message.Body = new TextPart("plain")
            {
                Text = request.Body ?? string.Empty
            };
            // Draftsフォルダに保存
            using (var client = new ImapClient())
            {
                var password = await _encryptionService.DecryptAsync(config.ImapPassword);
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadWrite);
                await draftsFolder.AppendAsync(message, MessageFlags.Draft);
                await client.DisconnectAsync(true);
            }
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to save draft");
            return StatusCode(500, "Failed to save draft: " + ex.Message);
        }
    }

    [HttpGet("draft/{id}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetDraft(string id, Guid configId)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Draft ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadOnly);
                var message = await draftsFolder.GetMessageAsync(uid);
                var result = new MailMessageDetailResponse
                {
                    Id = uid.Id.ToString(),
                    Subject = message.Subject ?? string.Empty,
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
            _logger.LogErrorWithSql(ex, "Failed to fetch draft");
            return StatusCode(500, "Failed to fetch draft: " + ex.Message);
        }
    }

    [HttpPut("draft/{id}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateDraft(string id, Guid configId, [FromBody] DraftRequest request)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Draft ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadWrite);
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(config.AccountName.Split('@')[0], config.AccountName));
                if (!string.IsNullOrEmpty(request.To))
                    message.To.Add(new MailboxAddress("", request.To));
                message.Subject = request.Subject ?? string.Empty;
                message.Body = new TextPart("plain")
                {
                    Text = request.Body ?? string.Empty
                };
                await draftsFolder.ReplaceAsync(uid, message, MessageFlags.Draft);
                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update draft");
            return StatusCode(500, "Failed to update draft: " + ex.Message);
        }
    }

    [HttpDelete("draft/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteDraft(string id, Guid configId)
    {
        var userId = GetUserId();
        try 
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Draft ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadWrite);
                await draftsFolder.AddFlagsAsync(uid, MessageFlags.Deleted, true);
                await draftsFolder.ExpungeAsync();
                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete draft");
            return StatusCode(500, "Failed to delete draft: " + ex.Message);
        }
    }

    [HttpPost("draft/send/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> SendDraft(string id, Guid configId)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Draft ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadWrite);
                var message = await draftsFolder.GetMessageAsync(uid);
                // Send the message via SMTP
                using (var smtpClient = new SmtpClient())
                {
                    var smtpPassword = await _encryptionService.DecryptAsync(config.SmtpPassword);
                    await smtpClient.ConnectAsync(config.SmtpHost, config.SmtpPort, GetSecureSocketOptions(config.SmtpPort, config.SmtpSslEnabled));
                    await smtpClient.AuthenticateAsync(config.SmtpUsername, smtpPassword);
                    await smtpClient.SendAsync(message);
                    await smtpClient.DisconnectAsync(true);
                }
                // Delete the draft after sending
                await draftsFolder.AddFlagsAsync(uid, MessageFlags.Deleted, true);
                await draftsFolder.ExpungeAsync();

                // Sentフォルダへコピー
                try
                {
                    var sentFolderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = configId, user_id = userId });
                    var sentFolderPath = sentFolderPaths
                        .FirstOrDefault(f => f.DisplayName is "Sent")?.ImapPath
                        ?? sentFolderPaths.FirstOrDefault(f =>
                            f.ImapPath.Contains("sent", StringComparison.OrdinalIgnoreCase) ||
                            f.ImapPath == "送信済み")?.ImapPath
                        ?? "Sent";
                    var sentFolder = await client.GetFolderAsync(sentFolderPath);
                    await sentFolder.OpenAsync(FolderAccess.ReadWrite);
                    await sentFolder.AppendAsync(message, MessageFlags.Seen);
                }
                catch (Exception sentEx)
                {
                    _logger.LogWarning(sentEx, "Failed to copy sent draft to Sent folder");
                }

                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to send draft");
            return StatusCode(500, "Failed to send draft: " + ex.Message);
        }
    }

    [HttpGet("drafts")]
    [ProducesResponseType(typeof(InboxResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetDrafts(Guid configId, int page = 1, int pageSize = 20)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var draftsFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Drafts" or "下書き")?.ImapPath;
            draftsFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Drafts" or "下書き")?
                .ImapPath ?? "Drafts"; // デフォルトで"Drafts"を使用

            if (config == null) return NotFound("Configuration not found");
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var draftsFolder = await client.GetFolderAsync(draftsFolderPath);
                await draftsFolder.OpenAsync(FolderAccess.ReadOnly);
                var total = draftsFolder.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);
                if (start > end) return Ok(new { messages = new List<object>(), total });
                IList<IMessageSummary> summaries;
                summaries = await draftsFolder.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope!.Subject ?? string.Empty,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false
                    });
                }
                await client.DisconnectAsync(true);
                return Ok(new InboxResponse { Messages = messages, Total = total });
            }
        }
        catch (InvalidOperationException)
        {
            // Draftsフォルダが存在しない場合、空のリストを返す
            return BadRequest(new { messages = new List<object>(), total = 0 });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch drafts");
            return StatusCode(500, "Failed to fetch drafts: " + ex.Message);
        }
    }

    [HttpGet("spam")]
    [ProducesResponseType(typeof(InboxResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetSpam(Guid configId, int page = 1, int pageSize = 20)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var spamFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Junk" or "迷惑メール" or "spam")?.ImapPath;
            spamFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Junk" or "迷惑メール" or "spam")?
                .ImapPath ?? "Junk"; // デフォルトで"Junk"を使用

            if (config == null) return NotFound("Configuration not found");
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var spamFolder = await client.GetFolderAsync(spamFolderPath);
                await spamFolder.OpenAsync(FolderAccess.ReadOnly);
                var total = spamFolder.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);
                if (start > end) return Ok(new { messages = new List<object>(), total });
                IList<IMessageSummary> summaries;
                summaries = await spamFolder.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope!.Subject ?? string.Empty,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false
                    });
                }
                await client.DisconnectAsync(true);
                return Ok(new InboxResponse { Messages = messages, Total = total });
            }
        }
        catch (InvalidOperationException)
        {
            // Spamフォルダが存在しない場合、空のリストを返す
            return BadRequest(new { messages = new List<object>(), total = 0 });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch spam folder");
            return StatusCode(500, "Failed to fetch spam folder: " + ex.Message);
        }
    }

    [HttpPut("move-to-trash/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> MoveToTrash(string id, Guid configId)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash"; // デフォルトで"Trash"を使用

            if (config == null) return NotFound("Configuration not found");
            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid Message ID");
            var uid = new UniqueId(uidVal);
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var inbox = client.Inbox;
                if (inbox == null) return NotFound("Inbox folder not found");
                await inbox.OpenAsync(FolderAccess.ReadWrite);
                var trashFolder = await client.GetFolderAsync(trashFolderPath);
                await inbox.MoveToAsync(uid, trashFolder);
                await client.DisconnectAsync(true);
                return Ok(new { success = true });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to move message to trash");
            return StatusCode(500, "Failed to move message to trash: " + ex.Message);
        }
    }

    [HttpGet("trash")]
    [ProducesResponseType(typeof(InboxResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetTrash(Guid configId, int page = 1, int pageSize = 20)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new
            {
                config_id = configId,
                user_id = userId
            });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash"; // デフォルトで"Trash"を使用

            if (config == null) return NotFound("Configuration not found");
            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using (var client = new ImapClient())
            {
                await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
                await client.AuthenticateAsync(config.ImapUsername, password);
                var trashFolder = await client.GetFolderAsync(trashFolderPath);
                await trashFolder.OpenAsync(FolderAccess.ReadOnly);
                var total = trashFolder.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);
                if (start > end) return Ok(new { messages = new List<object>(), total });
                IList<IMessageSummary> summaries;
                summaries = await trashFolder.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope!.Subject ?? string.Empty,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false
                    });
                }
                await client.DisconnectAsync(true);
                return Ok(new InboxResponse { Messages = messages, Total = total });
            }
        }
        catch (InvalidOperationException)
        {
            // Trashフォルダが存在しない場合、空のリストを返す
            return BadRequest(new { messages = new List<object>(), total = 0 });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch trash folder");
            return StatusCode(500, "Failed to fetch trash folder: " + ex.Message);
        }
    }

    /// <summary>
    /// Permanently delete a message from trash
    /// </summary>
    [HttpDelete("trash/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteFromTrash(string id, [FromQuery] Guid configId)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = configId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid message ID");
            var uid = new UniqueId(uidVal);

            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            var decryptedPassword = await _encryptionService.DecryptAsync(config.ImapPassword);
            await client.AuthenticateAsync(config.ImapUsername, decryptedPassword);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);
            await trashFolder.OpenAsync(FolderAccess.ReadWrite);
            await trashFolder.AddFlagsAsync(uid, MessageFlags.Deleted, true);
            await trashFolder.ExpungeAsync();

            await client.DisconnectAsync(true);
            return Ok(new { success = true, message = "Message permanently deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete message from trash");
            return StatusCode(500, "Failed to delete message: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Restore a message from trash to inbox
    /// </summary>
    [HttpPut("trash/restore/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> RestoreFromTrash(string id, [FromQuery] Guid configId)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = configId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            if (!uint.TryParse(id, out var uidVal)) return BadRequest("Invalid message ID");
            var uid = new UniqueId(uidVal);

            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            var decryptedPassword = await _encryptionService.DecryptAsync(config.ImapPassword);
            await client.AuthenticateAsync(config.ImapUsername, decryptedPassword);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);
            await trashFolder.OpenAsync(FolderAccess.ReadWrite);

            var inbox = client.Inbox;
            if (inbox == null) return NotFound("Inbox folder not found");
            await trashFolder.MoveToAsync(uid, inbox);

            await client.DisconnectAsync(true);
            return Ok(new { success = true, message = "Message restored to inbox" });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to restore message from trash");
            return StatusCode(500, "Failed to restore message: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Empty all messages from trash
    /// </summary>
    [HttpDelete("trash")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> EmptyTrash([FromQuery] Guid configId)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = configId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = configId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            var decryptedPassword = await _encryptionService.DecryptAsync(config.ImapPassword);
            await client.AuthenticateAsync(config.ImapUsername, decryptedPassword);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);
            await trashFolder.OpenAsync(FolderAccess.ReadWrite);

            // Mark all messages as deleted
            if (trashFolder.Count > 0)
            {
                var uids = await trashFolder.SearchAsync(MailKit.Search.SearchQuery.All);
                if (uids.Count > 0)
                {
                    await trashFolder.AddFlagsAsync(uids, MessageFlags.Deleted, true);
                    await trashFolder.ExpungeAsync();
                }
            }

            await client.DisconnectAsync(true);
            return Ok(new { success = true, message = "Trash emptied successfully" });
        }
        catch (FolderNotFoundException)
        {
            return Ok(new { success = true, message = "Trash folder is already empty or does not exist" });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to empty trash");
            return StatusCode(500, "Failed to empty trash: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    // ============================================================================
    // Bulk Operations
    // ============================================================================

    /// <summary>
    /// Move multiple messages to trash
    /// </summary>
    [HttpPost("bulk/move-to-trash")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> BulkMoveToTrash([FromBody] BulkMessageRequest request)
    {
        var userId = GetUserId();

        if (request.MessageIds == null || request.MessageIds.Count == 0)
            return BadRequest("No message IDs provided");

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = request.ConfigId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = request.ConfigId, user_id = userId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            await client.AuthenticateAsync(config.ImapUsername, password);

            // Get source folder (default to INBOX if not specified)
            IMailFolder? sourceFolder = !string.IsNullOrEmpty(request.SourceFolder) && request.SourceFolder != "INBOX"
                ? await client.GetFolderAsync(request.SourceFolder)
                : client.Inbox;
            if (sourceFolder == null) return NotFound("Inbox folder not found");
            await sourceFolder.OpenAsync(FolderAccess.ReadWrite);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);

            var uids = request.MessageIds.Select(id => new UniqueId((uint)id)).ToList();
            await sourceFolder.MoveToAsync(uids, trashFolder);

            await client.DisconnectAsync(true);
            return Ok(new { success = true, movedCount = uids.Count });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to bulk move messages to trash");
            return StatusCode(500, "Failed to move messages to trash: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Permanently delete multiple messages from trash
    /// </summary>
    [HttpPost("bulk/delete-from-trash")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> BulkDeleteFromTrash([FromBody] BulkMessageRequest request)
    {
        var userId = GetUserId();

        if (request.MessageIds == null || request.MessageIds.Count == 0)
            return BadRequest("No message IDs provided");

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = request.ConfigId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = request.ConfigId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            await client.AuthenticateAsync(config.ImapUsername, password);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);
            await trashFolder.OpenAsync(FolderAccess.ReadWrite);

            var uids = request.MessageIds.Select(id => new UniqueId((uint)id)).ToList();
            await trashFolder.AddFlagsAsync(uids, MessageFlags.Deleted, true);
            await trashFolder.ExpungeAsync();

            await client.DisconnectAsync(true);
            return Ok(new { success = true, deletedCount = uids.Count });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to bulk delete messages from trash");
            return StatusCode(500, "Failed to delete messages: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Restore multiple messages from trash to inbox
    /// </summary>
    [HttpPost("bulk/restore-from-trash")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> BulkRestoreFromTrash([FromBody] BulkMessageRequest request)
    {
        var userId = GetUserId();

        if (request.MessageIds == null || request.MessageIds.Count == 0)
            return BadRequest("No message IDs provided");

        try
        {
            await _db.OpenAsync();
            var config = await _db.GetAsync<UserServerConfig>(new { id = request.ConfigId, user_id = userId });
            if (config == null) return NotFound("Config not found");

            var folderPaths = await _db.GetMultipleAsync<ImapFolders>(new { config_id = request.ConfigId });
            var trashFolderPath = folderPaths
                .FirstOrDefault(f => f.ImapPath is "Trash" or "ゴミ箱")?.ImapPath;
            trashFolderPath ??= folderPaths.FirstOrDefault(f => f.DisplayName is "Trash" or "ゴミ箱")?
                .ImapPath ?? "Trash";

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            await client.AuthenticateAsync(config.ImapUsername, password);

            var trashFolder = await client.GetFolderAsync(trashFolderPath);
            await trashFolder.OpenAsync(FolderAccess.ReadWrite);

            var inbox = client.Inbox;
            if (inbox == null) return NotFound("Inbox folder not found");
            var uids = request.MessageIds.Select(id => new UniqueId((uint)id)).ToList();
            await trashFolder.MoveToAsync(uids, inbox);

            await client.DisconnectAsync(true);
            return Ok(new { success = true, restoredCount = uids.Count });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to bulk restore messages from trash");
            return StatusCode(500, "Failed to restore messages: " + ex.Message);
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpGet("thread-messages")]
    [ProducesResponseType(typeof(List<ThreadMessageSummaryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetThreadMessages(Guid configId, string threadKey, int maxMessages = 50)
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var configs = await _db.GetMultipleAsync<Models.UserServerConfig>(new { id = configId, user_id = userId });
            var config = configs.FirstOrDefault();
            if (config == null) return NotFound("Configuration not found");

            var password = await _encryptionService.DecryptAsync(config.ImapPassword);
            using var client = new ImapClient();
            await client.ConnectAsync(config.ImapHost, config.ImapPort, GetSecureSocketOptions(config.ImapPort, config.ImapSslEnabled));
            await client.AuthenticateAsync(config.ImapUsername, password);

            var inbox = client.Inbox;
            await inbox.OpenAsync(FolderAccess.ReadOnly);

            IList<UniqueId> uids;
            try
            {
                var query = MailKit.Search.SearchQuery.SubjectContains(threadKey);
                uids = await inbox.SearchAsync(query);
            }
            catch
            {
                var total = inbox.Count;
                var start = Math.Max(0, total - maxMessages);
                var fallback = await inbox.FetchAsync(start, total - 1, MessageSummaryItems.UniqueId | MessageSummaryItems.Envelope);
                uids = fallback.Select(s => s.UniqueId).ToList();
            }

            if (uids.Count == 0)
            {
                await client.DisconnectAsync(true);
                return Ok(new List<ThreadMessageSummaryResponse>());
            }

            var recentUids = uids.OrderByDescending(u => u.Id).Take(maxMessages).ToList();
            var summaries = await inbox.FetchAsync(recentUids, MessageSummaryItems.Envelope |
                MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId | MessageSummaryItems.Flags);

            var messages = new List<ThreadMessageSummaryResponse>();
            foreach (var s in summaries)
            {
                var normalizedSubject = NormalizeSubject(s.Envelope?.Subject ?? string.Empty);
                if (!string.IsNullOrEmpty(threadKey) && normalizedSubject != threadKey) continue;

                messages.Add(new ThreadMessageSummaryResponse
                {
                    Id = s.UniqueId.Id,
                    Subject = s.Envelope?.Subject ?? string.Empty,
                    From = s.Envelope?.From.ToString() ?? string.Empty,
                    To = s.Envelope?.To.ToString() ?? string.Empty,
                    Cc = s.Envelope?.Cc.ToString() ?? string.Empty,
                    Date = s.InternalDate ?? s.Date,
                    IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false,
                    MessageId = s.Envelope?.MessageId,
                    InReplyTo = s.Envelope?.InReplyTo,
                    ThreadKey = normalizedSubject
                });
            }

            messages = messages.OrderBy(m => m.Date).ToList();
            await client.DisconnectAsync(true);
            return Ok(messages);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch thread messages");
            return StatusCode(500, "Failed to fetch thread messages: " + ex.Message);
        }
    }

    private string NormalizeSubject(string subject)
    {
        if (string.IsNullOrEmpty(subject)) return string.Empty;
        var normalized = subject.Trim();
        var prefixes = new[] { "re:", "fwd:", "fw:", "aw:", "tr:", "rés:", "ref:" };
        bool changed = true;
        while (changed)
        {
            changed = false;
            foreach (var prefix in prefixes)
            {
                if (normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    normalized = normalized.Substring(prefix.Length).Trim();
                    changed = true;
                    break;
                }
            }
        }
        return normalized.ToLowerInvariant();
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
