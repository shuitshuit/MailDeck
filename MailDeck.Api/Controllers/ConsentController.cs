using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.Consent;
using MailDeck.Api.Constants;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ConsentController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public ConsentController(PostgreSqlConnect db, ILogger<ConsentController> logger)
        : base(logger)
    {
        _db = db;
    }

    /// <summary>
    /// 現在の同意状況を取得
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(ConsentStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetConsentStatus()
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var response = await GetConsentStatusInternal(userId);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to get consent status");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// 同意状況を取得する内部メソッド（接続は呼び出し元で管理）
    /// </summary>
    private async Task<ConsentStatusResponse> GetConsentStatusInternal(string userId)
    {
        var logs = await _db.GetMultipleAsync<UserConsentLog>(new { user_id = userId });

        var termsLog = logs
            .Where(l => l.ConsentType == ConsentVersions.ConsentTypeTermsOfService)
            .OrderByDescending(l => l.ConsentedAt)
            .FirstOrDefault();

        var privacyLog = logs
            .Where(l => l.ConsentType == ConsentVersions.ConsentTypePrivacyPolicy)
            .OrderByDescending(l => l.ConsentedAt)
            .FirstOrDefault();

        return new ConsentStatusResponse
        {
            TermsOfServiceConsented = termsLog?.ConsentVersion == ConsentVersions.LatestTermsOfServiceVersion,
            TermsOfServiceConsentedVersion = termsLog?.ConsentVersion,
            TermsOfServiceConsentedAt = termsLog?.ConsentedAt,
            PrivacyPolicyConsented = privacyLog?.ConsentVersion == ConsentVersions.LatestPrivacyPolicyVersion,
            PrivacyPolicyConsentedVersion = privacyLog?.ConsentVersion,
            PrivacyPolicyConsentedAt = privacyLog?.ConsentedAt,
            LatestTermsOfServiceVersion = ConsentVersions.LatestTermsOfServiceVersion,
            LatestPrivacyPolicyVersion = ConsentVersions.LatestPrivacyPolicyVersion,
            RequiresTermsOfServiceConsent = termsLog?.ConsentVersion != ConsentVersions.LatestTermsOfServiceVersion,
            RequiresPrivacyPolicyConsent = privacyLog?.ConsentVersion != ConsentVersions.LatestPrivacyPolicyVersion
        };
    }

    /// <summary>
    /// 同意を記録
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ConsentStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> RecordConsent([FromBody] ConsentRequest request)
    {
        var userId = GetUserId();

        if (!request.TermsOfService && !request.PrivacyPolicy)
        {
            return BadRequest("At least one consent type must be true.");
        }

        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        try
        {
            await _db.OpenAsync();

            if (request.TermsOfService)
            {
                var termsLog = new UserConsentLog
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ConsentType = ConsentVersions.ConsentTypeTermsOfService,
                    ConsentVersion = ConsentVersions.LatestTermsOfServiceVersion,
                    ConsentedAt = DateTime.UtcNow,
                    IpAddress = ipAddress,
                    UserAgent = userAgent
                };

                try
                {
                    await _db.InsertAsync(termsLog);
                }
                catch (Npgsql.PostgresException ex) when (ex.SqlState == "23505")
                {
                    _logger.LogInformation("Terms of service consent already recorded for user {UserId}", userId);
                }
            }

            if (request.PrivacyPolicy)
            {
                var privacyLog = new UserConsentLog
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ConsentType = ConsentVersions.ConsentTypePrivacyPolicy,
                    ConsentVersion = ConsentVersions.LatestPrivacyPolicyVersion,
                    ConsentedAt = DateTime.UtcNow,
                    IpAddress = ipAddress,
                    UserAgent = userAgent
                };

                try
                {
                    await _db.InsertAsync(privacyLog);
                }
                catch (Npgsql.PostgresException ex) when (ex.SqlState == "23505")
                {
                    _logger.LogInformation("Privacy policy consent already recorded for user {UserId}", userId);
                }
            }

            var response = await GetConsentStatusInternal(userId);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to record consent");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
