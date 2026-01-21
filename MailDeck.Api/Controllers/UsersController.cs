using FirebaseAdmin.Messaging;
using MailDeck.Api.Extensions;
using MailDeck.Api.Models;
using MailDeck.Api.Models.DTO.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShuitNet.ORM.PostgreSQL;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController : BaseAuthController
{
    private readonly PostgreSqlConnect _db;

    public UsersController(ILogger<UsersController> logger, PostgreSqlConnect db)
        : base(logger)
    {
        _db = db;
    }

    [HttpPost("sync")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Sync()
    {
        var userId = GetUserId();
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
        { // ���[�U�[�����݂��Ȃ��ꍇ�̏���
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
            _logger.LogErrorWithSql(ex, "Error syncing user {UserId}", userId);
            return StatusCode(500, "Internal server error");
        }
    }

    /// <summary>
    /// サインアップ時にLambdaから実行される、セットアップエンドポイント。
    /// デフォルトフォルダ設定、非表示ラベル（赤色）を追加
    /// </summary>
    [HttpPost("setup")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Setup([FromBody] SetupRequest request)
    {
        // Lambda API Key認証
        var apiKey = Request.Headers["X-Lambda-Api-Key"].FirstOrDefault();
        var expectedApiKey = Environment.GetEnvironmentVariable("LAMBDA_API_KEY");

        if (string.IsNullOrEmpty(expectedApiKey) || apiKey != expectedApiKey)
        {
            _logger.LogWarning("Invalid or missing Lambda API key for setup endpoint");
            return Unauthorized("Invalid API key");
        }

        if (string.IsNullOrEmpty(request.UserId) || string.IsNullOrEmpty(request.Email))
        {
            return BadRequest("UserId and Email are required");
        }

        try
        {
            await _db.OpenAsync();

            // 1. ユーザー作成（存在しない場合）
            var existingUser = await _db.GetAsync<User>(request.UserId);

            if (existingUser == null)
            {
                var newUser = new User
                {
                    Id = request.UserId,
                    Email = request.Email,
                    Settings = new UserSettings
                    {
                        DefaultFolders = new DefaultFolders()
                    },
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _db.InsertAsync(newUser);
                _logger.LogInformation("Setup: Created new user {UserId}", request.UserId);
            }
            else
            {
                _logger.LogInformation("Setup: User {UserId} already exists", request.UserId);
            }

            // 2. 非表示ラベル（赤色）を作成
            var existingLabels = await _db.GetMultipleAsync<Label>(
                new { user_id = request.UserId, name = "非表示" }
            );

            if (!existingLabels.Any())
            {
                var hiddenLabel = new Label
                {
                    Id = Guid.NewGuid(),
                    UserId = request.UserId,
                    Name = "非表示",
                    Color = "#EF4444", // Red color
                    HideFromInbox = true,
                    NotifyEnabled = false, // Default hidden label should not trigger notifications
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                var nonNotification = new Label
                {
                    Id = Guid.NewGuid(),
                    UserId = request.UserId,
                    Name = "非通知",
                    Color = "#3B82F6", // Blue color
                    HideFromInbox = false,
                    NotifyEnabled = false, // Default hidden label should not trigger notifications
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                var task1 = _db.InsertAsync(hiddenLabel);
                var task2 = _db.InsertAsync(nonNotification);
                await Task.WhenAll(task1, task2);
                _logger.LogInformation("Setup: Created hidden label for user {UserId}", request.UserId);
            }
            else
            {
                _logger.LogInformation("Setup: Hidden label already exists for user {UserId}", request.UserId);
            }

            return Ok(new { message = "User setup completed successfully" });
        }
        catch (InvalidOperationException)
        {
            // ユーザーが存在しない場合の処理（GetAsyncの例外）
            var newUser = new User
            {
                Id = request.UserId,
                Email = request.Email,
                Settings = new UserSettings
                {
                    DefaultFolders = new DefaultFolders()
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _db.InsertAsync(newUser);

            var hiddenLabel = new Label
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                Name = "非表示",
                Color = "#EF4444",
                HideFromInbox = true,
                NotifyEnabled = false, // Default hidden label should not trigger notifications
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _db.InsertAsync(hiddenLabel);

            _logger.LogInformation("Setup: Created user and hidden label for {UserId} after exception", request.UserId);
            return Ok(new { message = "User setup completed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Error during user setup for {UserId}", request.UserId);
            return StatusCode(500, "Internal server error");
        }
    }
}
