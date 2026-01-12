using System.Threading.Channels;
using MailDeck.Api.Models;

namespace MailDeck.Api.Services;

/// <summary>
/// Service for managing the Channel that queues new email notifications for auto-labeling.
/// Uses System.Threading.Channels for high-performance asynchronous message passing.
/// </summary>
public class ChannelService
{
    private readonly Channel<NewEmailNotification> _channel;
    private readonly ILogger<ChannelService> _logger;

    public ChannelService(ILogger<ChannelService> logger)
    {
        _logger = logger;

        // Create unbounded channel for flexibility
        // Can be changed to bounded if memory concerns arise
        _channel = Channel.CreateUnbounded<NewEmailNotification>(
            new UnboundedChannelOptions
            {
                SingleReader = false, // Multiple consumers allowed (future scalability)
                SingleWriter = false  // Multiple producers allowed (multiple email accounts)
            }
        );

        _logger.LogInformation("ChannelService initialized with unbounded channel");
    }

    /// <summary>
    /// Gets the channel writer for producing messages
    /// </summary>
    public ChannelWriter<NewEmailNotification> Writer => _channel.Writer;

    /// <summary>
    /// Gets the channel reader for consuming messages
    /// </summary>
    public ChannelReader<NewEmailNotification> Reader => _channel.Reader;

    /// <summary>
    /// Enqueue a new email notification for processing
    /// </summary>
    /// <param name="notification">Email notification to process</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>True if successfully enqueued, false otherwise</returns>
    public async Task<bool> EnqueueAsync(NewEmailNotification notification, CancellationToken cancellationToken = default)
    {
        try
        {
            await _channel.Writer.WriteAsync(notification, cancellationToken);
            _logger.LogDebug(
                "Enqueued email notification: User={UserId}, Config={ConfigId}, Message={MessageId}",
                notification.UserId, notification.ConfigId, notification.MessageId
            );
            return true;
        }
        catch (ChannelClosedException ex)
        {
            _logger.LogError(ex, "Failed to enqueue notification: Channel is closed");
            return false;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Enqueue operation was cancelled");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while enqueuing notification");
            return false;
        }
    }

    /// <summary>
    /// Get current count of pending items in the channel (if supported)
    /// </summary>
    public int PendingCount => _channel.Reader.Count;
}
