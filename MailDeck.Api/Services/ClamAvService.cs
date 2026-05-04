using nClam;

namespace MailDeck.Api.Services;

public class ClamAvService : IClamAvService
{
    private readonly ILogger<ClamAvService> _logger;
    private readonly string _host;
    private readonly int _port;
    private readonly int _timeoutSeconds;
    private readonly bool _enabled;

    public ClamAvService(IConfiguration configuration, ILogger<ClamAvService> logger)
    {
        _logger = logger;
        var section = configuration.GetSection("ClamAv");
        _host = section["Host"] ?? "localhost";
        _port = int.TryParse(section["Port"], out var port) ? port : 3310;
        _timeoutSeconds = int.TryParse(section["TimeoutSeconds"], out var timeout) ? timeout : 30;
        _enabled = !bool.TryParse(section["Enabled"], out var enabled) || enabled;
    }

    public async Task<ScanResult> ScanBytesAsync(byte[] data, string filename, CancellationToken ct = default)
    {
        if (!_enabled)
        {
            _logger.LogDebug("ClamAV scanning is disabled. Skipping scan for {File}", filename);
            return new ScanResult(ScanStatus.Clean, null, "Scanning disabled");
        }

        try
        {
            var client = new ClamClient(_host, _port)
            {
                MaxStreamSize = 26214400 // 25MB
            };

            using var ms = new MemoryStream(data);
            var result = await client.SendAndScanFileAsync(ms, ct);

            return result.Result switch
            {
                ClamScanResults.Clean => new ScanResult(ScanStatus.Clean, null, "Clean"),
                ClamScanResults.VirusDetected => new ScanResult(
                    ScanStatus.Infected,
                    result.InfectedFiles?.FirstOrDefault()?.VirusName,
                    $"Virus detected: {result.InfectedFiles?.FirstOrDefault()?.VirusName}"),
                _ => new ScanResult(ScanStatus.Error, null, result.RawResult ?? "Unknown error")
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ClamAV scan failed for {File}: {Message}", filename, ex.Message);
            return new ScanResult(ScanStatus.Error, null, ex.Message);
        }
    }
}
