using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ContactsController : ControllerBase
{
    private readonly PostgreSqlConnect _db;
    private readonly ILogger<ContactsController> _logger;

    public ContactsController(PostgreSqlConnect db, ILogger<ContactsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetContacts()
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";
        try 
        {
            await _db.OpenAsync();
            var contacts = await _db.GetMultipleAsync<Contact>(new { user_id = userId });
            return Ok(contacts);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch contacts");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpPost]
    public async Task<IActionResult> AddContact([FromBody] Contact contact)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";
        
        if (string.IsNullOrWhiteSpace(contact.Name) || string.IsNullOrWhiteSpace(contact.Email))
        {
            return BadRequest("Name and Email are required.");
        }

        contact.UserId = userId;
        contact.Id = Guid.NewGuid(); // Generate new UUID

        try
        {
            await _db.OpenAsync();
            var result = await _db.InsertAsync(contact);
            return Ok(result > 0 ? contact : throw new Exception("Insert failed"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add contact");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteContact(string id)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();
            var contact = await _db.GetAsync<Contact>(id);
            if (contact != null && contact.UserId == userId)
            {
                await _db.DeleteAsync(contact);
                return Ok();
            }
            return NotFound();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete contact");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateContact(string id, [FromBody] Contact updatedContact)
    {
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value ?? "anonymous";

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<Contact>(id);
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            existing.Name = updatedContact.Name;
            existing.Email = updatedContact.Email;
            
            await _db.UpdateAsync(existing);
            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update contact");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
