-- Migration 007: Add alert limit tracking
-- Date: 2025-10-10

-- Add user_id to alerts_sent table to track which user received the alert
ALTER TABLE alerts_sent ADD COLUMN user_id INTEGER;

-- Add monthly tracking columns to users table
ALTER TABLE users ADD COLUMN monthly_alerts_sent INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN monthly_alerts_reset_at TEXT;

-- Update existing rows to have reset_at
UPDATE users SET monthly_alerts_reset_at = datetime('now') WHERE monthly_alerts_reset_at IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
