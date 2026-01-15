-- Migration: Custom action patterns table
-- Author: Claude Sonnet 4.5
-- Date: 2026-01-14
-- Description: Add custom_action_patterns table for pattern-based custom actions (e.g., copy buttons for OTP codes)

-- Create custom_action_patterns table
CREATE TABLE IF NOT EXISTS custom_action_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_name VARCHAR(100) NOT NULL,
    pattern_type VARCHAR(50) NOT NULL, -- 'otp', 'tracking', 'token', 'custom'
    regex_pattern TEXT NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'copy', 'link', 'highlight'
    priority INTEGER NOT NULL DEFAULT 0, -- Higher number = higher priority
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_pattern_name_per_user UNIQUE (user_id, pattern_name),
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 999),
    CONSTRAINT valid_pattern_type CHECK (pattern_type IN ('otp', 'tracking', 'token', 'custom')),
    CONSTRAINT valid_action_type CHECK (action_type IN ('copy', 'link', 'highlight')),
    CONSTRAINT non_empty_regex CHECK (LENGTH(TRIM(regex_pattern)) > 0)
);

-- Create indexes for performance
CREATE INDEX idx_custom_action_patterns_user_enabled
    ON custom_action_patterns(user_id, is_enabled, priority DESC)
    WHERE is_enabled = true;

CREATE INDEX idx_custom_action_patterns_type
    ON custom_action_patterns(user_id, pattern_type)
    WHERE is_enabled = true;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_custom_action_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_custom_action_patterns_updated_at
    BEFORE UPDATE ON custom_action_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_action_patterns_updated_at();

-- Add comments
COMMENT ON TABLE custom_action_patterns IS 'Stores user-defined regex patterns for custom actions in email content';
COMMENT ON COLUMN custom_action_patterns.id IS 'Unique pattern identifier (UUID)';
COMMENT ON COLUMN custom_action_patterns.user_id IS 'User who owns this pattern';
COMMENT ON COLUMN custom_action_patterns.pattern_name IS 'User-friendly name for the pattern';
COMMENT ON COLUMN custom_action_patterns.pattern_type IS 'Type of pattern: otp, tracking, token, custom';
COMMENT ON COLUMN custom_action_patterns.regex_pattern IS 'Regular expression pattern to match';
COMMENT ON COLUMN custom_action_patterns.action_type IS 'Action to perform: copy, link, highlight';
COMMENT ON COLUMN custom_action_patterns.priority IS 'Pattern evaluation priority (higher = first)';
COMMENT ON COLUMN custom_action_patterns.is_enabled IS 'Whether the pattern is active';
COMMENT ON COLUMN custom_action_patterns.description IS 'Optional description of the pattern';
