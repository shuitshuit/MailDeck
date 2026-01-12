using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class LabelsController : ControllerBase
{
    private readonly PostgreSqlConnect _db;
    private readonly ILogger<LabelsController> _logger;

    public LabelsController(PostgreSqlConnect db, ILogger<LabelsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Get all labels for the authenticated user
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetLabels()
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";
        try
        {
            await _db.OpenAsync();
            var labels = await _db.GetMultipleAsync<Label>(new { user_id = userId });
            return Ok(labels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch labels for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Create a new label
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateLabel([FromBody] Label label)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (string.IsNullOrWhiteSpace(label.Name))
        {
            return BadRequest("Label name is required.");
        }

        // Validate color format (HEX)
        if (!string.IsNullOrWhiteSpace(label.Color) && !System.Text.RegularExpressions.Regex.IsMatch(label.Color, @"^#[0-9A-Fa-f]{6}$"))
        {
            return BadRequest("Color must be a valid HEX format (#RRGGBB).");
        }

        label.UserId = userId;
        label.Id = Guid.NewGuid();
        label.CreatedAt = DateTime.UtcNow;
        label.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _db.OpenAsync();

            // Check for duplicate label name
            var existing = await _db.GetMultipleAsync<Label>(new { user_id = userId, name = label.Name });
            if (existing.Any())
            {
                return Conflict("A label with this name already exists.");
            }

            var result = await _db.InsertAsync(label);
            return result > 0 ? Ok(label) : StatusCode(500, "Insert failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create label for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Update an existing label
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateLabel(string id, [FromBody] Label label)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (!Guid.TryParse(id, out var labelId))
        {
            return BadRequest("Invalid label ID.");
        }

        if (string.IsNullOrWhiteSpace(label.Name))
        {
            return BadRequest("Label name is required.");
        }

        // Validate color format
        if (!string.IsNullOrWhiteSpace(label.Color) && !System.Text.RegularExpressions.Regex.IsMatch(label.Color, @"^#[0-9A-Fa-f]{6}$"))
        {
            return BadRequest("Color must be a valid HEX format (#RRGGBB).");
        }

        try
        {
            await _db.OpenAsync();

            // Get existing label
            var existing = await _db.GetAsync<Label>(labelId);
            if (existing == null || existing.UserId != userId)
            {
                return NotFound("Label not found.");
            }

            // Check for duplicate name (excluding current label)
            var duplicate = await _db.GetMultipleAsync<Label>(new { user_id = userId, name = label.Name });
            if (duplicate.Any(l => l.Id != labelId))
            {
                return Conflict("A label with this name already exists.");
            }

            // Update fields
            existing.Name = label.Name;
            existing.Color = label.Color ?? existing.Color;
            existing.UpdatedAt = DateTime.UtcNow;

            await _db.UpdateAsync(existing);
            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update label {LabelId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Delete a label (cascade deletes all mail_labels associations)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteLabel(string id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (!Guid.TryParse(id, out var labelId))
        {
            return BadRequest("Invalid label ID.");
        }

        try
        {
            await _db.OpenAsync();

            var label = await _db.GetAsync<Label>(labelId);
            if (label == null || label.UserId != userId)
            {
                return NotFound("Label not found.");
            }

            await _db.DeleteAsync(label);
            return Ok(new { message = "Label deleted successfully." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete label {LabelId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Get all labels for a specific message
    /// </summary>
    [HttpGet("message/{messageId}")]
    public async Task<IActionResult> GetLabelsForMessage(int messageId, [FromQuery] string serverConfigId)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (string.IsNullOrWhiteSpace(serverConfigId))
        {
            return BadRequest("serverConfigId is required.");
        }

        if (!Guid.TryParse(serverConfigId, out var configId))
        {
            return BadRequest("Invalid serverConfigId.");
        }

        try
        {
            await _db.OpenAsync();

            // Get mail_labels for this message
            var mailLabels = await _db.GetMultipleAsync<MailLabel>(new
            {
                user_id = userId,
                message_id = messageId,
                server_config_id = configId
            });

            // Get label details
            var labelIds = mailLabels.Select(ml => ml.LabelId).ToList();
            if (!labelIds.Any())
            {
                return Ok(new List<Label>());
            }

            var labels = new List<Label>();
            foreach (var labelId in labelIds)
            {
                var label = await _db.GetAsync<Label>(labelId);
                if (label != null)
                {
                    labels.Add(label);
                }
            }

            return Ok(labels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch labels for message {MessageId}", messageId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Add a label to a message
    /// </summary>
    [HttpPost("message")]
    public async Task<IActionResult> AddLabelToMessage([FromBody] AddLabelRequest request)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (string.IsNullOrWhiteSpace(request.LabelId) || string.IsNullOrWhiteSpace(request.ServerConfigId))
        {
            return BadRequest("MessageId, LabelId, and ServerConfigId are required.");
        }

        if (!Guid.TryParse(request.LabelId, out var labelId) || !Guid.TryParse(request.ServerConfigId, out var configId))
        {
            return BadRequest("Invalid LabelId or ServerConfigId.");
        }

        try
        {
            await _db.OpenAsync();

            // Verify label belongs to user
            var label = await _db.GetAsync<Label>(labelId);
            if (label == null || label.UserId != userId)
            {
                return NotFound("Label not found.");
            }

            // Check if already exists
            var existing = await _db.GetMultipleAsync<MailLabel>(new
            {
                user_id = userId,
                message_id = request.MessageId,
                label_id = labelId,
                server_config_id = configId
            });

            if (existing.Any())
            {
                return Conflict("Label already applied to this message.");
            }

            // Create mail_label association
            var mailLabel = new MailLabel
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                MessageId = request.MessageId,
                LabelId = labelId,
                ServerConfigId = configId,
                CreatedAt = DateTime.UtcNow
            };

            var result = await _db.InsertAsync(mailLabel);
            return result > 0 ? Ok(mailLabel) : StatusCode(500, "Insert failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add label to message {MessageId}", request.MessageId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Remove a label from a message
    /// </summary>
    [HttpDelete("message")]
    public async Task<IActionResult> RemoveLabelFromMessage([FromQuery] int messageId, [FromQuery] string labelId, [FromQuery] string serverConfigId)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (string.IsNullOrWhiteSpace(labelId) || string.IsNullOrWhiteSpace(serverConfigId))
        {
            return BadRequest("messageId, labelId, and serverConfigId are required.");
        }

        if (!Guid.TryParse(labelId, out var parsedLabelId) || !Guid.TryParse(serverConfigId, out var configId))
        {
            return BadRequest("Invalid labelId or serverConfigId.");
        }

        try
        {
            await _db.OpenAsync();

            // Find the mail_label record
            var mailLabels = await _db.GetMultipleAsync<MailLabel>(new
            {
                user_id = userId,
                message_id = messageId,
                label_id = parsedLabelId,
                server_config_id = configId
            });

            if (!mailLabels.Any())
            {
                return NotFound("Label association not found.");
            }

            foreach (var mailLabel in mailLabels)
            {
                await _db.DeleteAsync(mailLabel);
            }

            return Ok(new { message = "Label removed from message." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove label from message {MessageId}", messageId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}

/// <summary>
/// Request model for adding label to message
/// </summary>
public class AddLabelRequest
{
    public int MessageId { get; set; }
    public string LabelId { get; set; } = string.Empty;
    public string ServerConfigId { get; set; } = string.Empty;
}
