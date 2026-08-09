using System.IO.Compression;
using MailDeck.Api.Extensions;
using ShuitNet.ORM.PostgreSQL;

namespace MailDeck.Api.Services;

/// <summary>
/// 古いログファイルを自動的にGZip圧縮するバックグラウンドサービス。
/// あわせて notified_messages の古い行を定期削除する。
/// </summary>
public class LogCompressionBackgroundService : BackgroundService
{
    private readonly ILogger<LogCompressionBackgroundService> _logger;
    private readonly IConfiguration _configuration;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeSpan _checkInterval;
    private readonly int _compressAfterDays;
    private readonly int _notifiedRetentionDays;
    private readonly string _logDirectory = "logs";

    public LogCompressionBackgroundService(
        ILogger<LogCompressionBackgroundService> logger,
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _configuration = configuration;
        _scopeFactory = scopeFactory;

        // 設定読み込み (デフォルト: 1日1回チェック、2日以上前のファイルを圧縮)
        var checkIntervalHours = _configuration.GetValue<int>("LogCompression:CheckIntervalHours", 24);
        _checkInterval = TimeSpan.FromHours(checkIntervalHours);
        _compressAfterDays = _configuration.GetValue<int>("LogCompression:CompressAfterDays", 2);
        _logDirectory = _configuration.GetValue<string>("LogCompression:LogDirectory") ?? "logs";

        // notified_messages の保持日数 (デフォルト: 30日)
        _notifiedRetentionDays = _configuration.GetValue<int>("NotifiedMessages:RetentionDays", 30);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "LogCompressionBackgroundService started. Check interval: {Interval}, Compress after: {Days} days",
            _checkInterval,
            _compressAfterDays);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CompressOldLogFilesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error occurred while compressing log files");
            }

            try
            {
                await CleanupOldNotifiedMessagesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error occurred while cleaning up notified_messages");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }

        _logger.LogInformation("LogCompressionBackgroundService stopped");
    }

    private async Task CompressOldLogFilesAsync()
    {
        if (!Directory.Exists(_logDirectory))
        {
            _logger.LogWarning("Log directory not found: {Directory}", _logDirectory);
            return;
        }

        var cutoffDate = DateTime.Now.AddDays(-_compressAfterDays);
        _logger.LogInformation("Checking for log files older than {CutoffDate}", cutoffDate);

        // *.json ファイルのみを対象 (*.json.gz は除外)
        var logFiles = Directory.GetFiles(_logDirectory, "*.json")
            .Where(f => !f.EndsWith(".json.gz", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var compressedCount = 0;

        foreach (var logFile in logFiles)
        {
            try
            {
                var fileInfo = new FileInfo(logFile);

                // 最終書き込み日時が圧縮対象日より古いかチェック
                if (fileInfo.LastWriteTime < cutoffDate)
                {
                    await CompressFileAsync(logFile);
                    compressedCount++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogErrorWithSql(ex, "Error compressing file: {FileName}", logFile);
            }
        }

        if (compressedCount > 0)
        {
            _logger.LogInformation("Compressed {Count} log file(s)", compressedCount);
        }
        else
        {
            _logger.LogDebug("No log files to compress");
        }
    }

    /// <summary>
    /// notified_messages の古い行を削除する (重複排除ガードの保持期間を過ぎた行)。
    /// </summary>
    private async Task CleanupOldNotifiedMessagesAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        await db.OpenAsync();

        var cutoff = DateTime.UtcNow.AddDays(-_notifiedRetentionDays);
        var deleted = await db.ExecuteAsync(
            "DELETE FROM notified_messages WHERE notified_at < @Cutoff",
            new { Cutoff = cutoff });

        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} expired notified_messages row(s)", deleted);
        }
    }

    private async Task CompressFileAsync(string sourceFile)
    {
        var compressedFile = sourceFile + ".gz";

        // 既に圧縮済みファイルが存在する場合はスキップ
        if (File.Exists(compressedFile))
        {
            _logger.LogWarning("Compressed file already exists, skipping: {FileName}", compressedFile);
            return;
        }

        _logger.LogInformation("Compressing: {FileName}", Path.GetFileName(sourceFile));

        // GZip圧縮
        await using (var sourceStream = new FileStream(sourceFile, FileMode.Open, FileAccess.Read, FileShare.Read))
        await using (var destinationStream = new FileStream(compressedFile, FileMode.Create, FileAccess.Write, FileShare.None))
        await using (var gzipStream = new GZipStream(destinationStream, CompressionLevel.Optimal))
        {
            await sourceStream.CopyToAsync(gzipStream);
        }

        // 圧縮成功後、元ファイルを削除
        File.Delete(sourceFile);

        _logger.LogInformation("Compressed and deleted: {FileName} -> {CompressedFileName}",
            Path.GetFileName(sourceFile),
            Path.GetFileName(compressedFile));
    }
}
