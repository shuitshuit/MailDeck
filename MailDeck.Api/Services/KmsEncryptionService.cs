using Amazon.KeyManagementService;
using Amazon.KeyManagementService.Model;
using Microsoft.Extensions.Caching.Memory;
using System.Text;

namespace MailDeck.Api.Services;

public interface IEncryptionService
{
    Task<string> EncryptAsync(string plainText);
    Task<string> DecryptAsync(string cipherText);
}

public class KmsEncryptionService : IEncryptionService
{
    private readonly IAmazonKeyManagementService _kmsClient;
    private readonly IConfiguration _configuration;
    private readonly MemoryCache _cache = new(new MemoryCacheOptions());
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(60);

    public KmsEncryptionService(IAmazonKeyManagementService kmsClient, IConfiguration configuration)
    {
        _kmsClient = kmsClient;
        _configuration = configuration;
    }

    private string GetKeyId()
    {
        // Must be configured in appsettings.json or .env
        var keyId = _configuration["AWS:KmsKeyId"];
        if (string.IsNullOrEmpty(keyId))
        {
            throw new InvalidOperationException("AWS:KmsKeyId is not configured.");
        }
        return keyId;
    }

    public async Task<string> EncryptAsync(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;

        try
        {
            var request = new EncryptRequest
            {
                KeyId = GetKeyId(),
                Plaintext = new MemoryStream(Encoding.UTF8.GetBytes(plainText))
            };

            var response = await _kmsClient.EncryptAsync(request);
            var cipherText = Convert.ToBase64String(response.CiphertextBlob.ToArray());

            _cache.Set(cipherText, plainText, CacheTtl);
            return cipherText;
        }
        catch (Exception ex)
        {
            throw new Exception("Encryption failed", ex);
        }
    }

    public async Task<string> DecryptAsync(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;

        if (_cache.TryGetValue(cipherText, out string? cached))
            return cached!;

        try
        {
            var request = new DecryptRequest
            {
                CiphertextBlob = new MemoryStream(Convert.FromBase64String(cipherText))
            };

            var response = await _kmsClient.DecryptAsync(request);
            var plainText = Encoding.UTF8.GetString(response.Plaintext.ToArray());

            _cache.Set(cipherText, plainText, CacheTtl);
            return plainText;
        }
        catch (Exception ex)
        {
            throw new Exception("Decryption failed", ex);
        }
    }
}
