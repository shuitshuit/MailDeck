/**
 * Custom Action Pattern Types
 *
 * Types for defining patterns that detect and act on specific content in emails
 * (e.g., OTP codes, tracking numbers, tokens)
 */

export type PatternType = 'otp' | 'tracking' | 'token' | 'custom';
export type ActionType = 'copy' | 'link' | 'highlight';

/**
 * Represents a custom action pattern stored in the database
 */
export interface CustomActionPattern {
  id: string; // UUID
  userId: string;
  patternName: string;
  patternType: PatternType;
  regexPattern: string;
  actionType: ActionType;
  priority: number; // 0-999
  isEnabled: boolean;
  description?: string;
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
  actionType: ActionType;
  priority: number;
  description?: string;
}

/**
 * Request payload for updating an existing pattern
 */
export interface UpdatePatternRequest {
  patternName: string;
  patternType: PatternType;
  regexPattern: string;
  actionType: ActionType;
  priority: number;
  isEnabled: boolean;
  description?: string;
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
