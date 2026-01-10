namespace MailDeck.Api.Middleware
{
    public class PerformanceLoggingMiddleware(RequestDelegate next, ILogger<PerformanceLoggingMiddleware> logger)
    {
        public async Task InvokeAsync(HttpContext context)
        {
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                await next(context);
            }
            finally
            {
                stopwatch.Stop();

                try
                {
                    // Serilogの構造化ログを使用
                    logger.LogInformation(
                        "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds}ms from {IpAddress}",
                        context.Request.Method,
                        context.Request.Path,
                        context.Response.StatusCode,
                        stopwatch.ElapsedMilliseconds,
                        context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to log performance data");
                }
            }
        }
    }
}
