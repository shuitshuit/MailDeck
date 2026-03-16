-- Migration 017: Add multi-regex support for system_preset_patterns
-- Adds regex_patterns JSONB column to system_preset_patterns table
-- Updates authentication presets with AND condition for auth keywords

-- Add regex_patterns column to system_preset_patterns
ALTER TABLE system_preset_patterns
    ADD COLUMN IF NOT EXISTS regex_patterns JSONB DEFAULT '{"patterns":[]}' NOT NULL;

COMMENT ON COLUMN system_preset_patterns.regex_patterns IS
    'Multiple regex patterns with AND/OR logic. Structure: {"patterns": [{"regex": "...", "nextOperator": "AND"|"OR"|null}, ...]}. Last item nextOperator is ignored.';

-- Index for JSONB querying
CREATE INDEX IF NOT EXISTS idx_system_preset_patterns_regex_patterns
    ON system_preset_patterns USING gin(regex_patterns);

-- Update authentication presets to include AND condition with auth keywords
-- 認証|verification|confirm|code|passcode|password がメール本文に含まれる場合のみマッチ
UPDATE system_preset_patterns
SET regex_patterns = jsonb_build_object(
    'patterns',
    jsonb_build_array(
        jsonb_build_object('regex', regex_pattern, 'nextOperator', 'AND'),
        jsonb_build_object('regex', '認証|verification|confirm|passcode|one.time|OTP', 'nextOperator', NULL)
    )
)
WHERE category = 'authentication';
