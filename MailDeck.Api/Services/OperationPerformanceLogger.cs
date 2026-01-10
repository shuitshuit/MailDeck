using System.Diagnostics;

namespace MailDeck.Api.Services;

/// <summary>
/// 個別操作のパフォーマンスを計測・記録するサービス
/// </summary>
public interface IOperationPerformanceLogger
{
    /// <summary>
    /// 操作の計測を開始する
    /// </summary>
    /// <param name="operationType">操作種別 (IMAP_Connect, IMAP_Authenticate, IMAP_Fetch, SMTP_Send など)</param>
    /// <param name="additionalData">追加情報 (サーバーホスト、ユーザーID など)</param>
    /// <returns>計測トークン (using句で使用)</returns>
    IDisposable StartOperation(string operationType, object? additionalData = null);
}

/// <summary>
/// 操作パフォーマンスロガーの実装
/// </summary>
public class OperationPerformanceLogger : IOperationPerformanceLogger
{
    private readonly ILogger<OperationPerformanceLogger> _logger;

    public OperationPerformanceLogger(ILogger<OperationPerformanceLogger> logger)
    {
        _logger = logger;
    }

    public IDisposable StartOperation(string operationType, object? additionalData = null)
    {
        return new OperationTimer(_logger, operationType, additionalData);
    }

    /// <summary>
    /// 操作計測用のタイマー (IDisposableで自動終了)
    /// </summary>
    private class OperationTimer : IDisposable
    {
        private readonly ILogger _logger;
        private readonly string _operationType;
        private readonly object? _additionalData;
        private readonly Stopwatch _stopwatch;
        private readonly DateTime _startTime;
        private bool _disposed;

        public OperationTimer(ILogger logger, string operationType, object? additionalData)
        {
            _logger = logger;
            _operationType = operationType;
            _additionalData = additionalData;
            _startTime = DateTime.UtcNow;
            _stopwatch = Stopwatch.StartNew();
        }

        public void Dispose()
        {
            if (_disposed) return;

            _stopwatch.Stop();
            _disposed = true;

            // 構造化ログとして記録
            _logger.LogInformation(
                "Operation: {OperationType}, Duration: {DurationMs}ms, StartTime: {StartTime}, EndTime: {EndTime}, AdditionalData: {@AdditionalData}",
                _operationType,
                _stopwatch.ElapsedMilliseconds,
                _startTime,
                DateTime.UtcNow,
                _additionalData
            );
        }
    }
}
