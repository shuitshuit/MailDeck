using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly ILogger<UsersController> _logger;
    private readonly PostgreSqlConnect _db;

    public UsersController(ILogger<UsersController> logger, PostgreSqlConnect db)
    {
        _logger = logger;
        _db = db;
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync()
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value 
            ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
        var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;

        if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(email))
        {
            var missing = new List<string>();
            if (string.IsNullOrEmpty(userId)) missing.Add("userId (sub/NameIdentifier)");
            if (string.IsNullOrEmpty(email)) missing.Add("email");
            
            _logger.LogWarning("Invalid token claims. Missing: {MissingFields}", string.Join(", ", missing));
            return BadRequest($"Invalid token claims. Missing: {string.Join(", ", missing)}");
        }

        try
        {
            await _db.OpenAsync();
            // Check if user exists
            var existingUser = await _db.GetAsync<User>(userId);

            if (existingUser == null)
            {
                // Create new user
                var newUser = new User
                {
                    Id = userId,
                    Email = email,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _db.InsertAsync(newUser);
                _logger.LogInformation("Created new user: {UserId}", userId);
            }
            else
            {
                // Update existing user email if changed
                existingUser.Email = email;
                existingUser.UpdatedAt = DateTime.UtcNow;
                
                await _db.UpdateAsync(existingUser);
                _logger.LogInformation("Updated user: {UserId}", userId);
            }

            return Ok(new { message = "User synced successfully" });
        }
        catch (InvalidOperationException)
        { // ÉÜÅ[ÉUÅ[Ç™ë∂ç›ÇµÇ»Ç¢èÍçáÇÃèàóù
            var newUser = new User
            {
                Id = userId,
                Email = email,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _db.InsertAsync(newUser);
            _logger.LogInformation("Created new user after InvalidOperationException: {UserId}", userId);
            return Ok(new { message = "User created successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing user {UserId}", userId);
            return StatusCode(500, "Internal server error");
        }
    }
}
