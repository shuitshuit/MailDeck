using Amazon.KeyManagementService;
using Amazon.KeyManagementService.Model;
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
            return Convert.ToBase64String(response.CiphertextBlob.ToArray());
        }
        catch (Exception ex)
        {
            throw new Exception("Encryption failed", ex);
        }
    }

    public async Task<string> DecryptAsync(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;

        try
        {
            var request = new DecryptRequest
            {
                CiphertextBlob = new MemoryStream(Convert.FromBase64String(cipherText))
            };

            var response = await _kmsClient.DecryptAsync(request);
            return Encoding.UTF8.GetString(response.Plaintext.ToArray());
        }
        catch (Exception ex)
        {
            throw new Exception("Decryption failed", ex);
        }
    }
}
