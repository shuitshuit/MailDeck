-- Migration: Notified messages dedup table
-- Description: Prevent duplicate Web Push when multiple pods detect the same new mail.
--              Acts as a last-resort guard even if the optimistic UID claim is bypassed.

CREATE TABLE IF NOT EXISTS notified_messages (
    config_id UUID NOT NULL REFERENCES user_server_configs(id) ON DELETE CASCADE,
    message_uid BIGINT NOT NULL,
    notified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (config_id, message_uid)
);

CREATE INDEX idx_notified_messages_notified_at ON notified_messages(notified_at);

COMMENT ON TABLE notified_messages IS 'Dedup guard so the same mail UID is pushed at most once across pods';
COMMENT ON COLUMN notified_messages.config_id IS 'Owning user_server_configs row';
COMMENT ON COLUMN notified_messages.message_uid IS 'IMAP UID that has already been notified';
COMMENT ON COLUMN notified_messages.notified_at IS 'When the notification was first sent; used for periodic cleanup';
