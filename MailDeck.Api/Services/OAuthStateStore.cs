using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;

namespace MailDeck.Api.Services;

/// <summary>
/// One in-flight authorization request. The callback arrives as a plain browser
/// redirect with no JWT, so everything we need to attribute it to a user has to
/// be carried across in server-side state keyed by the opaque <c>state</c> value.
/// </summary>
/// <param name="UserId">Cognito sub of the user who started the flow.</param>
/// <param name="RedirectUri">The exact redirect_uri sent to Google; the token exchange must repeat it.</param>
/// <param name="ConfigId">Set when re-authorizing an existing account.</param>
public record OAuthState(string UserId, string Provider, string RedirectUri, Guid? ConfigId);

/// <summary>
/// Short-lived store for OAuth <c>state</c> values. Single-use: consuming a state
/// removes it, so a replayed callback is rejected.
/// </summary>
public interface IOAuthStateStore
{
    string Create(OAuthState state);
    OAuthState? Consume(string state);
}

public class OAuthStateStore : IOAuthStateStore
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    private readonly IMemoryCache _cache;

    public OAuthStateStore(IMemoryCache cache)
    {
        _cache = cache;
    }

    public string Create(OAuthState state)
    {
        var value = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        _cache.Set(CacheKey(value), state, Lifetime);
        return value;
    }

    public OAuthState? Consume(string state)
    {
        if (string.IsNullOrWhiteSpace(state)) return null;

        var key = CacheKey(state);
        if (!_cache.TryGetValue<OAuthState>(key, out var value)) return null;

        _cache.Remove(key);
        return value;
    }

    private static string CacheKey(string state) => $"oauth-state:{state}";

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
