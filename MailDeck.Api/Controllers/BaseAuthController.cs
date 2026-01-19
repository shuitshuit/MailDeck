using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace MailDeck.Api.Controllers;

/// <summary>
/// 認証が必要なコントローラーの基底クラス
/// Cognito/Auth0両対応のGetUserId()メソッドを提供
/// </summary>
[ApiController]
[Authorize]
public abstract class BaseAuthController : ControllerBase
{
    protected readonly ILogger _logger;

    protected BaseAuthController(ILogger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// JWT トークンからユーザーIDを取得
    /// Cognito の "sub" クレーム、または Auth0 の ClaimTypes.NameIdentifier に対応
    /// </summary>
    /// <returns>ユーザーID</returns>
    /// <exception cref="UnauthorizedAccessException">ユーザーIDが見つからない場合</exception>
    protected string GetUserId()
    {
        // Cognito: "sub" クレームを使用
        var userId = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value
            ?? User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogError(
                "User ID not found in claims. Available claims: {Claims}",
                string.Join(", ", User.Claims.Select(c => $"{c.Type}={c.Value}"))
            );
            throw new UnauthorizedAccessException("User ID not found");
        }

        return userId;
    }
}
