-- Migration: Add hide_from_inbox column to labels table
-- This allows users to mark labels that should hide emails from the inbox view

ALTER TABLE labels
ADD COLUMN IF NOT EXISTS hide_from_inbox BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN labels.hide_from_inbox IS 'When true, emails with this label will not appear in the inbox view';
