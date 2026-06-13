namespace MailDeck.Api.Services;

public enum ScanStatus { Clean, Infected, Error }

public record ScanResult(ScanStatus Status, string? VirusName, string Message);

public interface IClamAvService
{
    Task<ScanResult> ScanBytesAsync(byte[] data, string filename, CancellationToken ct = default);
}
