using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

/// <summary>
/// Controller for system preset patterns that users can import
/// </summary>
[Authorize]
[ApiController]
[Route("api/system-preset-patterns")]
public class SystemPresetPatternsController : ControllerBase
{
    private readonly PostgreSqlConnect _db;
    private readonly ILogger<SystemPresetPatternsController> _logger;

    public SystemPresetPatternsController(PostgreSqlConnect db, ILogger<SystemPresetPatternsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Get all system preset patterns
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetPresets([FromQuery] string? category = null)
    {
        try
        {
            await _db.OpenAsync();

            IEnumerable<SystemPresetPattern> presets;

            if (!string.IsNullOrEmpty(category))
            {
                presets = await _db.GetMultipleAsync<SystemPresetPattern>(new { category = category });
            }
            else
            {
                presets = await _db.GetMultipleAsync<SystemPresetPattern>(new { });
            }

            var result = presets
                .OrderByDescending(p => p.IsRecommended)
                .ThenBy(p => p.Category)
                .ThenByDescending(p => p.Priority)
                .ToList();

            return Ok(result);
        }
        catch (InvalidOperationException)
        {
            return Ok(new List<SystemPresetPattern>());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch system preset patterns");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Get distinct categories
    /// </summary>
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        try
        {
            await _db.OpenAsync();

            var presets = await _db.GetMultipleAsync<SystemPresetPattern>(new { });
            var categories = presets
                .Where(p => !string.IsNullOrEmpty(p.Category))
                .Select(p => p.Category!)
                .Distinct()
                .OrderBy(c => c)
                .ToList();

            return Ok(categories);
        }
        catch (InvalidOperationException)
        {
            return Ok(new List<string>());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch preset categories");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Import a system preset pattern as a user pattern
    /// </summary>
    [HttpPost("{presetId}/import")]
    public async Task<IActionResult> ImportPreset(Guid presetId)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();

            // Get the preset pattern
            var preset = await _db.GetAsync<SystemPresetPattern>(new { id = presetId });

            if (preset == null)
            {
                return NotFound($"Preset pattern with ID {presetId} not found.");
            }

            // Check if user already has a pattern with this name
            try
            {
                var existingPattern = await _db.GetAsync<CustomActionPattern>(new
                {
                    user_id = userId,
                    pattern_name = preset.PatternName
                });

                if (existingPattern != null)
                {
                    return Conflict($"You already have a pattern named '{preset.PatternName}'. Please rename or delete it before importing.");
                }
            }
            catch (InvalidOperationException)
            {
                // No existing pattern, proceed
            }

            // Create user pattern from preset
            var userPattern = new CustomActionPattern
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                PatternName = preset.PatternName,
                PatternType = preset.PatternType,
                RegexPattern = preset.RegexPattern,
                ActionType = preset.ActionType,
                LinkTemplate = preset.LinkTemplate,
                Priority = preset.Priority,
                Description = preset.Description,
                IsEnabled = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _db.InsertAsync(userPattern);

            _logger.LogInformation("User {UserId} imported preset pattern {PresetId} as {PatternId}",
                userId, presetId, userPattern.Id);

            return CreatedAtAction(nameof(GetPresets), new { id = userPattern.Id }, userPattern);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to import preset pattern {PresetId} for user {UserId}",
                presetId, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Import multiple presets at once
    /// </summary>
    [HttpPost("import-multiple")]
    public async Task<IActionResult> ImportMultiplePresets([FromBody] List<Guid> presetIds)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        if (presetIds == null || presetIds.Count == 0)
        {
            return BadRequest("At least one preset ID is required.");
        }

        if (presetIds.Count > 20)
        {
            return BadRequest("Maximum 20 presets can be imported at once.");
        }

        try
        {
            await _db.OpenAsync();

            var imported = new List<CustomActionPattern>();
            var skipped = new List<string>();

            foreach (var presetId in presetIds.Distinct())
            {
                // Get the preset pattern
                SystemPresetPattern? preset;
                try
                {
                    preset = await _db.GetAsync<SystemPresetPattern>(new { id = presetId });
                }
                catch (InvalidOperationException)
                {
                    skipped.Add($"Preset {presetId} not found");
                    continue;
                }

                if (preset == null)
                {
                    skipped.Add($"Preset {presetId} not found");
                    continue;
                }

                // Check if user already has a pattern with this name
                try
                {
                    var existingPattern = await _db.GetAsync<CustomActionPattern>(new
                    {
                        user_id = userId,
                        pattern_name = preset.PatternName
                    });

                    if (existingPattern != null)
                    {
                        skipped.Add($"'{preset.PatternName}' already exists");
                        continue;
                    }
                }
                catch (InvalidOperationException)
                {
                    // No existing pattern, proceed
                }

                // Create user pattern from preset
                var userPattern = new CustomActionPattern
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    PatternName = preset.PatternName,
                    PatternType = preset.PatternType,
                    RegexPattern = preset.RegexPattern,
                    ActionType = preset.ActionType,
                    LinkTemplate = preset.LinkTemplate,
                    Priority = preset.Priority,
                    Description = preset.Description,
                    IsEnabled = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                await _db.InsertAsync(userPattern);
                imported.Add(userPattern);
            }

            _logger.LogInformation("User {UserId} imported {Count} preset patterns", userId, imported.Count);

            return Ok(new
            {
                imported = imported,
                skipped = skipped,
                importedCount = imported.Count,
                skippedCount = skipped.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to import multiple preset patterns for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
