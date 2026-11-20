-- Migration: Stable per-message links
-- Description: A mail is addressed in the UI by its IMAP UID, which changes when the
--              message is moved or the folder's UIDVALIDITY is reset. Links pasted into
--              calendar events / tasks have to keep working for weeks, so they point at
--              an opaque row that remembers the RFC 5322 Message-ID header instead, and
--              the UID is looked up again every time the link is opened.

CREATE TABLE IF NOT EXISTS mail_links (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    config_id UUID NOT NULL REFERENCES user_server_configs(id) ON DELETE CASCADE,
    message_id_header TEXT NOT NULL,
    subject TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mail_links_message UNIQUE (user_id, config_id, message_id_header)
);

COMMENT ON TABLE mail_links
    IS 'Opaque, durable links to a mail (/m/{id}); resolved to the current IMAP UID via the Message-ID header';
