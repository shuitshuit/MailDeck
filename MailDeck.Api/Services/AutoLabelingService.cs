using System.Text.Json;
using System.Text.RegularExpressions;
using FirebaseAdmin.Messaging;
using MailDeck.Api.Models;
using MailDeck.Api.Extensions;
using Npgsql;
using ShuitNet.ORM.PostgreSQL.LinqToSql;

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
                    _logger.LogErrorWithSql(ex,
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
            _logger.LogErrorWithSql(ex, "AutoLabelingService encountered an unexpected error");
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
            var allRules = await db.GetMultipleAsync<AutoLabelingRule>(new { user_id = notification.UserId });
            var rules = allRules
                .Where(r => r.IsEnabled)
                .OrderByDescending(r => r.Priority)
                .ToList();

            // Track applied label IDs for notification check
            var appliedLabelIds = new List<Guid>();
            var appliedLabels = new List<string>();

            if (rules.Count > 0)
            {
                _logger.LogDebug("Found {Count} auto-labeling rules for user {UserId}",
                    rules.Count, notification.UserId);

                // 2. Evaluate each rule
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

                            appliedLabelIds.Add(rule.LabelId);
                            appliedLabels.Add(rule.RuleName);

                            _logger.LogInformation(
                                "Auto-labeled message {MessageId} with label {LabelId} using rule '{RuleName}'",
                                notification.MessageId, rule.LabelId, rule.RuleName
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogErrorWithSql(ex,
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

            // 4. Check if notification should be sent
            bool shouldNotify = true;
            if (appliedLabelIds.Count > 0)
            {
                // Check if any applied label has NotifyEnabled = false
                foreach (var labelId in appliedLabelIds)
                {
                    var label = await db.GetAsync<Label>(labelId);
                    if (label != null && !label.NotifyEnabled)
                    {
                        shouldNotify = false;
                        _logger.LogDebug(
                            "Skipping notification for message {MessageId} due to label '{LabelName}' having notifications disabled",
                            notification.MessageId, label.Name
                        );
                        break;
                    }
                }
            }

            // 5. Send push notification if needed
            if (shouldNotify)
            {
                await SendPushNotificationAsync(db, notification, ct);
            }
        }
        finally
        {
            await db.CloseAsync();
        }
    }

    private async Task SendPushNotificationAsync(ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, NewEmailNotification notification, CancellationToken ct)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var messaging = scope.ServiceProvider.GetRequiredService<FirebaseMessaging>();

            var subscriptions = await db.AsQueryable<WebPushSubscription>()
                .Where(s => s.UserId == notification.UserId)
                .ToListAsync();
            if (subscriptions.Count == 0)
            {
                _logger.LogDebug("No push subscriptions found for user {UserId}", notification.UserId);
                return;
            }

            var messageBody = notification.Subject ?? "(No Subject)";
            if (!string.IsNullOrEmpty(notification.BodyText))
            {
                messageBody += "\n" + notification.BodyText[..Math.Min(50, notification.BodyText.Length)];
            }

            foreach (var sub in subscriptions)
            {
                Message message;
                if (sub.Platform == "android")
                {
                    // Androidネイティブ: data messageで送信 (KotlinのFirebaseMessagingServiceが処理)
                    message = new Message()
                    {
                        Data = new Dictionary<string, string>
                        {
                            ["title"] = notification.From ?? "",
                            ["body"] = messageBody
                        },
                        Token = sub.Token,
                        Android = new AndroidConfig
                        {
                            Priority = Priority.High
                        }
                    };
                }
                else
                {
                    // Web: 通常のnotification message
                    message = new Message()
                    {
                        Notification = new Notification
                        {
                            Title = notification.From,
                            Body = messageBody
                        },
                        Data = new Dictionary<string, string>
                        {
                            ["configId"] = notification.ConfigId,
                            ["messageId"] = notification.MessageId.ToString()
                        },
                        Token = sub.Token,
                    };
                }
                try
                {
                    await messaging.SendAsync(message, ct);
                }
                catch (FirebaseMessagingException fex)
                    when (fex.MessagingErrorCode is MessagingErrorCode.Unregistered
                        or MessagingErrorCode.InvalidArgument)
                {
                    _logger.LogWarning("FCM token invalid for subscription {SubId}, removing", sub.Id);
                    await db.DeleteAsync<WebPushSubscription>(sub.Id);
                }
            }

            _logger.LogDebug("Sent push notification for message {MessageId} to {Count} devices",
                notification.MessageId, subscriptions.Count);
        }
        catch (Exception ex)
        {
            _logger.LogErrorWithSql(ex, "Failed to send push notification for message {MessageId}",
                notification.MessageId);
        }
    }

    /// <summary>
    /// Evaluate if a rule matches the email notification
    /// </summary>
    private bool EvaluateRule(AutoLabelingRule rule, NewEmailNotification notification)
    {
        if (rule.Conditions == null || rule.Conditions.Rules == null || rule.Conditions.Rules.Count == 0)
        {
            _logger.LogWarning("Rule '{RuleName}' has invalid or empty conditions", rule.RuleName);
            return false;
        }

        return EvaluateConditions(rule.Conditions, notification);
    }

    /// <summary>
    /// Evaluate rule conditions with individual AND/OR logic between each condition
    /// </summary>
    private bool EvaluateConditions(RuleConditions conditions, NewEmailNotification notification)
    {
        if (conditions.Rules.Count == 0)
        {
            return false;
        }

        if (conditions.Rules.Count == 1)
        {
            return EvaluateSingleCondition(conditions.Rules[0], notification);
        }

        // Start with the first condition's result
        bool result = EvaluateSingleCondition(conditions.Rules[0], notification);

        // Process each subsequent condition with its previous condition's nextOperator
        for (int i = 1; i < conditions.Rules.Count; i++)
        {
            var previousCondition = conditions.Rules[i - 1];
            var currentResult = EvaluateSingleCondition(conditions.Rules[i], notification);

            // Use the previous condition's nextOperator (defaults to AND if not specified)
            var nextOp = previousCondition.NextOperator?.ToUpperInvariant() ?? "AND";

            if (nextOp == "OR")
            {
                result = result || currentResult;
            }
            else // AND
            {
                result = result && currentResult;
            }
        }

        return result;
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
            "matches" => EvaluateRegexMatch(value, conditionValue),
            "notmatches" => !EvaluateRegexMatch(value, conditionValue),
            _ => false
        };
    }

    /// <summary>
    /// Evaluate a regex match with timeout protection
    /// </summary>
    private bool EvaluateRegexMatch(string value, string pattern)
    {
        if (string.IsNullOrEmpty(pattern)) return false;
        try
        {
            return Regex.IsMatch(value, pattern, RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        }
        catch (Exception ex) when (ex is ArgumentException or RegexMatchTimeoutException)
        {
            _logger.LogWarning("Regex evaluation failed for pattern '{Pattern}': {Message}", pattern, ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Add label to message in database
    /// </summary>
    private async Task AddLabelToMessageAsync(int messageId, Guid labelId, string configId, string userId, ShuitNet.ORM.PostgreSQL.PostgreSqlConnect db, CancellationToken ct)
    {
        var configGuid = Guid.Parse(configId);

        // Check if label already exists using database query
        var existingLabels = await db.GetMultipleAsync<MailLabel>(new
        {
            user_id = userId,
            message_id = messageId,
            label_id = labelId,
            server_config_id = configGuid
        });

        if (existingLabels.Any())
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
            LabelId = labelId,
            ServerConfigId = configGuid,
            CreatedAt = DateTime.UtcNow
        };

        await db.InsertAsync(mailLabel);

        _logger.LogDebug("Added label {LabelId} to message {MessageId}", labelId, messageId);
    }
}
