using System.Security.Cryptography;
using MailDeck.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using ShuitNet.ORM.PostgreSQL;

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
    Task<string> CreateAsync(OAuthState state);
    Task<OAuthState?> ConsumeAsync(string state);
}

/// <summary>
/// Backed by PostgreSQL rather than IMemoryCache: authorize and callback are two
/// separate HTTP requests, and on k3s a RollingUpdate briefly runs the old and new
/// pod side by side, so the Service can route them to different pods. A pod-local
/// cache would lose the state written by the other pod and reject the callback as
/// invalid_state even though the user just completed consent on Google's side.
/// </summary>
public class OAuthStateStore : IOAuthStateStore
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    private readonly IServiceScopeFactory _scopeFactory;

    public OAuthStateStore(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<string> CreateAsync(OAuthState state)
    {
        var value = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = DateTime.UtcNow;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        await db.OpenAsync();

        await db.InsertAsync(new OAuthStateRecord
        {
            State = value,
            UserId = state.UserId,
            Provider = state.Provider,
            RedirectUri = state.RedirectUri,
            ConfigId = state.ConfigId,
            CreatedAt = now,
            ExpiresAt = now.Add(Lifetime)
        });

        return value;
    }

    public async Task<OAuthState?> ConsumeAsync(string state)
    {
        if (string.IsNullOrWhiteSpace(state)) return null;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PostgreSqlConnect>();
        await db.OpenAsync();

        var record = await db.GetAsync<OAuthStateRecord>(state);
        if (record is null || record.ExpiresAt < DateTime.UtcNow) return null;

        // Single-use: a concurrent or replayed callback with the same state can
        // only ever have one winner delete the row.
        var affected = await db.ExecuteAsync(
            "DELETE FROM oauth_states WHERE state = @State",
            new { State = state });
        if (affected != 1) return null;

        return new OAuthState(record.UserId, record.Provider, record.RedirectUri, record.ConfigId);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
