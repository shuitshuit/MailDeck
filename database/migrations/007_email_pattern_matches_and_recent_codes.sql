-- Migration: Email pattern matches and recent OTP codes tables
-- Author: Claude Sonnet 4.5
-- Date: 2026-01-14
-- Description: Add tables for storing pattern match results and recent OTP codes

-- Create email_pattern_matches table
CREATE TABLE IF NOT EXISTS email_pattern_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_config_id UUID NOT NULL REFERENCES user_server_configs(id) ON DELETE CASCADE,
    message_uid INTEGER NOT NULL,
    pattern_id UUID NOT NULL REFERENCES custom_action_patterns(id) ON DELETE CASCADE,
    matched_value TEXT NOT NULL,
    match_position INTEGER NOT NULL DEFAULT 0, -- Position of this match (0-indexed)
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT unique_pattern_match UNIQUE (user_id, server_config_id, message_uid, pattern_id, match_position)
);

CREATE INDEX idx_email_pattern_matches_user
    ON email_pattern_matches(user_id, created_at DESC);

CREATE INDEX idx_email_pattern_matches_message
    ON email_pattern_matches(server_config_id, message_uid);

CREATE INDEX idx_email_pattern_matches_pattern
    ON email_pattern_matches(pattern_id);

-- Create recent_otp_codes table (for 30-minute temporary storage)
CREATE TABLE IF NOT EXISTS recent_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    pattern_name VARCHAR(100), -- Name of the pattern that detected this code
    source_email VARCHAR(255), -- Email address that sent this code
    subject TEXT, -- Email subject for context
    expires_at TIMESTAMP NOT NULL, -- 30 minutes from creation
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recent_otp_codes_user_valid
    ON recent_otp_codes(user_id, expires_at DESC)
    WHERE expires_at > NOW();

CREATE INDEX idx_recent_otp_codes_expires
    ON recent_otp_codes(expires_at)
    WHERE expires_at <= NOW();

-- Add comments
COMMENT ON TABLE email_pattern_matches IS 'Stores pattern match results from email processing';
COMMENT ON COLUMN email_pattern_matches.id IS 'Unique match identifier (UUID)';
COMMENT ON COLUMN email_pattern_matches.user_id IS 'User who owns this match';
COMMENT ON COLUMN email_pattern_matches.server_config_id IS 'Email account where this was found';
COMMENT ON COLUMN email_pattern_matches.message_uid IS 'IMAP UID of the email';
COMMENT ON COLUMN email_pattern_matches.pattern_id IS 'Pattern that matched';
COMMENT ON COLUMN email_pattern_matches.matched_value IS 'The actual matched string (OTP code, tracking number, etc.)';
COMMENT ON COLUMN email_pattern_matches.match_position IS 'Position of this match if multiple matches in same email';

COMMENT ON TABLE recent_otp_codes IS 'Temporary storage for OTP codes (30 minutes retention)';
COMMENT ON COLUMN recent_otp_codes.id IS 'Unique code identifier (UUID)';
COMMENT ON COLUMN recent_otp_codes.user_id IS 'User who received this code';
COMMENT ON COLUMN recent_otp_codes.code IS 'The OTP code value';
COMMENT ON COLUMN recent_otp_codes.pattern_name IS 'Pattern that detected this code';
COMMENT ON COLUMN recent_otp_codes.source_email IS 'Sender email address';
COMMENT ON COLUMN recent_otp_codes.subject IS 'Email subject for context';
COMMENT ON COLUMN recent_otp_codes.expires_at IS 'Expiration time (30 minutes from creation)';
