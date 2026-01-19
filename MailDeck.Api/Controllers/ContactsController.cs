using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.Contacts;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ContactsController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public ContactsController(PostgreSqlConnect db, ILogger<ContactsController> logger)
        : base(logger)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetContacts()
    {
        var userId = GetUserId();
        try
        {
            await _db.OpenAsync();
            var contacts = await _db.GetMultipleAsync<Contact>(new { user_id = userId });
            var responses = contacts.Select(ContactResponse.FromEntity).ToList();
            return Ok(responses);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to fetch contacts");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }

    [HttpPost]
    public async Task<IActionResult> AddContact([FromBody] ContactRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest("Name and Email are required.");
        }

        var contact = new Contact
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name,
            Email = request.Email,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            await _db.OpenAsync();
            var result = await _db.InsertAsync(contact);
            return Ok(result > 0 ? ContactResponse.FromEntity(contact) : throw new Exception("Insert failed"));
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to add contact");
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
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var contact = await _db.GetAsync<Contact>(Guid.Parse(id));
            if (contact != null && contact.UserId == userId)
            {
                await _db.DeleteAsync(contact);
                return Ok();
            }
            return NotFound();
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to delete contact");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateContact(string id, [FromBody] ContactRequest request)
    {
        var userId = GetUserId();

        try
        {
            await _db.OpenAsync();
            var existing = await _db.GetAsync<Contact>(Guid.Parse(id));
            if (existing == null || existing.UserId != userId)
            {
                return NotFound();
            }

            existing.Name = request.Name;
            existing.Email = request.Email;
            existing.UpdatedAt = DateTime.UtcNow;

            await _db.UpdateAsync(existing);
            return Ok(ContactResponse.FromEntity(existing));
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to update contact");
            return StatusCode(500, "Database error");
        }
        finally
        {
            _db.Close();
        }
    }
}
