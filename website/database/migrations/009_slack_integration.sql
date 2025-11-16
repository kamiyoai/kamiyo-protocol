-- Migration 009: Slack Integration
-- Date: 2025-10-10

-- Add Slack webhook URL to users table
ALTER TABLE users ADD COLUMN slack_webhook_url TEXT;

-- Add Slack enabled flag
ALTER TABLE users ADD COLUMN slack_enabled INTEGER DEFAULT 0;

-- Add index for Slack enabled users
CREATE INDEX IF NOT EXISTS idx_users_slack_enabled ON users(slack_enabled);
