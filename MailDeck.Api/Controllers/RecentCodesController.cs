using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

/// <summary>
/// API for retrieving recently detected OTP codes.
/// Provides quick access to codes without re-scanning emails.
/// </summary>
[ApiController]
[Route("api/custom-actions/recent-codes")]
[Authorize]
public class RecentCodesController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public RecentCodesController(PostgreSqlConnect db, ILogger<RecentCodesController> logger)
        : base(logger)
    {
        _db = db;
    }

    /// <summary>
    /// Get all valid (non-expired) recent OTP codes for the current user.
    /// Ordered by creation time descending (newest first).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetRecentCodes()
    {
        var userId = GetUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new { error = "User ID not found in token" });
        }

        try
        {
            await _db.OpenAsync();

            // Get all codes for this user
            var allCodes = await _db.GetMultipleAsync<RecentOtpCode>(new { user_id = userId });

            // Filter non-expired codes and order by creation time DESC
            var codes = allCodes
                .Where(c => c.ExpiresAt > DateTime.UtcNow)
                .OrderByDescending(c => c.CreatedAt)
                .ToList();

            _logger.LogInformation("Retrieved {Count} recent OTP codes for user {UserId}", codes.Count, userId);

            return Ok(codes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve recent OTP codes for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to retrieve recent codes" });
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Delete a specific recent OTP code.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRecentCode(Guid id)
    {
        var userId = GetUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new { error = "User ID not found in token" });
        }

        try
        {
            await _db.OpenAsync();

            // Verify ownership before deleting
            var code = await _db.GetAsync<RecentOtpCode>(id);
            if (code == null)
            {
                return NotFound(new { error = "Code not found" });
            }

            if (code.UserId != userId)
            {
                return Forbid();
            }

            await _db.DeleteAsync<RecentOtpCode>(id);

            _logger.LogInformation("Deleted recent OTP code {CodeId} for user {UserId}", id, userId);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete recent OTP code {CodeId} for user {UserId}", id, userId);
            return StatusCode(500, new { error = "Failed to delete code" });
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Clear all recent OTP codes for the current user.
    /// </summary>
    [HttpDelete]
    public async Task<IActionResult> ClearAllRecentCodes()
    {
        var userId = GetUserId();
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new { error = "User ID not found in token" });
        }

        try
        {
            await _db.OpenAsync();

            var deletedCount = await _db.ExecuteAsync(
                "DELETE FROM recent_otp_codes WHERE user_id = @UserId",
                new { UserId = userId }
            );

            _logger.LogInformation("Cleared {Count} recent OTP codes for user {UserId}", deletedCount, userId);

            return Ok(new { deletedCount });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear recent OTP codes for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to clear codes" });
        }
        finally
        {
            _db.Close();
        }
    }
}
