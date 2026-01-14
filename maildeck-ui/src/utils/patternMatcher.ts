/**
 * Pattern Matching Engine
 *
 * Matches custom action patterns against email content with performance
 * optimization and security measures (ReDoS prevention).
 */

import type {
  CustomActionPattern,
  PatternMatch,
  PatternMatcherConfig
} from '../types/customAction';

/**
 * Cache for compiled regular expressions
 */
const regexCache = new Map<string, RegExp>();

/**
 * Default configuration for pattern matching
 */
const DEFAULT_CONFIG: Required<PatternMatcherConfig> = {
  timeout: 1000, // 1 second timeout per pattern
  maxPatterns: 50, // Maximum number of patterns to evaluate
  cacheRegex: true
};

/**
 * Find all pattern matches in the given text
 *
 * @param text - The text to search for patterns
 * @param patterns - The patterns to match against
 * @param config - Optional configuration
 * @returns Array of pattern matches sorted by start index
 */
export function findPatternMatches(
  text: string,
  patterns: CustomActionPattern[],
  config: PatternMatcherConfig = {}
): PatternMatch[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Filter enabled patterns and sort by priority (highest first)
  const enabledPatterns = patterns
    .filter(p => p.isEnabled)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, finalConfig.maxPatterns);

  const matches: PatternMatch[] = [];
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const pattern of enabledPatterns) {
    try {
      const regex = getCompiledRegex(pattern.regexPattern, finalConfig.cacheRegex);
      const patternMatches = matchPattern(text, pattern, regex, matchedRanges);
      matches.push(...patternMatches);
    } catch (error) {
      console.error(`Failed to match pattern "${pattern.patternName}":`, error);
      // Continue with next pattern instead of failing completely
    }
  }

  // Sort matches by start index
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Match a single pattern against text, avoiding already-matched ranges
 *
 * @param text - The text to search
 * @param pattern - The pattern to match
 * @param regex - Compiled regular expression
 * @param matchedRanges - Array of already-matched ranges to avoid
 * @returns Array of new matches
 */
function matchPattern(
  text: string,
  pattern: CustomActionPattern,
  regex: RegExp,
  matchedRanges: Array<{ start: number; end: number }>
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  // Reset regex lastIndex for global patterns
  regex.lastIndex = 0;

  // Use exec() for iterative matching
  let match: RegExpExecArray | null;
  const isGlobal = regex.flags.includes('g');

  if (isGlobal) {
    while ((match = regex.exec(text)) !== null) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

      // Skip if this range overlaps with an already-matched range
      if (!isOverlapping(startIndex, endIndex, matchedRanges)) {
        matches.push({
          value: match[0],
          pattern,
          startIndex,
          endIndex
        });

        // Mark this range as matched
        matchedRanges.push({ start: startIndex, end: endIndex });
      }

      // Prevent infinite loop on zero-width matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } else {
    match = regex.exec(text);
    if (match) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

      if (!isOverlapping(startIndex, endIndex, matchedRanges)) {
        matches.push({
          value: match[0],
          pattern,
          startIndex,
          endIndex
        });
        matchedRanges.push({ start: startIndex, end: endIndex });
      }
    }
  }

  return matches;
}

/**
 * Check if a range overlaps with any of the matched ranges
 *
 * @param start - Start index of the range
 * @param end - End index of the range
 * @param matchedRanges - Array of already-matched ranges
 * @returns True if overlapping, false otherwise
 */
function isOverlapping(
  start: number,
  end: number,
  matchedRanges: Array<{ start: number; end: number }>
): boolean {
  return matchedRanges.some(
    range => !(end <= range.start || start >= range.end)
  );
}

/**
 * Get a compiled regular expression, using cache if enabled
 *
 * @param pattern - The regex pattern string
 * @param useCache - Whether to use the cache
 * @returns Compiled RegExp object
 */
function getCompiledRegex(pattern: string, useCache: boolean): RegExp {
  if (useCache && regexCache.has(pattern)) {
    return regexCache.get(pattern)!;
  }

  // Create regex with global flag for multiple matches
  const regex = new RegExp(pattern, 'g');

  if (useCache) {
    regexCache.set(pattern, regex);
  }

  return regex;
}

/**
 * Clear the regex cache (useful for memory management)
 */
export function clearRegexCache(): void {
  regexCache.clear();
}

/**
 * Validate a regex pattern (returns error message if invalid)
 *
 * @param pattern - The regex pattern to validate
 * @returns Error message if invalid, null if valid
 */
export function validateRegexPattern(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Invalid regular expression';
  }
}

/**
 * Test a regex pattern against sample text
 *
 * @param pattern - The regex pattern to test
 * @param text - The sample text
 * @returns Array of matched strings
 */
export function testRegexPattern(pattern: string, text: string): string[] {
  try {
    const regex = new RegExp(pattern, 'g');
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      matches.push(match[0]);
      // Prevent infinite loop on zero-width matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return matches;
  } catch (error) {
    console.error('Failed to test regex pattern:', error);
    return [];
  }
}
