using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.ServerConfig;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ServerConfigController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;
    private readonly Services.IEncryptionService _encryptionService;

    public ServerConfigController(ILogger<ServerConfigController> logger, PostgreSqlConnect db, Services.IEncryptionService encryptionService)
        : base(logger)
    {
        _db = db;
        _encryptionService = encryptionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetConfigs()
    {
        var userId = GetUserId();

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var userConfigs = await _db.GetMultipleAsync<UserServerConfig>(new { user_id = userId });

            // Convert to DTOs with masked passwords
            var responses = userConfigs.Select(ServerConfigResponse.FromEntity).ToList();

            return Ok(responses);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to get configs");
            return StatusCode(500, "Internal server error");
        }
    }

    [HttpPost]
    public async Task<IActionResult> AddConfig([FromBody] ServerConfigRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var config = new UserServerConfig
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            AccountName = request.AccountName,
            ImapHost = request.ImapHost,
            ImapPort = request.ImapPort,
            ImapUsername = request.ImapUsername,
            ImapSslEnabled = request.ImapSslEnabled,
            SmtpHost = request.SmtpHost,
            SmtpPort = request.SmtpPort,
            SmtpUsername = request.SmtpUsername,
            SmtpSslEnabled = request.SmtpSslEnabled,
            IsDefault = request.IsDefault,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            // Encrypt passwords
            if (!string.IsNullOrEmpty(request.ImapPassword))
            {
                config.ImapPassword = await _encryptionService.EncryptAsync(request.ImapPassword);
            }
            if (!string.IsNullOrEmpty(request.SmtpPassword))
            {
                config.SmtpPassword = await _encryptionService.EncryptAsync(request.SmtpPassword);
            }

            await _db.OpenAsync();
            await _db.InsertAsync(config);

            _logger.LogInformation("Added server config for user {UserId}", userId);

            return Ok(ServerConfigResponse.FromEntity(config));
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to add server config");
            return StatusCode(500, "Internal server error: " + ex.Message);
        }
    }
    
    [HttpPost("autoconfig")]
    public async Task<IActionResult> AutoConfig([FromBody] AutoConfigRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains("@"))
        {
            return BadRequest("Invalid email address.");
        }

        var domain = request.Email.Split('@')[1];
        using var client = new HttpClient();
        client.Timeout = TimeSpan.FromSeconds(5);

        // Method 1: Mozilla ISPDB (Thunderbird's public database)
        try
        {
            var ispdbUrl = $"https://autoconfig.thunderbird.net/v1.1/{domain}";
            _logger.LogInformation("Trying Mozilla ISPDB: {Url}", ispdbUrl);

            var response = await client.GetAsync(ispdbUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config in Mozilla ISPDB for domain: {Domain}", domain);
                return Ok(new AutoConfigResponse { Source = "ispdb", Xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Mozilla ISPDB failed for domain: {Domain}", domain);
        }

        // Method 2: autoconfig.domain.com
        try
        {
            var autoconfigUrl = $"http://autoconfig.{domain}/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(request.Email)}";
            _logger.LogInformation("Trying autoconfig subdomain: {Url}", autoconfigUrl);

            var response = await client.GetAsync(autoconfigUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at autoconfig.{Domain}", domain);
                return Ok(new AutoConfigResponse { Source = "autoconfig_subdomain", Xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "autoconfig subdomain failed for domain: {Domain}", domain);
        }

        // Method 3: domain.com/.well-known/autoconfig/mail/config-v1.1.xml
        try
        {
            var wellKnownUrl = $"https://{domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(request.Email)}";
            _logger.LogInformation("Trying .well-known: {Url}", wellKnownUrl);

            var response = await client.GetAsync(wellKnownUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at .well-known for domain: {Domain}", domain);
                return Ok(new AutoConfigResponse { Source = "well_known", Xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, ".well-known failed for domain: {Domain}", domain);
        }

        // Method 4: Try HTTP version of .well-known (some servers don't have HTTPS)
        try
        {
            var wellKnownHttpUrl = $"http://{domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(request.Email)}";
            _logger.LogInformation("Trying .well-known (HTTP): {Url}", wellKnownHttpUrl);

            var response = await client.GetAsync(wellKnownHttpUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at .well-known (HTTP) for domain: {Domain}", domain);
                return Ok(new AutoConfigResponse { Source = "well_known_http", Xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, ".well-known (HTTP) failed for domain: {Domain}", domain);
        }

        _logger.LogInformation("No autoconfig found for domain: {Domain}", domain);
        return Ok(new AutoConfigResponse { Source = "none" });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateConfig(string id, [FromBody] ServerConfigRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<UserServerConfig>(Guid.Parse(id));
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            // Update fields
            existing.AccountName = request.AccountName;
            existing.ImapHost = request.ImapHost;
            existing.ImapPort = request.ImapPort;
            existing.ImapUsername = request.ImapUsername;
            existing.ImapSslEnabled = request.ImapSslEnabled;
            existing.SmtpHost = request.SmtpHost;
            existing.SmtpPort = request.SmtpPort;
            existing.SmtpUsername = request.SmtpUsername;
            existing.SmtpSslEnabled = request.SmtpSslEnabled;
            existing.IsDefault = request.IsDefault;
            existing.UpdatedAt = DateTime.UtcNow;

            // Handle password updates
            if (!string.IsNullOrEmpty(request.ImapPassword) && request.ImapPassword != "*****")
            {
                existing.ImapPassword = await _encryptionService.EncryptAsync(request.ImapPassword);
            }
            if (!string.IsNullOrEmpty(request.SmtpPassword) && request.SmtpPassword != "*****")
            {
                existing.SmtpPassword = await _encryptionService.EncryptAsync(request.SmtpPassword);
            }

            await _db.UpdateAsync(existing);
            return Ok(ServerConfigResponse.FromEntity(existing));
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update config");
            return StatusCode(500, "Internal server error");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteConfig(string id)
    {
        var userId = GetUserId();

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<UserServerConfig>(Guid.Parse(id));
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            await _db.DeleteAsync(existing);
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete config");
            return StatusCode(500, "Internal server error");
        }
    }
}
