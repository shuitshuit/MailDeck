using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
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
            var rules = _db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.Priority)
                .ToList();
            return Ok(rules);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch auto-labeling rules for user {UserId}", userId);
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

        if (string.IsNullOrWhiteSpace(rule.LabelId))
        {
            return BadRequest("Label ID is required.");
        }

        if (string.IsNullOrWhiteSpace(rule.Conditions))
        {
            return BadRequest("Conditions are required.");
        }

        // Validate conditions JSON format
        try
        {
            var conditions = JsonSerializer.Deserialize<RuleConditions>(rule.Conditions);
            if (conditions == null || conditions.Rules == null || conditions.Rules.Count == 0)
            {
                return BadRequest("Conditions must contain at least one rule.");
            }

            // Validate each condition
            foreach (var condition in conditions.Rules)
            {
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
            }

            // Validate logical operator
            if (!string.IsNullOrWhiteSpace(conditions.Operator))
            {
                var validLogicalOps = new[] { "AND", "OR" };
                if (!validLogicalOps.Contains(conditions.Operator.ToUpperInvariant()))
                {
                    return BadRequest("Logical operator must be 'AND' or 'OR'.");
                }
            }
        }
        catch (JsonException)
        {
            return BadRequest("Invalid conditions JSON format.");
        }

        // Verify label exists and belongs to user
        try
        {
            await _db.OpenAsync();

            var labelGuid = Guid.Parse(rule.LabelId);
            var label = _db.AsQueryable<Label>()
                .Where(l => l.Id == labelGuid && l.UserId == userId)
                .FirstOrDefault();

            if (label == null)
            {
                return NotFound("Label not found or does not belong to user.");
            }

            // Check for duplicate rule name
            var existingRules = _db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.UserId == userId && r.RuleName == rule.RuleName)
                .ToList();

            if (existingRules.Any())
            {
                return Conflict("A rule with this name already exists.");
            }

            // Set properties
            rule.Id = Guid.NewGuid().ToString();
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
            _logger.LogError(ex, "Failed to create auto-labeling rule for user {UserId}", userId);
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
    public async Task<IActionResult> UpdateRule(string id, [FromBody] AutoLabelingRule rule)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        // Validation
        if (string.IsNullOrWhiteSpace(rule.RuleName))
        {
            return BadRequest("Rule name is required.");
        }

        if (string.IsNullOrWhiteSpace(rule.LabelId))
        {
            return BadRequest("Label ID is required.");
        }

        if (string.IsNullOrWhiteSpace(rule.Conditions))
        {
            return BadRequest("Conditions are required.");
        }

        // Validate conditions JSON format
        try
        {
            var conditions = JsonSerializer.Deserialize<RuleConditions>(rule.Conditions);
            if (conditions == null || conditions.Rules == null || conditions.Rules.Count == 0)
            {
                return BadRequest("Conditions must contain at least one rule.");
            }

            // Validate each condition (same as in CreateRule)
            foreach (var condition in conditions.Rules)
            {
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
            }

            // Validate logical operator
            if (!string.IsNullOrWhiteSpace(conditions.Operator))
            {
                var validLogicalOps = new[] { "AND", "OR" };
                if (!validLogicalOps.Contains(conditions.Operator.ToUpperInvariant()))
                {
                    return BadRequest("Logical operator must be 'AND' or 'OR'.");
                }
            }
        }
        catch (JsonException)
        {
            return BadRequest("Invalid conditions JSON format.");
        }

        try
        {
            await _db.OpenAsync();

            // Check if rule exists and belongs to user
            var existingRule = _db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.Id == id && r.UserId == userId)
                .FirstOrDefault();

            if (existingRule == null)
            {
                return NotFound("Rule not found or does not belong to user.");
            }

            // Verify label exists and belongs to user
            var labelGuid = Guid.Parse(rule.LabelId);
            var label = _db.AsQueryable<Label>()
                .Where(l => l.Id == labelGuid && l.UserId == userId)
                .FirstOrDefault();

            if (label == null)
            {
                return NotFound("Label not found or does not belong to user.");
            }

            // Check for duplicate rule name (excluding current rule)
            var duplicateRules = _db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.UserId == userId && r.RuleName == rule.RuleName && r.Id != id)
                .ToList();

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
            _logger.LogError(ex, "Failed to update auto-labeling rule {RuleId} for user {UserId}", id, userId);
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
    public async Task<IActionResult> DeleteRule(string id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();

            // Check if rule exists and belongs to user
            var rule = _db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.Id == id && r.UserId == userId)
                .FirstOrDefault();

            if (rule == null)
            {
                return NotFound("Rule not found or does not belong to user.");
            }

            var result = await _db.DeleteAsync<AutoLabelingRule>(id);
            return result > 0 ? Ok(new { message = "Rule deleted successfully" }) : StatusCode(500, "Delete failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete auto-labeling rule {RuleId} for user {UserId}", id, userId);
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
