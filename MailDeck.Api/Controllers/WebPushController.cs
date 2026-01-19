using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.WebPush;
using MailDeck.Api.Models.DTO.Common;
using ShuitNet.ORM.PostgreSQL.LinqToSql;

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
        return Ok(new VapidPublicKeyResponse { PublicKey = publicKey });
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] WebPushSubscriptionRequest request)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();

            try
            {
                var existingSubscription = await _db.AsQueryable<WebPushSubscription>()
                    .Where(s => s.UserId == userId && s.Token == request.Token)
                    .FirstOrDefaultAsync();
                if (existingSubscription != null)
                {
                    existingSubscription!.UpdatedAt = DateTime.UtcNow;
                    await _db.UpdateAsync(existingSubscription);
                    return Ok(SuccessResponse.Ok());
                }
            }
            catch (InvalidOperationException)
            {
                // No existing subscription found, proceed to insert
            }

            var subscription = new WebPushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = request.Token,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _db.InsertAsync(subscription);

            return Ok(SuccessResponse.Ok());
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to save subscription");
            return StatusCode(500, "Failed to save subscription");
        }
    }
}
