using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;
using System.Text.Json;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/auto-labeling-rules")]
public class AutoLabelingRulesController : ControllerBase
{
    private readonly PostgreSqlConnect _db;
    private readonly ILogger<AutoLabelingRulesController> _logger;

    public AutoLabelingRulesController(PostgreSqlConnect db, ILogger<AutoLabelingRulesController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Get all auto-labeling rules for the authenticated user
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetRules()
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";
        try
        {
            await _db.OpenAsync();
            var rules = await _db.GetMultipleAsync<AutoLabelingRule>(new { user_id = userId });

            // Sort by priority descending in C#
            var sortedRules = rules.OrderByDescending(r => r.Priority).ToList();

            // Return empty array if no rules found (204 would have no body)
            return Ok(sortedRules);
        }
        catch (InvalidOperationException)
        {
            // Return empty array instead of 204
            return Ok(new List<AutoLabelingRule>());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch auto-labeling rules for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Create a new auto-labeling rule
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateRule([FromBody] AutoLabelingRule rule)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        // Validation
        if (string.IsNullOrWhiteSpace(rule.RuleName))
        {
            return BadRequest("Rule name is required.");
        }

        // Validate conditions format
        if (rule.Conditions == null || rule.Conditions.Rules == null || rule.Conditions.Rules.Count == 0)
        {
            return BadRequest("Conditions must contain at least one rule.");
        }

        // Validate each condition
        for (int i = 0; i < rule.Conditions.Rules.Count; i++)
        {
            var condition = rule.Conditions.Rules[i];

            if (string.IsNullOrWhiteSpace(condition.Field))
            {
                return BadRequest("Each condition must have a field.");
            }

            var validFields = new[] { "from", "subject", "body" };
            if (!validFields.Contains(condition.Field.ToLowerInvariant()))
            {
                return BadRequest($"Invalid field '{condition.Field}'. Must be one of: from, subject, body.");
            }

            if (string.IsNullOrWhiteSpace(condition.Operator))
            {
                return BadRequest("Each condition must have an operator.");
            }

            var validOperators = new[] { "contains", "equals", "startswith", "endswith", "notcontains", "notequals" };
            if (!validOperators.Contains(condition.Operator.ToLowerInvariant()))
            {
                return BadRequest($"Invalid operator '{condition.Operator}'.");
            }

            // Validate nextOperator (only for conditions that are not the last one)
            if (i < rule.Conditions.Rules.Count - 1 && !string.IsNullOrWhiteSpace(condition.NextOperator))
            {
                var validLogicalOps = new[] { "AND", "OR" };
                if (!validLogicalOps.Contains(condition.NextOperator.ToUpperInvariant()))
                {
                    return BadRequest($"Invalid nextOperator '{condition.NextOperator}'. Must be 'AND' or 'OR'.");
                }
            }
        }

        // Verify label exists and belongs to user
        try
        {
            await _db.OpenAsync();

            var labelGuid = rule.LabelId;
            var label = await _db.GetAsync<Label>(labelGuid);

            if (label == null || label.UserId != userId)
            {
                return NotFound("Label not found or does not belong to user.");
            }

            // Check for duplicate rule name
            var allUserRules = await _db.GetMultipleAsync<AutoLabelingRule>(new { user_id = userId });
            var existingRules = allUserRules.Where(r => r.RuleName == rule.RuleName).ToList();

            if (existingRules.Any())
            {
                return Conflict("A rule with this name already exists.");
            }

            // Set properties
            rule.Id = Guid.NewGuid();
            rule.UserId = userId;
            rule.CreatedAt = DateTime.UtcNow;
            rule.UpdatedAt = DateTime.UtcNow;

            var result = await _db.InsertAsync(rule);
            return result > 0 ? Ok(rule) : StatusCode(500, "Insert failed");
        }
        catch (FormatException)
        {
            return BadRequest("Invalid label ID format.");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to create auto-labeling rule for user {UserId}", userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Update an existing auto-labeling rule
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateRule(Guid id, [FromBody] AutoLabelingRule rule)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        // Validation
        if (string.IsNullOrWhiteSpace(rule.RuleName))
        {
            return BadRequest("Rule name is required.");
        }

        // Validate conditions format
        if (rule.Conditions == null || rule.Conditions.Rules == null || rule.Conditions.Rules.Count == 0)
        {
            return BadRequest("Conditions must contain at least one rule.");
        }

        // Validate each condition (same as in CreateRule)
        for (int i = 0; i < rule.Conditions.Rules.Count; i++)
        {
            var condition = rule.Conditions.Rules[i];

            if (string.IsNullOrWhiteSpace(condition.Field))
            {
                return BadRequest("Each condition must have a field.");
            }

            var validFields = new[] { "from", "subject", "body" };
            if (!validFields.Contains(condition.Field.ToLowerInvariant()))
            {
                return BadRequest($"Invalid field '{condition.Field}'. Must be one of: from, subject, body.");
            }

            if (string.IsNullOrWhiteSpace(condition.Operator))
            {
                return BadRequest("Each condition must have an operator.");
            }

            var validOperators = new[] { "contains", "equals", "startswith", "endswith", "notcontains", "notequals" };
            if (!validOperators.Contains(condition.Operator.ToLowerInvariant()))
            {
                return BadRequest($"Invalid operator '{condition.Operator}'.");
            }

            // Validate nextOperator (only for conditions that are not the last one)
            if (i < rule.Conditions.Rules.Count - 1 && !string.IsNullOrWhiteSpace(condition.NextOperator))
            {
                var validLogicalOps = new[] { "AND", "OR" };
                if (!validLogicalOps.Contains(condition.NextOperator.ToUpperInvariant()))
                {
                    return BadRequest($"Invalid nextOperator '{condition.NextOperator}'. Must be 'AND' or 'OR'.");
                }
            }
        }

        try
        {
            await _db.OpenAsync();

            // Check if rule exists and belongs to user
            var existingRule = await _db.GetAsync<AutoLabelingRule>(id);

            if (existingRule == null || existingRule.UserId != userId)
            {
                return NotFound("Rule not found or does not belong to user.");
            }

            // Verify label exists and belongs to user
            var labelGuid = rule.LabelId;
            var label = await _db.GetAsync<Label>(labelGuid);

            if (label == null || label.UserId != userId)
            {
                return NotFound("Label not found or does not belong to user.");
            }

            // Check for duplicate rule name (excluding current rule)
            var allUserRules = await _db.GetMultipleAsync<AutoLabelingRule>(new { user_id = userId });
            var duplicateRules = allUserRules.Where(r => r.RuleName == rule.RuleName && r.Id != id).ToList();

            if (duplicateRules.Any())
            {
                return Conflict("A rule with this name already exists.");
            }

            // Update properties
            existingRule.RuleName = rule.RuleName;
            existingRule.LabelId = rule.LabelId;
            existingRule.Priority = rule.Priority;
            existingRule.IsEnabled = rule.IsEnabled;
            existingRule.Conditions = rule.Conditions;
            existingRule.UpdatedAt = DateTime.UtcNow;

            var result = await _db.UpdateAsync(existingRule);
            return result > 0 ? Ok(existingRule) : StatusCode(500, "Update failed");
        }
        catch (FormatException)
        {
            return BadRequest("Invalid label ID format.");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update auto-labeling rule {RuleId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Delete an auto-labeling rule
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRule(Guid id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();

            // Check if rule exists and belongs to user
            var rule = await _db.GetAsync<AutoLabelingRule>(id);

            if (rule == null || rule.UserId != userId)
            {
                return NotFound("Rule not found or does not belong to user.");
            }

            var result = await _db.DeleteAsync<AutoLabelingRule>(id);
            return result > 0 ? Ok(new { message = "Rule deleted successfully" }) : StatusCode(500, "Delete failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete auto-labeling rule {RuleId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Toggle the enabled/disabled state of an auto-labeling rule
    /// </summary>
    [HttpPost("{id}/toggle")]
    public async Task<IActionResult> ToggleRule(Guid id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();

            // Check if rule exists and belongs to user
            var rule = await _db.GetAsync<AutoLabelingRule>(id);

            if (rule == null || rule.UserId != userId)
            {
                return NotFound("Rule not found or does not belong to user.");
            }

            // Toggle the enabled state
            rule.IsEnabled = !rule.IsEnabled;
            rule.UpdatedAt = DateTime.UtcNow;

            var result = await _db.UpdateAsync(rule);
            return result > 0 ? Ok(rule) : StatusCode(500, "Toggle failed");
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to toggle auto-labeling rule {RuleId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
