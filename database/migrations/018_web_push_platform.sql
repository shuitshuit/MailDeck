-- Migration 018: web_push_subscriptions に platform カラムを追加
-- 既存レコードは "web" とみなす

ALTER TABLE web_push_subscriptions
    ADD COLUMN IF NOT EXISTS platform VARCHAR(20) NOT NULL DEFAULT 'web';
