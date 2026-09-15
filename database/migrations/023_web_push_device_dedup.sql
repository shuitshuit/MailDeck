-- Migration: De-duplicate web push subscriptions per device
-- Description: FCM tokens rotate (browser restart, service worker update, token
--              refresh), and the old subscribe flow keyed rows on the token alone,
--              so every refresh left a stale row behind. Each stale row still pointed
--              at a token that was briefly deliverable, so the same physical device
--              received the notification once per row (observed: 3 web rows -> 2-3
--              notifications on one device).
--
--              Fix: identify a device by (user_id, platform, user_agent) and keep one
--              row per device, updating its token on refresh. This preserves the
--              "one user, many devices" behavior while sending each device exactly once.

-- 1. Add the user_agent column used to identify a device.
ALTER TABLE web_push_subscriptions
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2. Clean up existing duplicates: within each (user_id, platform), keep only the
--    most recently updated subscription and drop the older, likely-stale ones.
DELETE FROM web_push_subscriptions w
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, platform
               ORDER BY updated_at DESC, created_at DESC, id
           ) AS rn
    FROM web_push_subscriptions
) ranked
WHERE w.id = ranked.id
  AND ranked.rn > 1;

-- 3. Enforce one subscription per device going forward. COALESCE keeps the constraint
--    effective even before a client has sent a user_agent (treated as empty string),
--    so a device without a user agent still collapses to a single row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_push_subscriptions_device
    ON web_push_subscriptions (user_id, platform, COALESCE(user_agent, ''));

COMMENT ON COLUMN web_push_subscriptions.user_agent
    IS 'Client user agent; with (user_id, platform) identifies the device so a refreshed FCM token updates the row instead of duplicating it';
