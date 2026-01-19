using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MailDeck.Api.Controllers;

/// <summary>
/// 管理者権限が必要なコントローラーの基底クラス
/// </summary>
[ApiController]
[Authorize]
public abstract class BaseAdminController : BaseAuthController
{
    protected BaseAdminController(ILogger logger) : base(logger)
    {
    }

    /// <summary>
    /// ユーザーが管理者権限を持っているかチェック
    /// </summary>
    /// <returns>管理者の場合true</returns>
    protected bool IsAdmin()
    {
        // Cognito groups から system-admins をチェック
        var groups = User.FindAll("cognito:groups").Select(c => c.Value).ToList();
        if (groups.Contains("system-admins"))
        {
            return true;
        }

        // custom:isAdmin クレームをチェック
        var isAdminClaim = User.FindFirst("custom:isAdmin")?.Value;
        if (isAdminClaim == "true")
        {
            return true;
        }

        return false;
    }

    /// <summary>
    /// 管理者権限をチェックし、権限がない場合は403を返す
    /// </summary>
    /// <returns>権限がない場合はForbidResult</returns>
    protected IActionResult? CheckAdminPermission()
    {
        if (!IsAdmin())
        {
            _logger.LogWarning("User {UserId} attempted to access admin-only endpoint", GetUserId());
            return Forbid();
        }
        return null;
    }
}
