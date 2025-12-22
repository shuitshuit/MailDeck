using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Lib.Net.Http.WebPush;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class WebPushController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly ShuitNet.ORM.PostgreSQL.PostgreSqlConnect _db;
    private readonly ILogger<WebPushController> _logger;

    public WebPushController(IConfiguration configuration, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, ILogger<WebPushController> logger)
    {
        _configuration = configuration;
        _db = db;
        _logger = logger;
    }

    [HttpGet("vapid-public-key")]
    public IActionResult GetVapidPublicKey()
    {
        var publicKey = _configuration["WebPush:PublicKey"];
        if (string.IsNullOrEmpty(publicKey))
        {
            return StatusCode(500, "VAPID Public Key is not configured.");
        }
        return Ok(new { publicKey });
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] Models.WebPushSubscription subscription)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
            ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            
            // Check if subscription already exists (by endpoint) to avoid duplicates
            // We'll trust the client generated ID or endpoint uniqueness. 
            // Better to delete existing for same endpoint and re-insert or upsert.
            
            // For now, let's just insert. If the user sends a new subscription, it might have a new endpoint.
            // A cleanup job might be needed for old subscriptions in the future.
            
            subscription.UserId = userId;
            subscription.Id = Guid.NewGuid().ToString(); // Generate new UUID
            subscription.CreatedAt = DateTime.UtcNow;
            subscription.UpdatedAt = DateTime.UtcNow;

            await _db.InsertAsync(subscription);

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save subscription");
            return StatusCode(500, "Failed to save subscription");
        }
    }
}
