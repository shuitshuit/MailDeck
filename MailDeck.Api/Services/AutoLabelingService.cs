using System.Text.Json;
using MailDeck.Api.Models;
using Npgsql;

namespace MailDeck.Api.Services;

/// <summary>
/// Background service that consumes new email notifications from Channel
/// and applies auto-labeling rules.
/// </summary>
public class AutoLabelingService : BackgroundService
{
    private readonly ChannelService _channelService;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AutoLabelingService> _logger;

    public AutoLabelingService(
        ChannelService channelService,
        IServiceProvider serviceProvider,
        ILogger<AutoLabelingService> logger)
    {
        _channelService = channelService;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AutoLabelingService started");

        try
        {
            await foreach (var notification in _channelService.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessEmailAsync(notification, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Failed to process auto-labeling for message {MessageId} in config {ConfigId}",
                        notification.MessageId, notification.ConfigId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("AutoLabelingService is stopping");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AutoLabelingService encountered an unexpected error");
        }
    }

    private async Task ProcessEmailAsync(NewEmailNotification notification, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ShuitNet.ORM.PostgreSQL.PostgreSqlConnect>();

        try
        {
            await db.OpenAsync();

            // 1. Get user's enabled rules sorted by priority
            var rules = db.AsQueryable<AutoLabelingRule>()
                .Where(r => r.UserId == notification.UserId && r.IsEnabled)
                .OrderByDescending(r => r.Priority)
                .ToList();

            if (rules.Count == 0)
            {
                _logger.LogDebug("No auto-labeling rules found for user {UserId}", notification.UserId);
                return;
            }

            _logger.LogDebug("Found {Count} auto-labeling rules for user {UserId}",
                rules.Count, notification.UserId);

            // 2. Evaluate each rule
            var appliedLabels = new List<string>();

            foreach (var rule in rules)
            {
                try
                {
                    if (EvaluateRule(rule, notification))
                    {
                        // 3. Apply label to message
                        await AddLabelToMessageAsync(
                            notification.MessageId,
                            rule.LabelId,
                            notification.ConfigId,
                            notification.UserId,
                            db,
                            ct
                        );

                        appliedLabels.Add(rule.RuleName);

                        _logger.LogInformation(
                            "Auto-labeled message {MessageId} with label {LabelId} using rule '{RuleName}'",
                            notification.MessageId, rule.LabelId, rule.RuleName
                        );
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Failed to evaluate or apply rule '{RuleName}' for message {MessageId}",
                        rule.RuleName, notification.MessageId);
                }
            }

            if (appliedLabels.Count > 0)
            {
                _logger.LogInformation(
                    "Applied {Count} auto-labeling rules to message {MessageId}: {Rules}",
                    appliedLabels.Count, notification.MessageId, string.Join(", ", appliedLabels)
                );
            }
        }
        finally
        {
            await db.CloseAsync();
        }
    }

    /// <summary>
    /// Evaluate if a rule matches the email notification
    /// </summary>
    private bool EvaluateRule(AutoLabelingRule rule, NewEmailNotification notification)
    {
        try
        {
            var conditions = JsonSerializer.Deserialize<RuleConditions>(rule.Conditions);
            if (conditions == null || conditions.Rules == null || conditions.Rules.Count == 0)
            {
                _logger.LogWarning("Rule '{RuleName}' has invalid or empty conditions", rule.RuleName);
                return false;
            }

            return EvaluateConditions(conditions, notification);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialize conditions for rule '{RuleName}'", rule.RuleName);
            return false;
        }
    }

    /// <summary>
    /// Evaluate rule conditions with AND/OR logic
    /// </summary>
    private bool EvaluateConditions(RuleConditions conditions, NewEmailNotification notification)
    {
        var results = conditions.Rules.Select(r => EvaluateSingleCondition(r, notification)).ToList();

        return conditions.Operator?.ToUpperInvariant() == "OR"
            ? results.Any(r => r)
            : results.All(r => r);
    }

    /// <summary>
    /// Evaluate a single condition
    /// </summary>
    private bool EvaluateSingleCondition(RuleCondition condition, NewEmailNotification notification)
    {
        // Get field value from notification
        var value = condition.Field?.ToLowerInvariant() switch
        {
            "from" => notification.From ?? "",
            "subject" => notification.Subject ?? "",
            "body" => notification.BodyText ?? "",
            _ => ""
        };

        var conditionValue = condition.Value ?? "";

        // Evaluate based on operator
        return condition.Operator?.ToLowerInvariant() switch
        {
            "contains" => value.Contains(conditionValue, StringComparison.OrdinalIgnoreCase),
            "equals" => value.Equals(conditionValue, StringComparison.OrdinalIgnoreCase),
            "startswith" => value.StartsWith(conditionValue, StringComparison.OrdinalIgnoreCase),
            "endswith" => value.EndsWith(conditionValue, StringComparison.OrdinalIgnoreCase),
            "notcontains" => !value.Contains(conditionValue, StringComparison.OrdinalIgnoreCase),
            "notequals" => !value.Equals(conditionValue, StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    /// <summary>
    /// Add label to message in database
    /// </summary>
    private async Task AddLabelToMessageAsync(int messageId, string labelId, string configId, string userId, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, CancellationToken ct)
    {
        // Convert string IDs to Guid
        var labelGuid = Guid.Parse(labelId);
        var configGuid = Guid.Parse(configId);

        // Check if label already exists using database query
        var existingLabel = db.AsQueryable<MailLabel>()
            .Where(ml => ml.UserId == userId &&
                        ml.MessageId == messageId &&
                        ml.LabelId == labelGuid &&
                        ml.ServerConfigId == configGuid)
            .FirstOrDefault();

        if (existingLabel != null)
        {
            _logger.LogDebug("Label {LabelId} already exists for message {MessageId}", labelId, messageId);
            return;
        }

        // Insert new label association
        var mailLabel = new MailLabel
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            MessageId = messageId,
            LabelId = labelGuid,
            ServerConfigId = configGuid,
            CreatedAt = DateTime.UtcNow
        };

        await db.InsertAsync(mailLabel);

        _logger.LogDebug("Added label {LabelId} to message {MessageId}", labelId, messageId);
    }
}
