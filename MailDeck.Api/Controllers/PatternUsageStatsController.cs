using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace MailDeck.Api.Controllers;

/// <summary>
/// Controller for tracking and retrieving pattern usage statistics
/// </summary>
[Authorize]
[ApiController]
[Route("api/pattern-usage-stats")]
[Produces("application/json")]
public class PatternUsageStatsController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public PatternUsageStatsController(PostgreSqlConnect db, ILogger<PatternUsageStatsController> logger)
        : base(logger)
    {
        _db = db;
    }

    /// <summary>
    /// Record a pattern usage event (copy, link_click, highlight_copy)
    /// </summary>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> RecordUsage([FromBody] RecordUsageRequest request)
    {
        var userId = GetUserId();

        // Validate action type
        var validActionTypes = new[] { "copy", "link_click", "highlight_copy" };
        if (!validActionTypes.Contains(request.ActionType?.ToLowerInvariant()))
        {
            return BadRequest("Invalid action type. Must be one of: copy, link_click, highlight_copy.");
        }

        try
        {
            await _db.OpenAsync();

            // Verify pattern exists and belongs to user
            var pattern = await _db.GetAsync<CustomActionPattern>(new { id = request.PatternId });
            if (pattern == null || pattern.UserId != userId)
            {
                return NotFound("Pattern not found or access denied.");
            }

            // Create usage stat record
            var stat = new PatternUsageStat
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                PatternId = request.PatternId,
                ActionType = request.ActionType!.ToLowerInvariant(),
                MatchedValueHash = !string.IsNullOrEmpty(request.MatchedValue)
                    ? ComputeSha256Hash(request.MatchedValue)
                    : null,
                CreatedAt = DateTime.UtcNow
            };

            await _db.InsertAsync(stat);

            return Ok(new { id = stat.Id });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to record pattern usage for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Get usage statistics for the user's patterns
    /// </summary>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetStats([FromQuery] int days = 30)
    {
        var userId = GetUserId();

        if (days < 1 || days > 365)
        {
            return BadRequest("Days must be between 1 and 365.");
        }

        try
        {
            await _db.OpenAsync();

            var cutoffDate = DateTime.UtcNow.AddDays(-days);

            // Get all user's patterns
            var patterns = await _db.GetMultipleAsync<CustomActionPattern>(new { user_id = userId });
            var patternDict = patterns.ToDictionary(p => p.Id);

            // Get usage stats for user
            var allStats = await _db.GetMultipleAsync<PatternUsageStat>(new { user_id = userId });
            var recentStats = allStats.Where(s => s.CreatedAt >= cutoffDate).ToList();

            // Aggregate stats by pattern
            var patternStats = recentStats
                .GroupBy(s => s.PatternId)
                .Select(g => new
                {
                    patternId = g.Key,
                    patternName = patternDict.TryGetValue(g.Key, out var p) ? p.PatternName : "Unknown",
                    patternType = patternDict.TryGetValue(g.Key, out var pt) ? pt.PatternType : "unknown",
                    totalUsage = g.Count(),
                    copyCount = g.Count(s => s.ActionType == "copy" || s.ActionType == "highlight_copy"),
                    linkClickCount = g.Count(s => s.ActionType == "link_click"),
                    lastUsed = g.Max(s => s.CreatedAt)
                })
                .OrderByDescending(x => x.totalUsage)
                .ToList();

            // Aggregate stats by action type
            var actionStats = new
            {
                copy = recentStats.Count(s => s.ActionType == "copy"),
                linkClick = recentStats.Count(s => s.ActionType == "link_click"),
                highlightCopy = recentStats.Count(s => s.ActionType == "highlight_copy")
            };

            // Daily usage trend
            var dailyTrend = recentStats
                .GroupBy(s => s.CreatedAt.Date)
                .Select(g => new
                {
                    date = g.Key.ToString("yyyy-MM-dd"),
                    count = g.Count()
                })
                .OrderBy(x => x.date)
                .ToList();

            return Ok(new
            {
                period = days,
                totalUsage = recentStats.Count,
                patternStats = patternStats,
                actionStats = actionStats,
                dailyTrend = dailyTrend
            });
        }
        catch (InvalidOperationException)
        {
            return Ok(new
            {
                period = days,
                totalUsage = 0,
                patternStats = new List<object>(),
                actionStats = new { copy = 0, linkClick = 0, highlightCopy = 0 },
                dailyTrend = new List<object>()
            });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch pattern usage stats for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Get stats for a specific pattern
    /// </summary>
    [HttpGet("{patternId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetPatternStats(Guid patternId, [FromQuery] int days = 30)
    {
        var userId = GetUserId();

        if (days < 1 || days > 365)
        {
            return BadRequest("Days must be between 1 and 365.");
        }

        try
        {
            await _db.OpenAsync();

            // Verify pattern ownership
            var pattern = await _db.GetAsync<CustomActionPattern>(new { id = patternId });
            if (pattern == null || pattern.UserId != userId)
            {
                return NotFound("Pattern not found or access denied.");
            }

            var cutoffDate = DateTime.UtcNow.AddDays(-days);

            // Get usage stats for this pattern
            var allStats = await _db.GetMultipleAsync<PatternUsageStat>(new { pattern_id = patternId });
            var recentStats = allStats.Where(s => s.CreatedAt >= cutoffDate).ToList();

            var dailyTrend = recentStats
                .GroupBy(s => s.CreatedAt.Date)
                .Select(g => new
                {
                    date = g.Key.ToString("yyyy-MM-dd"),
                    count = g.Count()
                })
                .OrderBy(x => x.date)
                .ToList();

            return Ok(new
            {
                patternId = patternId,
                patternName = pattern.PatternName,
                period = days,
                totalUsage = recentStats.Count,
                copyCount = recentStats.Count(s => s.ActionType == "copy" || s.ActionType == "highlight_copy"),
                linkClickCount = recentStats.Count(s => s.ActionType == "link_click"),
                dailyTrend = dailyTrend
            });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch stats for pattern {PatternId}", patternId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    private static string ComputeSha256Hash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

public class RecordUsageRequest
{
    public Guid PatternId { get; set; }
    public string? ActionType { get; set; }
    public string? MatchedValue { get; set; }
}
