using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL; // Ensure ORM methods are available
// using ShuitNet.ORM; // Placeholder

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ServerConfigController : ControllerBase
{
    private readonly ILogger<ServerConfigController> _logger;
    private readonly ShuitNet.ORM.PostgreSQL.PostgreSqlConnect _db;
    private readonly Services.IEncryptionService _encryptionService;

    public ServerConfigController(ILogger<ServerConfigController> logger, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, Services.IEncryptionService encryptionService)
    {
        _logger = logger;
        _db = db;
        _encryptionService = encryptionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetConfigs()
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
        
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try 
        {
            await _db.OpenAsync();
            var userConfigs = await _db.GetMultipleAsync<UserServerConfig>(new { user_id = userId });

            // Do NOT decrypt passwords when returning configs to UI for security
            foreach (var config in userConfigs)
            {
                config.ImapPassword = "*****";
                config.SmtpPassword = "*****";
            }

            return Ok(userConfigs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get configs");
            return StatusCode(500, "Internal server error");
        }
    }

    [HttpPost]
    public async Task<IActionResult> AddConfig([FromBody] UserServerConfig config)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value 
            ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        config.Id = Guid.NewGuid(); // Generate new UUID
        config.UserId = userId;
        config.CreatedAt = DateTime.UtcNow;
        config.UpdatedAt = DateTime.UtcNow;

        try
        {
            // Encrypt passwords
            if (!string.IsNullOrEmpty(config.ImapPassword))
            {
                config.ImapPassword = await _encryptionService.EncryptAsync(config.ImapPassword);
            }
            if (!string.IsNullOrEmpty(config.SmtpPassword))
            {
                config.SmtpPassword = await _encryptionService.EncryptAsync(config.SmtpPassword);
            }

            await _db.OpenAsync();
            await _db.InsertAsync(config);
            
            _logger.LogInformation("Added server config for user {UserId}", userId);
            
            // Mask passwords in response
            config.ImapPassword = "*****";
            config.SmtpPassword = "*****";

            return Ok(config);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add server config");
            return StatusCode(500, "Internal server error: " + ex.Message);
        }
    }
    
    [HttpPost("autoconfig")]
    public async Task<IActionResult> AutoConfig([FromBody] string email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
        {
            return BadRequest("Invalid email address.");
        }

        var domain = email.Split('@')[1];
        using var client = new HttpClient();
        client.Timeout = TimeSpan.FromSeconds(5); // Set timeout for each request

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
                return Ok(new { source = "ispdb", xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Mozilla ISPDB failed for domain: {Domain}", domain);
        }

        // Method 2: autoconfig.domain.com
        try
        {
            var autoconfigUrl = $"http://autoconfig.{domain}/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(email)}";
            _logger.LogInformation("Trying autoconfig subdomain: {Url}", autoconfigUrl);

            var response = await client.GetAsync(autoconfigUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at autoconfig.{Domain}", domain);
                return Ok(new { source = "autoconfig_subdomain", xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "autoconfig subdomain failed for domain: {Domain}", domain);
        }

        // Method 3: domain.com/.well-known/autoconfig/mail/config-v1.1.xml
        try
        {
            var wellKnownUrl = $"https://{domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(email)}";
            _logger.LogInformation("Trying .well-known: {Url}", wellKnownUrl);

            var response = await client.GetAsync(wellKnownUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at .well-known for domain: {Domain}", domain);
                return Ok(new { source = "well_known", xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, ".well-known failed for domain: {Domain}", domain);
        }

        // Method 4: Try HTTP version of .well-known (some servers don't have HTTPS)
        try
        {
            var wellKnownHttpUrl = $"http://{domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress={Uri.EscapeDataString(email)}";
            _logger.LogInformation("Trying .well-known (HTTP): {Url}", wellKnownHttpUrl);

            var response = await client.GetAsync(wellKnownHttpUrl);
            if (response.IsSuccessStatusCode)
            {
                var xmlContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Found config at .well-known (HTTP) for domain: {Domain}", domain);
                return Ok(new { source = "well_known_http", xml = xmlContent });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, ".well-known (HTTP) failed for domain: {Domain}", domain);
        }

        _logger.LogInformation("No autoconfig found for domain: {Domain}", domain);
        return Ok(new { source = "none" });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateConfig(string id, [FromBody] UserServerConfig updatedConfig)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<UserServerConfig>(id);
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            // Update fields
            existing.AccountName = updatedConfig.AccountName;
            existing.ImapHost = updatedConfig.ImapHost;
            existing.ImapPort = updatedConfig.ImapPort;
            existing.ImapUsername = updatedConfig.ImapUsername;
            existing.ImapSslEnabled = updatedConfig.ImapSslEnabled;
            existing.SmtpHost = updatedConfig.SmtpHost;
            existing.SmtpPort = updatedConfig.SmtpPort;
            existing.SmtpUsername = updatedConfig.SmtpUsername;
            existing.SmtpSslEnabled = updatedConfig.SmtpSslEnabled;
            existing.UpdatedAt = DateTime.UtcNow;

            // Handle password updates
            if (!string.IsNullOrEmpty(updatedConfig.ImapPassword) && updatedConfig.ImapPassword != "*****")
            {
                existing.ImapPassword = await _encryptionService.EncryptAsync(updatedConfig.ImapPassword);
            }
            if (!string.IsNullOrEmpty(updatedConfig.SmtpPassword) && updatedConfig.SmtpPassword != "*****")
            {
                existing.SmtpPassword = await _encryptionService.EncryptAsync(updatedConfig.SmtpPassword);
            }

            await _db.UpdateAsync(existing);
            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update config");
            return StatusCode(500, "Internal server error");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteConfig(string id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                     ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<UserServerConfig>(id);
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            await _db.DeleteAsync(existing);
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete config");
            return StatusCode(500, "Internal server error");
        }
    }
}
