-- Migration: Per-user Google Calendar / Tasks integration
-- Description: Separate from the Gmail mail accounts in user_server_configs: a user may
--              have no Gmail account in MailDeck at all, and the calendar grant needs
--              different scopes (calendar.events, tasks). One row per user.
--              Tokens are encrypted with AWS KMS like the mail account tokens.

CREATE TABLE IF NOT EXISTS user_google_integrations (
    user_id TEXT PRIMARY KEY,
    google_email TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_google_integrations
    IS 'Google Calendar / Tasks OAuth grant per user; refresh_token and access_token are KMS-encrypted';
