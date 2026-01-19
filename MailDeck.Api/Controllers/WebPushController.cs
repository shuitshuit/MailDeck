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
[Produces("application/json")]
public class WebPushController : BaseAuthController
{
    private readonly IConfiguration _configuration;
    private readonly ShuitNet.ORM.PostgreSQL.PostgreSqlConnect _db;

    public WebPushController(IConfiguration configuration, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, ILogger<WebPushController> logger)
        : base(logger)
    {
        _configuration = configuration;
        _db = db;
    }

    [HttpGet("vapid-public-key")]
    [ProducesResponseType(typeof(VapidPublicKeyResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
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
    [ProducesResponseType(typeof(SuccessResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Subscribe([FromBody] WebPushSubscriptionRequest request)
    {
        var userId = GetUserId();

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
