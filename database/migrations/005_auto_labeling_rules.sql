-- Migration: Auto-labeling rules table
-- Author: Claude Sonnet 4.5
-- Date: 2026-01-13
-- Description: Add auto_labeling_rules table for rule-based automatic email labeling

-- Create auto_labeling_rules table
CREATE TABLE IF NOT EXISTS auto_labeling_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0, -- Higher number = higher priority
    is_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Rule conditions stored as JSONB
    -- Example format:
    -- {
    --   "operator": "AND",
    --   "rules": [
    --     { "field": "from", "operator": "contains", "value": "example.com" },
    --     { "field": "subject", "operator": "contains", "value": "重要" }
    --   ]
    -- }
    conditions JSONB NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_rule_name_per_user UNIQUE (user_id, rule_name),
    CONSTRAINT valid_priority CHECK (priority >= 0),
    CONSTRAINT valid_conditions CHECK (jsonb_typeof(conditions) = 'object')
);

-- Create indexes for performance
CREATE INDEX idx_auto_labeling_rules_user_enabled
    ON auto_labeling_rules(user_id, is_enabled, priority DESC)
    WHERE is_enabled = true;

CREATE INDEX idx_auto_labeling_rules_label
    ON auto_labeling_rules(label_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_auto_labeling_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_labeling_rules_updated_at
    BEFORE UPDATE ON auto_labeling_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_auto_labeling_rules_updated_at();

-- Add comments
COMMENT ON TABLE auto_labeling_rules IS 'Stores user-defined rules for automatic email labeling';
COMMENT ON COLUMN auto_labeling_rules.id IS 'Unique rule identifier (UUID)';
COMMENT ON COLUMN auto_labeling_rules.user_id IS 'User who owns this rule';
COMMENT ON COLUMN auto_labeling_rules.label_id IS 'Label to apply when rule matches';
COMMENT ON COLUMN auto_labeling_rules.rule_name IS 'User-friendly name for the rule';
COMMENT ON COLUMN auto_labeling_rules.priority IS 'Rule evaluation priority (higher = first)';
COMMENT ON COLUMN auto_labeling_rules.is_enabled IS 'Whether the rule is active';
COMMENT ON COLUMN auto_labeling_rules.conditions IS 'JSONB containing rule conditions';
