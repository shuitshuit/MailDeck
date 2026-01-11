-- Migration: Add Labels and Mail Labels tables
-- Date: 2026-01-12
-- Description: Add support for user-defined labels and mail labeling

-- Create Labels table
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6', -- HEX color code (default: blue)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure label names are unique per user
    UNIQUE(user_id, name)
);

CREATE INDEX idx_labels_user_id ON labels(user_id);

-- Create Mail Labels table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS mail_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id VARCHAR(500) NOT NULL, -- IMAP Message-ID header (RFC 5322)
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    server_config_id UUID NOT NULL REFERENCES user_server_configs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a message can't have the same label twice
    UNIQUE(user_id, message_id, label_id, server_config_id)
);

CREATE INDEX idx_mail_labels_user_id ON mail_labels(user_id);
CREATE INDEX idx_mail_labels_label_id ON mail_labels(label_id);
CREATE INDEX idx_mail_labels_message_id ON mail_labels(message_id, server_config_id);

-- Add comments for documentation
COMMENT ON TABLE labels IS 'User-defined labels for organizing emails';
COMMENT ON TABLE mail_labels IS 'Many-to-many relationship between emails and labels';
COMMENT ON COLUMN mail_labels.message_id IS 'IMAP Message-ID header value (not UID) for cross-server identification';
