-- Migration: Add notify_enabled column to labels table
-- This allows users to disable notifications for specific labels (e.g., hidden labels)

ALTER TABLE labels
ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN labels.notify_enabled IS 'When false, new emails with this label will not trigger push notifications';
