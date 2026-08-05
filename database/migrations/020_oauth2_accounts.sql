-- Migration: OAuth2 (XOAUTH2) support for mail accounts
-- Description: Allow user_server_configs to authenticate against IMAP/SMTP with an
--              OAuth2 access token (Gmail etc.) instead of a stored password.

ALTER TABLE user_server_configs
    ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) NOT NULL DEFAULT 'password',
    ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
    ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMP WITH TIME ZONE;

-- OAuth2 accounts have no password to store, so the password columns can no
-- longer be NOT NULL. Existing password accounts are unaffected.
ALTER TABLE user_server_configs ALTER COLUMN imap_password DROP NOT NULL;
ALTER TABLE user_server_configs ALTER COLUMN smtp_password DROP NOT NULL;

-- Widen the password columns: KMS ciphertext for a token does not fit in 1024 chars.
ALTER TABLE user_server_configs ALTER COLUMN imap_password TYPE TEXT;
ALTER TABLE user_server_configs ALTER COLUMN smtp_password TYPE TEXT;

ALTER TABLE user_server_configs
    DROP CONSTRAINT IF EXISTS chk_user_server_configs_auth_type;
ALTER TABLE user_server_configs
    ADD CONSTRAINT chk_user_server_configs_auth_type
    CHECK (auth_type IN ('password', 'oauth2'));

-- One account per (user, provider, mailbox) so re-authorizing updates the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_server_configs_oauth_identity
    ON user_server_configs(user_id, oauth_provider, imap_username)
    WHERE auth_type = 'oauth2';

COMMENT ON COLUMN user_server_configs.auth_type IS 'How to authenticate to IMAP/SMTP: password or oauth2 (XOAUTH2)';
COMMENT ON COLUMN user_server_configs.oauth_provider IS 'OAuth2 provider identifier, e.g. google. NULL for password accounts';
COMMENT ON COLUMN user_server_configs.oauth_refresh_token IS 'KMS-encrypted OAuth2 refresh token';
COMMENT ON COLUMN user_server_configs.oauth_access_token IS 'KMS-encrypted OAuth2 access token cache, refreshed on demand';
COMMENT ON COLUMN user_server_configs.oauth_token_expires_at IS 'Expiry of the cached access token';
