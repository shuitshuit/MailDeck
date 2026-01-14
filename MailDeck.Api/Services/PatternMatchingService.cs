using MailDeck.Api.Models;
using ShuitNet.ORM.PostgreSQL;
using System.Text.RegularExpressions;

namespace MailDeck.Api.Services;

/// <summary>
/// Service for matching custom action patterns against email content.
/// Handles pattern matching, result storage, and OTP code management.
/// </summary>
public class PatternMatchingService
{
    private readonly PostgreSqlConnect _db;
    private readonly ILogger<PatternMatchingService> _logger;
    private const int OTP_EXPIRATION_MINUTES = 30;
    private const int PATTERN_TIMEOUT_MS = 1000; // 1 second timeout per pattern

    public PatternMatchingService(PostgreSqlConnect db, ILogger<PatternMatchingService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Process an email and find all pattern matches.
    /// Stores results in database and manages recent OTP codes.
    /// </summary>
    public async Task ProcessEmailAsync(string userId, Guid serverConfigId, int messageUid, string emailBody, string from, string subject)
    {
        try
        {
            // Get enabled patterns for this user
            var patterns = await GetEnabledPatternsAsync(userId);
            if (patterns.Count == 0)
            {
                return; // No patterns to match
            }

            // Find matches
            var matches = FindMatches(emailBody, patterns);
            if (matches.Count == 0)
            {
                return; // No matches found
            }

            // Store matches in database
            await StoreMatchesAsync(userId, serverConfigId, messageUid, matches);

            // Store OTP codes in recent_otp_codes table
            await StoreRecentOtpCodesAsync(userId, matches, from, subject);

            _logger.LogInformation("Processed email {MessageUid} for user {UserId}: found {MatchCount} matches",
                messageUid, userId, matches.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process email {MessageUid} for pattern matching", messageUid);
            // Don't throw - pattern matching is non-critical
        }
    }

    /// <summary>
    /// Get enabled patterns for a user, sorted by priority
    /// </summary>
    private async Task<List<CustomActionPattern>> GetEnabledPatternsAsync(string userId)
    {
        try
        {
            await _db.OpenAsync();
            var patterns = await _db.GetMultipleAsync<CustomActionPattern>(new
            {
                user_id = userId,
                is_enabled = true
            });

            // Sort by priority descending
            return patterns.OrderByDescending(p => p.Priority).ToList();
        }
        catch (InvalidOperationException)
        {
            return new List<CustomActionPattern>();
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Find all pattern matches in email body
    /// </summary>
    private List<PatternMatchResult> FindMatches(string emailBody, List<CustomActionPattern> patterns)
    {
        var results = new List<PatternMatchResult>();
        var matchedRanges = new List<(int start, int end)>();

        foreach (var pattern in patterns)
        {
            try
            {
                // Create regex with timeout
                var regex = new Regex(pattern.RegexPattern, RegexOptions.None, TimeSpan.FromMilliseconds(PATTERN_TIMEOUT_MS));
                var matches = regex.Matches(emailBody);

                int position = 0;
                foreach (Match match in matches)
                {
                    // Check if this range overlaps with already matched ranges
                    if (!IsOverlapping(match.Index, match.Index + match.Length, matchedRanges))
                    {
                        results.Add(new PatternMatchResult
                        {
                            Pattern = pattern,
                            MatchedValue = match.Value,
                            Position = position++
                        });

                        matchedRanges.Add((match.Index, match.Index + match.Length));
                    }
                }
            }
            catch (RegexMatchTimeoutException)
            {
                _logger.LogWarning("Regex timeout for pattern {PatternId}: {PatternName}",
                    pattern.Id, pattern.PatternName);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Invalid regex pattern {PatternId}: {PatternName}",
                    pattern.Id, pattern.PatternName);
            }
        }

        return results;
    }

    /// <summary>
    /// Check if a range overlaps with any of the matched ranges
    /// </summary>
    private bool IsOverlapping(int start, int end, List<(int start, int end)> matchedRanges)
    {
        return matchedRanges.Any(range => !(end <= range.start || start >= range.end));
    }

    /// <summary>
    /// Store match results in database
    /// </summary>
    private async Task StoreMatchesAsync(string userId, Guid serverConfigId, int messageUid, List<PatternMatchResult> matches)
    {
        try
        {
            await _db.OpenAsync();

            foreach (var match in matches)
            {
                var emailMatch = new EmailPatternMatch
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ServerConfigId = serverConfigId,
                    MessageUid = messageUid,
                    PatternId = match.Pattern.Id,
                    MatchedValue = match.MatchedValue,
                    MatchPosition = match.Position,
                    CreatedAt = DateTime.UtcNow
                };

                try
                {
                    await _db.InsertAsync(emailMatch);
                }
                catch (Exception ex)
                {
                    // Ignore duplicate key errors (match already exists)
                    if (!ex.Message.Contains("duplicate key") && !ex.Message.Contains("unique_pattern_match"))
                    {
                        _logger.LogWarning(ex, "Failed to store pattern match for message {MessageUid}", messageUid);
                    }
                }
            }
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Store recent OTP codes for quick access
    /// </summary>
    private async Task StoreRecentOtpCodesAsync(string userId, List<PatternMatchResult> matches, string from, string subject)
    {
        var otpMatches = matches.Where(m => m.Pattern.PatternType.Equals("otp", StringComparison.OrdinalIgnoreCase)).ToList();
        if (otpMatches.Count == 0)
        {
            return;
        }

        try
        {
            await _db.OpenAsync();

            foreach (var match in otpMatches)
            {
                var recentCode = new RecentOtpCode
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Code = match.MatchedValue,
                    PatternName = match.Pattern.PatternName,
                    SourceEmail = from,
                    Subject = subject,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(OTP_EXPIRATION_MINUTES),
                    CreatedAt = DateTime.UtcNow
                };

                await _db.InsertAsync(recentCode);
            }

            _logger.LogInformation("Stored {Count} OTP codes for user {UserId}", otpMatches.Count, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to store recent OTP codes for user {UserId}", userId);
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Clean up expired OTP codes
    /// </summary>
    public async Task CleanupExpiredCodesAsync()
    {
        try
        {
            await _db.OpenAsync();

            // Delete expired codes
            var deletedCount = await _db.ExecuteAsync(
                "DELETE FROM recent_otp_codes WHERE expires_at <= @Now",
                new { Now = DateTime.UtcNow }
            );

            if (deletedCount > 0)
            {
                _logger.LogInformation("Cleaned up {Count} expired OTP codes", deletedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup expired OTP codes");
        }
        finally
        {
            _db.Close();
        }
    }

    /// <summary>
    /// Internal class for holding pattern match results
    /// </summary>
    private class PatternMatchResult
    {
        public required CustomActionPattern Pattern { get; set; }
        public required string MatchedValue { get; set; }
        public int Position { get; set; }
    }
}
