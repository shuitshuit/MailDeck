-- Migration: Add settings JSONB column to users table
-- Default folder names and other user preferences

ALTER TABLE users
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{
  "defaultFolders": {
    "trash": "Trash",
    "drafts": "Drafts",
    "sent": "Sent",
    "spam": "Spam",
    "inbox": "INBOX"
  }
}'::jsonb;

-- Index for settings queries
CREATE INDEX IF NOT EXISTS idx_users_settings ON users USING GIN (settings);

COMMENT ON COLUMN users.settings IS 'User preferences including default folder names';
