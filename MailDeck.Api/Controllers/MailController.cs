using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.Mail;
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
public class MailController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;
    private readonly Services.IEncryptionService _encryptionService;

    public MailController(
        ILogger<MailController> logger,
        PostgreSqlConnect db,
        Services.IEncryptionService encryptionService)
        : base(logger)
    {
        _db = db;
        _encryptionService = encryptionService;
    }

    [HttpGet("inbox")]
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

                await inbox.OpenAsync(FolderAccess.ReadOnly);

                var total = inbox.Count;
                var start = Math.Max(0, total - (page * pageSize));
                var end = Math.Max(0, total - ((page - 1) * pageSize) - 1);

                if (start > end) return Ok(new { messages = new List<object>(), total });

                IList<IMessageSummary> summaries;

                summaries = await inbox.FetchAsync(start, end, MessageSummaryItems.Envelope |
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);

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
                        Subject = s.Envelope.Subject,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false,
                        Labels = labels
                    });
                }

                messages = messages.OrderByDescending(m => m.Date).ToList();

                await client.DisconnectAsync(true);

                return Ok(new InboxResponse { Messages = messages, Total = total });
            }
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch inbox");
            return StatusCode(500, "Failed to fetch inbox: " + ex.Message);
        }
    }

    [HttpGet("inbox/{folder-name}")]
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
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);
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
                        Subject = s.Envelope.Subject,
                        From = s.Envelope.From.ToString(),
                        Date = s.InternalDate ?? s.Date.DateTime,
                        IsRead = s.Flags?.HasFlag(MessageFlags.Seen) ?? false,
                        Labels = labels
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

                await inbox.OpenAsync(FolderAccess.ReadOnly);

                MimeMessage message;

                message = await inbox.GetMessageAsync(uid);

                var result = new MailMessageDetailResponse
                {
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
            _logger.LogErrorWithSql(ex, "Failed to fetch message");
            return StatusCode(500, "Failed to fetch message: " + ex.Message);
        }
    }

    [HttpDelete("message/{id}")]
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

    [HttpPost("send")]
    public async Task<IActionResult> SendMail([FromBody] EmailRequest request)
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
            _logger.LogErrorWithSql(ex, "Failed to send email");
            return StatusCode(500, "Failed to send email: " + ex.Message);
        }
    }

    [HttpPost("draft")]
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
            _logger.LogErrorWithSql(ex, "Failed to fetch draft");
            return StatusCode(500, "Failed to fetch draft: " + ex.Message);
        }
    }

    [HttpPut("draft/{id}")]
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
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope.Subject,
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
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope.Subject,
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
                await inbox.OpenAsync(FolderAccess.ReadWrite);
                var trashFolder = await client.GetFolderAsync(trashFolderPath);
                await trashFolder.OpenAsync(FolderAccess.ReadWrite);
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
                    MessageSummaryItems.InternalDate | MessageSummaryItems.UniqueId);
                var messages = new List<MailMessageResponse>();
                foreach (var s in summaries)
                {
                    messages.Add(new MailMessageResponse
                    {
                        Id = s.UniqueId.Id,
                        Subject = s.Envelope.Subject,
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
