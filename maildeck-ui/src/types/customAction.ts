/**
 * Custom Action Pattern Types
 *
 * Types for defining patterns that detect and act on specific content in emails
 * (e.g., OTP codes, tracking numbers, tokens)
 */

export type PatternType = 'otp' | 'tracking' | 'token' | 'custom';
export type ActionType = 'copy' | 'link' | 'highlight';

/**
 * Condition field types (same as auto-labeling)
 */
export type ConditionField = 'from' | 'subject' | 'body';

/**
 * Condition operator types (same as auto-labeling)
 */
export type ConditionOperator = 'contains' | 'equals' | 'startswith' | 'endswith' | 'notcontains' | 'notequals' | 'matches' | 'notmatches';

/**
 * Logical operator for combining conditions
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Single condition for pattern matching
 */
export interface PatternCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  nextOperator?: LogicalOperator;
}

/**
 * Conditions structure for pattern matching
 */
export interface PatternConditions {
  rules: PatternCondition[];
}

/**
 * A single regex pattern entry in a multi-pattern group
 */
export interface RegexPatternEntry {
  regex: string;
  nextOperator?: 'AND' | 'OR';
}

/**
 * Multiple regex patterns with AND/OR logic
 */
export interface RegexPatterns {
  patterns: RegexPatternEntry[];
}

/**
 * Represents a custom action pattern stored in the database
 */
export interface CustomActionPattern {
  id: string; // UUID
  userId: string;
  patternName: string;
  patternType: PatternType;
  /** Legacy single regex pattern (kept for backward compatibility) */
  regexPattern: string;
  /** Multiple regex patterns with AND/OR logic. Takes precedence when non-empty. */
  regexPatterns?: RegexPatterns;
  actionType: ActionType;
  priority: number; // 0-999
  isEnabled: boolean;
  description?: string;
  /**
   * URL template for 'link' action type.
   * Use {value} as placeholder for the matched value.
   * Example: https://track.example.com/{value}
   */
  linkTemplate?: string;
  /**
   * Conditions for when this pattern should apply.
   * Empty rules array means apply to all emails.
   */
  conditions?: PatternConditions;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Request payload for creating a new pattern
 */
export interface CreatePatternRequest {
  patternName: string;
  patternType: PatternType;
  regexPattern: string;
  regexPatterns?: RegexPatterns;
  actionType: ActionType;
  priority: number;
  description?: string;
  linkTemplate?: string;
  conditions?: PatternConditions;
}

/**
 * Request payload for updating an existing pattern
 */
export interface UpdatePatternRequest {
  patternName: string;
  patternType: PatternType;
  regexPattern: string;
  regexPatterns?: RegexPatterns;
  actionType: ActionType;
  priority: number;
  isEnabled: boolean;
  description?: string;
  linkTemplate?: string;
  conditions?: PatternConditions;
}

/**
 * System preset pattern (read-only)
 */
export interface SystemPresetPattern {
  id: string;
  patternName: string;
  patternType: PatternType;
  regexPattern: string;
  actionType: ActionType;
  linkTemplate?: string;
  priority: number;
  description?: string;
  category?: string;
  isRecommended: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pattern usage statistics
 */
export interface PatternUsageStats {
  period: number;
  totalUsage: number;
  patternStats: Array<{
    patternId: string;
    patternName: string;
    patternType: string;
    totalUsage: number;
    copyCount: number;
    linkClickCount: number;
    lastUsed: string;
  }>;
  actionStats: {
    copy: number;
    linkClick: number;
    highlightCopy: number;
  };
  dailyTrend: Array<{
    date: string;
    count: number;
  }>;
}

/**
 * Result of importing multiple presets
 */
export interface ImportPresetsResult {
  imported: CustomActionPattern[];
  skipped: string[];
  importedCount: number;
  skippedCount: number;
}

/**
 * Represents a matched pattern in email content
 */
export interface PatternMatch {
  /** The matched string from the email content */
  value: string;

  /** The pattern that matched this content */
  pattern: CustomActionPattern;

  /** Start index of the match in the original text */
  startIndex: number;

  /** End index of the match in the original text */
  endIndex: number;
}

/**
 * Configuration for the pattern matching engine
 */
export interface PatternMatcherConfig {
  /** Maximum time in milliseconds for a single regex match (default: 1000ms) */
  timeout?: number;

  /** Maximum number of patterns to evaluate (default: 50) */
  maxPatterns?: number;

  /** Whether to cache compiled regex patterns (default: true) */
  cacheRegex?: boolean;
}

/**
 * Email context for condition evaluation
 */
export interface EmailContext {
  /** Sender email address */
  from: string;
  /** Email subject */
  subject: string;
  /** Email body content */
  body: string;
}
