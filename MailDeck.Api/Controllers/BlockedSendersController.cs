using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/blocked-senders")]
[Produces("application/json")]
public class BlockedSendersController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public BlockedSendersController(PostgreSqlConnect db, ILogger<BlockedSendersController> logger)
        : base(logger)
    {
        _db = db;
    }

    [HttpGet]
    [ProducesResponseType(typeof(List<BlockedSender>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetBlockedSenders()
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var senders = await _db.GetMultipleAsync<BlockedSender>(new { user_id = userId });
            return Ok(senders.OrderByDescending(s => s.CreatedAt).ToList());
        }
        catch (InvalidOperationException)
        {
            return Ok(new List<BlockedSender>());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch blocked senders for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpPost]
    [ProducesResponseType(typeof(BlockedSender), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> CreateBlockedSender([FromBody] CreateBlockedSenderRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrWhiteSpace(request.EmailAddress))
        {
            return BadRequest("Email address is required.");
        }

        try
        {
            await _db.OpenAsync();

            var existing = await _db.GetMultipleAsync<BlockedSender>(new { user_id = userId });
            if (existing.Any(s => s.EmailAddress.Equals(request.EmailAddress, StringComparison.OrdinalIgnoreCase)))
            {
                return Conflict("This email address is already blocked.");
            }

            var sender = new BlockedSender
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                EmailAddress = request.EmailAddress.Trim().ToLowerInvariant(),
                Note = request.Note,
                IsEnabled = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var result = await _db.InsertAsync(sender);
            return result > 0 ? Ok(sender) : StatusCode(500, "Insert failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to create blocked sender for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpPut("{id}")]
    [ProducesResponseType(typeof(BlockedSender), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateBlockedSender(Guid id, [FromBody] UpdateBlockedSenderRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrWhiteSpace(request.EmailAddress))
        {
            return BadRequest("Email address is required.");
        }

        try
        {
            await _db.OpenAsync();

            var sender = await _db.GetAsync<BlockedSender>(id);
            if (sender == null || sender.UserId != userId)
            {
                return NotFound("Blocked sender not found.");
            }

            var existing = await _db.GetMultipleAsync<BlockedSender>(new { user_id = userId });
            if (existing.Any(s => s.EmailAddress.Equals(request.EmailAddress, StringComparison.OrdinalIgnoreCase) && s.Id != id))
            {
                return Conflict("This email address is already blocked.");
            }

            sender.EmailAddress = request.EmailAddress.Trim().ToLowerInvariant();
            sender.Note = request.Note;
            sender.IsEnabled = request.IsEnabled;
            sender.UpdatedAt = DateTime.UtcNow;

            var result = await _db.UpdateAsync(sender);
            return result > 0 ? Ok(sender) : StatusCode(500, "Update failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update blocked sender {Id} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteBlockedSender(Guid id)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();

            var sender = await _db.GetAsync<BlockedSender>(id);
            if (sender == null || sender.UserId != userId)
            {
                return NotFound("Blocked sender not found.");
            }

            var result = await _db.DeleteAsync<BlockedSender>(id);
            return result > 0 ? Ok(new { message = "Blocked sender deleted successfully" }) : StatusCode(500, "Delete failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete blocked sender {Id} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpPost("{id}/toggle")]
    [ProducesResponseType(typeof(BlockedSender), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ToggleBlockedSender(Guid id)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();

            var sender = await _db.GetAsync<BlockedSender>(id);
            if (sender == null || sender.UserId != userId)
            {
                return NotFound("Blocked sender not found.");
            }

            sender.IsEnabled = !sender.IsEnabled;
            sender.UpdatedAt = DateTime.UtcNow;

            var result = await _db.UpdateAsync(sender);
            return result > 0 ? Ok(sender) : StatusCode(500, "Toggle failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to toggle blocked sender {Id} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}

public record CreateBlockedSenderRequest(string EmailAddress, string? Note);
public record UpdateBlockedSenderRequest(string EmailAddress, string? Note, bool IsEnabled);
