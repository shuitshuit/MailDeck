-- Migration: 009_custom_action_conditions.sql
-- Description: Add conditions to custom_action_patterns (like auto-labeling rules)
-- Date: 2025-01-16

-- ============================================
-- Add conditions column to custom_action_patterns
-- ============================================
-- Conditions allow patterns to only apply to emails matching certain criteria
-- (e.g., only apply OTP pattern to emails from specific senders)

ALTER TABLE custom_action_patterns
ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{"rules":[]}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN custom_action_patterns.conditions IS
    'JSONB conditions for when this pattern should apply. Same structure as auto_labeling_rules.conditions. Empty rules array means apply to all emails.';

-- Create index for JSONB querying (if needed in the future)
CREATE INDEX IF NOT EXISTS idx_custom_action_patterns_conditions
    ON custom_action_patterns USING gin(conditions);
