-- Migration: Blocked senders table
-- Description: Add blocked_senders table for automatic spam filtering before auto-labeling

CREATE TABLE IF NOT EXISTS blocked_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    note VARCHAR(500),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_blocked_sender_per_user UNIQUE (user_id, email_address)
);

CREATE INDEX idx_blocked_senders_user_enabled
    ON blocked_senders(user_id, is_enabled)
    WHERE is_enabled = true;

CREATE OR REPLACE FUNCTION update_blocked_senders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_blocked_senders_updated_at
    BEFORE UPDATE ON blocked_senders
    FOR EACH ROW
    EXECUTE FUNCTION update_blocked_senders_updated_at();

COMMENT ON TABLE blocked_senders IS 'Stores email addresses that should be automatically moved to Spam before auto-labeling';
COMMENT ON COLUMN blocked_senders.email_address IS 'Exact email address to block (case-insensitive match)';
COMMENT ON COLUMN blocked_senders.note IS 'Optional user memo for why this sender is blocked';
COMMENT ON COLUMN blocked_senders.is_enabled IS 'Whether the block is active';
