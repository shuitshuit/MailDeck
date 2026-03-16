using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;
using System.Text.RegularExpressions;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/custom-action-patterns")]
[Produces("application/json")]
public class CustomActionPatternsController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public CustomActionPatternsController(PostgreSqlConnect db, ILogger<CustomActionPatternsController> logger)
        : base(logger)
    {
        _db = db;
    }

    /// <summary>
    /// Get all custom action patterns for the authenticated user
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<CustomActionPattern>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetPatterns()
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var patterns = await _db.GetMultipleAsync<CustomActionPattern>(new { user_id = userId });

            // Sort by priority descending and then by created_at descending
            var sortedPatterns = patterns
                .OrderByDescending(p => p.Priority)
                .ThenByDescending(p => p.CreatedAt)
                .ToList();

            return Ok(sortedPatterns);
        }
        catch (InvalidOperationException)
        {
            // Return empty array if no patterns found
            return Ok(new List<CustomActionPattern>());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch custom action patterns for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Create a new custom action pattern
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(CustomActionPattern), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> CreatePattern([FromBody] CustomActionPattern pattern)
    {
        var userId = GetUserId();

        // Validation
        if (string.IsNullOrWhiteSpace(pattern.PatternName))
        {
            return BadRequest("Pattern name is required.");
        }

        // Validate regex pattern(s)
        var hasMultiplePatterns = pattern.RegexPatterns?.Patterns?.Count > 0;
        if (!hasMultiplePatterns && string.IsNullOrWhiteSpace(pattern.RegexPattern))
        {
            return BadRequest("Regex pattern is required.");
        }

        if (hasMultiplePatterns)
        {
            var validLogicalOps = new[] { "AND", "OR" };
            for (int i = 0; i < pattern.RegexPatterns!.Patterns.Count; i++)
            {
                var entry = pattern.RegexPatterns.Patterns[i];
                if (string.IsNullOrWhiteSpace(entry.Regex))
                    return BadRequest($"Regex pattern at index {i} is empty.");
                try
                {
                    var _ = new Regex(entry.Regex, RegexOptions.None, TimeSpan.FromSeconds(1));
                }
                catch (ArgumentException)
                {
                    return BadRequest($"Invalid regular expression at index {i}: '{entry.Regex}'.");
                }
                if (i < pattern.RegexPatterns.Patterns.Count - 1 && !string.IsNullOrWhiteSpace(entry.NextOperator))
                {
                    if (!validLogicalOps.Contains(entry.NextOperator.ToUpperInvariant()))
                        return BadRequest($"Invalid nextOperator '{entry.NextOperator}' at index {i}. Must be 'AND' or 'OR'.");
                }
            }
            // Keep regex_pattern in sync with first entry for backward compatibility
            pattern.RegexPattern = pattern.RegexPatterns.Patterns[0].Regex;
        }
        else
        {
            try
            {
                var _ = new Regex(pattern.RegexPattern, RegexOptions.None, TimeSpan.FromSeconds(1));
            }
            catch (ArgumentException)
            {
                return BadRequest("Invalid regular expression pattern.");
            }
            // Normalize to multi-pattern structure
            pattern.RegexPatterns = new RegexPatterns
            {
                Patterns = [new RegexPatternEntry { Regex = pattern.RegexPattern }]
            };
        }

        // Validate pattern type
        var validPatternTypes = new[] { "otp", "tracking", "token", "custom" };
        if (!validPatternTypes.Contains(pattern.PatternType.ToLowerInvariant()))
        {
            return BadRequest($"Invalid pattern type '{pattern.PatternType}'. Must be one of: otp, tracking, token, custom.");
        }

        // Validate action type
        var validActionTypes = new[] { "copy", "link", "highlight" };
        if (!validActionTypes.Contains(pattern.ActionType.ToLowerInvariant()))
        {
            return BadRequest($"Invalid action type '{pattern.ActionType}'. Must be one of: copy, link, highlight.");
        }

        // Validate priority
        if (pattern.Priority < 0 || pattern.Priority > 999)
        {
            return BadRequest("Priority must be between 0 and 999.");
        }

        // Validate link template for 'link' action type
        if (pattern.ActionType.ToLowerInvariant() == "link")
        {
            if (string.IsNullOrWhiteSpace(pattern.LinkTemplate))
            {
                return BadRequest("Link template is required for 'link' action type.");
            }

            // Validate link template contains {value} placeholder
            if (!pattern.LinkTemplate.Contains("{value}"))
            {
                return BadRequest("Link template must contain {value} placeholder.");
            }

            // Basic URL validation
            if (!pattern.LinkTemplate.StartsWith("http://") && !pattern.LinkTemplate.StartsWith("https://"))
            {
                return BadRequest("Link template must start with http:// or https://.");
            }

            // Validate link template length
            if (pattern.LinkTemplate.Length > 2048)
            {
                return BadRequest("Link template must be 2048 characters or less.");
            }
        }
        else
        {
            // Clear link template for non-link action types
            pattern.LinkTemplate = null;
        }

        try
        {
            await _db.OpenAsync();

            // Check for duplicate pattern name for this user
            try
            {
                var existingPattern = await _db.GetAsync<CustomActionPattern>(new
                {
                    user_id = userId,
                    pattern_name = pattern.PatternName
                });

                if (existingPattern != null)
                {
                    return Conflict($"A pattern with the name '{pattern.PatternName}' already exists.");
                }
            }
            catch (InvalidOperationException)
            {
                // No existing pattern found, this is expected
            }

            // Set system-managed fields
            pattern.Id = Guid.NewGuid();
            pattern.UserId = userId;
            pattern.CreatedAt = DateTime.UtcNow;
            pattern.UpdatedAt = DateTime.UtcNow;

            await _db.InsertAsync(pattern);

            _logger.LogInformation("Created custom action pattern {PatternId} for user {UserId}", pattern.Id, userId);
            return CreatedAtAction(nameof(GetPatterns), new { id = pattern.Id }, pattern);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to create custom action pattern for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Update an existing custom action pattern
    /// </summary>
    [HttpPut("{id}")]
    [ProducesResponseType(typeof(CustomActionPattern), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdatePattern(Guid id, [FromBody] CustomActionPattern updatedPattern)
    {
        var userId = GetUserId();

        // Validation
        if (string.IsNullOrWhiteSpace(updatedPattern.PatternName))
        {
            return BadRequest("Pattern name is required.");
        }

        // Validate regex pattern(s)
        var hasMultiplePatternsUpd = updatedPattern.RegexPatterns?.Patterns?.Count > 0;
        if (!hasMultiplePatternsUpd && string.IsNullOrWhiteSpace(updatedPattern.RegexPattern))
        {
            return BadRequest("Regex pattern is required.");
        }

        if (hasMultiplePatternsUpd)
        {
            var validLogicalOpsUpd = new[] { "AND", "OR" };
            for (int i = 0; i < updatedPattern.RegexPatterns!.Patterns.Count; i++)
            {
                var entry = updatedPattern.RegexPatterns.Patterns[i];
                if (string.IsNullOrWhiteSpace(entry.Regex))
                    return BadRequest($"Regex pattern at index {i} is empty.");
                try
                {
                    var _ = new Regex(entry.Regex, RegexOptions.None, TimeSpan.FromSeconds(1));
                }
                catch (ArgumentException)
                {
                    return BadRequest($"Invalid regular expression at index {i}: '{entry.Regex}'.");
                }
                if (i < updatedPattern.RegexPatterns.Patterns.Count - 1 && !string.IsNullOrWhiteSpace(entry.NextOperator))
                {
                    if (!validLogicalOpsUpd.Contains(entry.NextOperator.ToUpperInvariant()))
                        return BadRequest($"Invalid nextOperator '{entry.NextOperator}' at index {i}. Must be 'AND' or 'OR'.");
                }
            }
            updatedPattern.RegexPattern = updatedPattern.RegexPatterns.Patterns[0].Regex;
        }
        else
        {
            try
            {
                var _ = new Regex(updatedPattern.RegexPattern, RegexOptions.None, TimeSpan.FromSeconds(1));
            }
            catch (ArgumentException)
            {
                return BadRequest("Invalid regular expression pattern.");
            }
            updatedPattern.RegexPatterns = new RegexPatterns
            {
                Patterns = [new RegexPatternEntry { Regex = updatedPattern.RegexPattern }]
            };
        }

        // Validate pattern type
        var validPatternTypes = new[] { "otp", "tracking", "token", "custom" };
        if (!validPatternTypes.Contains(updatedPattern.PatternType.ToLowerInvariant()))
        {
            return BadRequest($"Invalid pattern type '{updatedPattern.PatternType}'. Must be one of: otp, tracking, token, custom.");
        }

        // Validate action type
        var validActionTypes = new[] { "copy", "link", "highlight" };
        if (!validActionTypes.Contains(updatedPattern.ActionType.ToLowerInvariant()))
        {
            return BadRequest($"Invalid action type '{updatedPattern.ActionType}'. Must be one of: copy, link, highlight.");
        }

        // Validate priority
        if (updatedPattern.Priority < 0 || updatedPattern.Priority > 999)
        {
            return BadRequest("Priority must be between 0 and 999.");
        }

        // Validate link template for 'link' action type
        if (updatedPattern.ActionType.ToLowerInvariant() == "link")
        {
            if (string.IsNullOrWhiteSpace(updatedPattern.LinkTemplate))
            {
                return BadRequest("Link template is required for 'link' action type.");
            }

            if (!updatedPattern.LinkTemplate.Contains("{value}"))
            {
                return BadRequest("Link template must contain {value} placeholder.");
            }

            if (!updatedPattern.LinkTemplate.StartsWith("http://") && !updatedPattern.LinkTemplate.StartsWith("https://"))
            {
                return BadRequest("Link template must start with http:// or https://.");
            }

            if (updatedPattern.LinkTemplate.Length > 2048)
            {
                return BadRequest("Link template must be 2048 characters or less.");
            }
        }
        else
        {
            updatedPattern.LinkTemplate = null;
        }

        try
        {
            await _db.OpenAsync();

            // Get existing pattern
            var existingPattern = await _db.GetAsync<CustomActionPattern>(new { id = id });

            if (existingPattern == null)
            {
                return NotFound($"Pattern with ID {id} not found.");
            }

            // Verify ownership
            if (existingPattern.UserId != userId)
            {
                return Forbid();
            }

            // Check for duplicate pattern name (excluding current pattern)
            try
            {
                var duplicatePattern = await _db.GetAsync<CustomActionPattern>(new
                {
                    user_id = userId,
                    pattern_name = updatedPattern.PatternName
                });

                if (duplicatePattern != null && duplicatePattern.Id != id)
                {
                    return Conflict($"A pattern with the name '{updatedPattern.PatternName}' already exists.");
                }
            }
            catch (InvalidOperationException)
            {
                // No duplicate found, this is expected
            }

            // Update fields
            existingPattern.PatternName = updatedPattern.PatternName;
            existingPattern.PatternType = updatedPattern.PatternType;
            existingPattern.RegexPattern = updatedPattern.RegexPattern;
            existingPattern.RegexPatterns = updatedPattern.RegexPatterns;
            existingPattern.ActionType = updatedPattern.ActionType;
            existingPattern.LinkTemplate = updatedPattern.LinkTemplate;
            existingPattern.Priority = updatedPattern.Priority;
            existingPattern.IsEnabled = updatedPattern.IsEnabled;
            existingPattern.Description = updatedPattern.Description;
            existingPattern.UpdatedAt = DateTime.UtcNow;

            await _db.UpdateAsync(existingPattern);

            _logger.LogInformation("Updated custom action pattern {PatternId} for user {UserId}", id, userId);
            return Ok(existingPattern);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update custom action pattern {PatternId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Delete a custom action pattern
    /// </summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeletePattern(Guid id)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();

            // Get existing pattern
            var existingPattern = await _db.GetAsync<CustomActionPattern>(new { id = id });

            if (existingPattern == null)
            {
                return NotFound($"Pattern with ID {id} not found.");
            }

            // Verify ownership
            if (existingPattern.UserId != userId)
            {
                return Forbid();
            }

            await _db.DeleteAsync<CustomActionPattern>(id);

            _logger.LogInformation("Deleted custom action pattern {PatternId} for user {UserId}", id, userId);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete custom action pattern {PatternId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Toggle a custom action pattern's enabled status
    /// </summary>
    [HttpPost("{id}/toggle")]
    [ProducesResponseType(typeof(CustomActionPattern), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> TogglePattern(Guid id)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();

            // Get existing pattern
            var existingPattern = await _db.GetAsync<CustomActionPattern>(new { id = id });

            if (existingPattern == null)
            {
                return NotFound($"Pattern with ID {id} not found.");
            }

            // Verify ownership
            if (existingPattern.UserId != userId)
            {
                return Forbid();
            }

            // Toggle enabled status
            existingPattern.IsEnabled = !existingPattern.IsEnabled;
            existingPattern.UpdatedAt = DateTime.UtcNow;

            await _db.UpdateAsync(existingPattern);

            _logger.LogInformation("Toggled custom action pattern {PatternId} to {IsEnabled} for user {UserId}",
                id, existingPattern.IsEnabled, userId);
            return Ok(existingPattern);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to toggle custom action pattern {PatternId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
