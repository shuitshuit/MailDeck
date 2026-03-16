-- Migration 016: Add multi-regex support for custom action patterns
-- Adds regex_patterns JSONB column to support AND/OR combinations of multiple regex patterns
-- Also supports 'matches'/'notmatches' operator in auto_labeling_rules conditions

-- Add regex_patterns column to custom_action_patterns
-- Structure: {"patterns": [{"regex": "...", "nextOperator": "AND"|"OR"}, ...]}
-- Empty array = use legacy regex_pattern field (backward compatibility)
ALTER TABLE custom_action_patterns
    ADD COLUMN IF NOT EXISTS regex_patterns JSONB DEFAULT '{"patterns":[]}' NOT NULL;

-- Migrate existing regex_pattern values to the new structure
-- Only migrate rows that still have the old single regex_pattern filled
UPDATE custom_action_patterns
SET regex_patterns = jsonb_build_object(
    'patterns',
    jsonb_build_array(
        jsonb_build_object('regex', regex_pattern, 'nextOperator', NULL)
    )
)
WHERE regex_pattern IS NOT NULL AND regex_pattern != ''
  AND (regex_patterns = '{"patterns":[]}' OR regex_patterns IS NULL);

-- Index for JSONB conditions on regex_patterns
CREATE INDEX IF NOT EXISTS idx_custom_action_patterns_regex_patterns
    ON custom_action_patterns USING gin(regex_patterns);

-- Comment
COMMENT ON COLUMN custom_action_patterns.regex_patterns IS
    'Multiple regex patterns with AND/OR logic. Structure: {"patterns": [{"regex": "...", "nextOperator": "AND"|"OR"|null}, ...]}. Last item nextOperator is ignored.';
