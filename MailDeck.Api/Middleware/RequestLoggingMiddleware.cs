namespace MailDeck.Api.Middleware
{
    public class RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                var request = context.Request;
                request.EnableBuffering();

                // Serilogの構造化ログを使用
                logger.LogInformation(
                    "HTTP Request: {Method} {Path}{QueryString} from {IpAddress}",
                    request.Method,
                    request.Path,
                    request.QueryString,
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to log request data");
            }
            await next(context);
        }
    }
}
