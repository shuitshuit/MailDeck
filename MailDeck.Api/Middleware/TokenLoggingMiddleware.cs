using System.IdentityModel.Tokens.Jwt;

namespace MailDeck.Api.Middleware;

/// <summary>
/// JWTトークンの内容をログ出力するミドルウェア（デバッグ用）
/// </summary>
public class TokenLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TokenLoggingMiddleware> _logger;
    private readonly IConfiguration configuration;

    public TokenLoggingMiddleware(RequestDelegate next, ILogger<TokenLoggingMiddleware> logger,
        IConfiguration conf)
    {
        _next = next;
        _logger = logger;
        configuration = conf;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Authorization ヘッダーからトークンを取得
        var authHeader = context.Request.Headers["Authorization"].ToString();

        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
        {
            var token = authHeader.Substring("Bearer ".Length).Trim();

            try
            {
                // JWTトークンをデコード（検証なし、デバッグ用）
                var handler = new JwtSecurityTokenHandler();
                var jwtToken = handler.ReadJwtToken(token);
                var issuer = jwtToken.Issuer;
                var expectedIssuer = configuration["Authentication:Cognito:Authority"];
                if (issuer != expectedIssuer)
                {
                    _logger.LogWarning("⚠️ Token issuer does not match expected issuer! Issuer: {Issuer}\nExpected: {ExpectedIssuer}", issuer, expectedIssuer);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decode JWT token");
            }
        }

        await _next(context);
    }
}
