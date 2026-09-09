-- Migration: Index to support multi-pod email-check leasing
-- Description: The background email checker leases the least-recently-checked
--              accounts with
--                  UPDATE user_server_configs SET last_checked_at = now()
--                  WHERE id IN (
--                      SELECT id FROM user_server_configs
--                      WHERE last_checked_at IS NULL OR last_checked_at < ...
--                      ORDER BY last_checked_at ASC NULLS FIRST
--                      LIMIT n FOR UPDATE SKIP LOCKED
--                  ) RETURNING *;
--              This runs on every pod every cycle, so the ORDER BY / WHERE on
--              last_checked_at needs an index to avoid a full-table sort as the
--              number of accounts grows. NULLS FIRST matches the query's ordering
--              so never-checked rows are leased first.

CREATE INDEX IF NOT EXISTS idx_user_server_configs_last_checked_at
    ON user_server_configs (last_checked_at ASC NULLS FIRST);

COMMENT ON INDEX idx_user_server_configs_last_checked_at
    IS 'Speeds up the background email checker leasing least-recently-checked accounts (FOR UPDATE SKIP LOCKED)';
