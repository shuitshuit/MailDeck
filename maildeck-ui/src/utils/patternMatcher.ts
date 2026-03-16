/**
 * Pattern Matching Engine
 *
 * Matches custom action patterns against email content with performance
 * optimization and security measures (ReDoS prevention).
 */

import type {
  CustomActionPattern,
  PatternMatch,
  PatternMatcherConfig,
  EmailContext,
  PatternCondition,
  PatternConditions
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
 * @param emailContext - Email context for condition evaluation (from, subject, body)
 * @returns Array of pattern matches sorted by start index
 */
export function findPatternMatches(
  text: string,
  patterns: CustomActionPattern[],
  config: PatternMatcherConfig = {},
  emailContext?: EmailContext
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
      // Evaluate conditions before running regex
      if (pattern.conditions && pattern.conditions.rules.length > 0) {
        const ctx: EmailContext = emailContext ?? { from: '', subject: '', body: text };
        const conditionResult = evaluateConditions(pattern.conditions, ctx);
        if (!conditionResult) {
          console.log(
            `[CustomAction] パターン "${pattern.patternName}" はconditions不一致のためスキップ`,
            { conditions: pattern.conditions, emailContext: ctx }
          );
          continue;
        }
      }

      // regexPatterns (multi-regex) takes precedence over regexPattern (legacy single)
      const entries = pattern.regexPatterns?.patterns;
      const useMulti = entries && entries.length > 0;
      const extractRegex = useMulti ? entries[0].regex : pattern.regexPattern;

      if (useMulti && entries!.length > 1) {
        // Evaluate AND/OR chain: all entries must pass before extracting
        let chainResult = (() => {
          try { return new RegExp(entries![0].regex, 'gi').test(text); } catch { return false; }
        })();
        for (let i = 1; i < entries!.length; i++) {
          const op = entries![i - 1].nextOperator?.toUpperCase() ?? 'AND';
          let current = false;
          try { current = new RegExp(entries![i].regex, 'gi').test(text); } catch { /* noop */ }
          chainResult = op === 'OR' ? chainResult || current : chainResult && current;
        }
        if (!chainResult) {
          console.log(
            `[CustomAction] パターン "${pattern.patternName}" はmulti-regex不一致のためスキップ`,
            entries!.map(e => e.regex)
          );
          continue;
        }
      }

      const regex = getCompiledRegex(extractRegex, finalConfig.cacheRegex);
      const patternMatches = matchPattern(text, pattern, regex, matchedRanges);
      if (patternMatches.length > 0) {
        console.log(
          `[CustomAction] パターン "${pattern.patternName}" がマッチ: ${patternMatches.length}件`,
          patternMatches.map(m => ({
            value: m.value,
            startIndex: m.startIndex,
            endIndex: m.endIndex,
            regex: extractRegex,
            actionType: pattern.actionType,
          }))
        );
      }
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
 * Evaluate pattern conditions against email context
 */
function evaluateConditions(conditions: PatternConditions, ctx: EmailContext): boolean {
  if (conditions.rules.length === 0) return true;

  let result = evaluateSingleCondition(conditions.rules[0], ctx);

  for (let i = 1; i < conditions.rules.length; i++) {
    const op = conditions.rules[i - 1].nextOperator?.toUpperCase() ?? 'AND';
    const current = evaluateSingleCondition(conditions.rules[i], ctx);
    if (op === 'OR') {
      result = result || current;
    } else {
      result = result && current;
    }
  }

  return result;
}

/**
 * Evaluate a single condition against email context
 */
function evaluateSingleCondition(condition: PatternCondition, ctx: EmailContext): boolean {
  const fieldValue = (() => {
    switch (condition.field) {
      case 'from': return ctx.from;
      case 'subject': return ctx.subject;
      case 'body': return ctx.body;
      default: return '';
    }
  })();

  const val = condition.value ?? '';

  switch (condition.operator) {
    case 'contains': return fieldValue.toLowerCase().includes(val.toLowerCase());
    case 'notcontains': return !fieldValue.toLowerCase().includes(val.toLowerCase());
    case 'equals': return fieldValue.toLowerCase() === val.toLowerCase();
    case 'notequals': return fieldValue.toLowerCase() !== val.toLowerCase();
    case 'startswith': return fieldValue.toLowerCase().startsWith(val.toLowerCase());
    case 'endswith': return fieldValue.toLowerCase().endsWith(val.toLowerCase());
    case 'matches': {
      try { return new RegExp(val, 'i').test(fieldValue); } catch { return false; }
    }
    case 'notmatches': {
      try { return !new RegExp(val, 'i').test(fieldValue); } catch { return false; }
    }
    default: return false;
  }
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
 * Evaluate multi-regex AND/OR logic against text.
 * Returns extracted values from the first pattern if all AND/OR conditions pass.
 *
 * @param entries - Array of regex entries with nextOperator
 * @param text - The text to evaluate
 * @returns Array of matched strings from the first pattern, or [] if conditions not met
 */
export function testMultiRegexPattern(
  entries: Array<{ regex: string; nextOperator?: string }>,
  text: string
): string[] {
  if (entries.length === 0) return [];

  // Evaluate AND/OR chain
  let result = true;
  try {
    result = new RegExp(entries[0].regex, 'i').test(text);
  } catch {
    return [];
  }

  for (let i = 1; i < entries.length; i++) {
    const op = entries[i - 1].nextOperator?.toUpperCase() ?? 'AND';
    let current = false;
    try {
      current = new RegExp(entries[i].regex, 'i').test(text);
    } catch {
      current = false;
    }
    if (op === 'OR') {
      result = result || current;
    } else {
      result = result && current;
    }
  }

  if (!result) return [];

  // Extract values from the first pattern
  return testRegexPattern(entries[0].regex, text);
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
