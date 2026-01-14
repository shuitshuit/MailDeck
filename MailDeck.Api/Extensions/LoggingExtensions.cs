using System.Text.Json;

namespace MailDeck.Api.Extensions;

/// <summary>
/// Extensions for enhanced exception logging with SQL information
/// </summary>
public static class LoggingExtensions
{
    /// <summary>
    /// Log an exception with SQL and parameter information if available (from ShuitNet.ORM exceptions)
    /// </summary>
    public static void LogErrorWithSql(
        this ILogger logger,
        Exception exception,
        string message,
        params object?[] args)
    {
        // Try to extract SQL and Parameters from exception using reflection
        var exceptionType = exception.GetType();

        var sqlProperty = exceptionType.GetProperty("Sql") ?? exceptionType.GetProperty("Query");
        var parametersProperty = exceptionType.GetProperty("Parameters") ?? exceptionType.GetProperty("SqlParameters");

        string? sql = null;
        string? parameters = null;

        if (sqlProperty != null)
        {
            sql = sqlProperty.GetValue(exception)?.ToString();
        }

        if (parametersProperty != null)
        {
            var paramValue = parametersProperty.GetValue(exception);
            if (paramValue != null)
            {
                try
                {
                    parameters = JsonSerializer.Serialize(paramValue, new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        MaxDepth = 5
                    });
                }
                catch
                {
                    parameters = paramValue.ToString();
                }
            }
        }

        // Log with SQL information if available
        if (!string.IsNullOrEmpty(sql) || !string.IsNullOrEmpty(parameters))
        {
            var extendedArgs = new List<object?>(args)
            {
                sql ?? "(no SQL)",
                parameters ?? "(no parameters)"
            };

            logger.LogError(
                exception,
                message + " | SQL: {Sql} | Parameters: {Parameters}",
                extendedArgs.ToArray()
            );
        }
        else
        {
            // Fallback to normal logging if no SQL information
            logger.LogError(exception, message, args);
        }
    }
}
