-- Migration script to change id columns from SERIAL to UUID
-- This script migrates user_server_configs and contacts tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Migrate user_server_configs table
-- Add new UUID column
ALTER TABLE user_server_configs ADD COLUMN id_new UUID DEFAULT uuid_generate_v4();

-- Populate id_new with UUIDs for existing rows
UPDATE user_server_configs SET id_new = uuid_generate_v4() WHERE id_new IS NULL;

-- Drop the old id column (this will drop the primary key)
ALTER TABLE user_server_configs DROP CONSTRAINT user_server_configs_pkey;
ALTER TABLE user_server_configs DROP COLUMN id;

-- Rename id_new to id
ALTER TABLE user_server_configs RENAME COLUMN id_new TO id;

-- Set id as primary key
ALTER TABLE user_server_configs ALTER COLUMN id SET NOT NULL;
ALTER TABLE user_server_configs ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE user_server_configs ADD PRIMARY KEY (id);

-- Step 2: Migrate contacts table
-- Add new UUID column
ALTER TABLE contacts ADD COLUMN id_new UUID DEFAULT uuid_generate_v4();

-- Populate id_new with UUIDs for existing rows
UPDATE contacts SET id_new = uuid_generate_v4() WHERE id_new IS NULL;

-- Drop the old id column (this will drop the primary key)
ALTER TABLE contacts DROP CONSTRAINT contacts_pkey;
ALTER TABLE contacts DROP COLUMN id;

-- Rename id_new to id
ALTER TABLE contacts RENAME COLUMN id_new TO id;

-- Set id as primary key
ALTER TABLE contacts ALTER COLUMN id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE contacts ADD PRIMARY KEY (id);

-- Step 3: Migrate web_push_subscriptions table
-- Add new UUID column
ALTER TABLE web_push_subscriptions ADD COLUMN id_new UUID DEFAULT uuid_generate_v4();

-- Populate id_new with UUIDs for existing rows
UPDATE web_push_subscriptions SET id_new = uuid_generate_v4() WHERE id_new IS NULL;

-- Drop the old id column (this will drop the primary key)
ALTER TABLE web_push_subscriptions DROP CONSTRAINT web_push_subscriptions_pkey;
ALTER TABLE web_push_subscriptions DROP COLUMN id;

-- Rename id_new to id
ALTER TABLE web_push_subscriptions RENAME COLUMN id_new TO id;

-- Set id as primary key
ALTER TABLE web_push_subscriptions ALTER COLUMN id SET NOT NULL;
ALTER TABLE web_push_subscriptions ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE web_push_subscriptions ADD PRIMARY KEY (id);
