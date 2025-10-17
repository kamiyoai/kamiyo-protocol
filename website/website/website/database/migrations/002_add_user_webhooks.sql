-- Migration: Add User Webhook Endpoints
-- Version: 002
-- Purpose: Allow users to register webhook endpoints to receive real-time exploit alerts

-- User webhook endpoints table
CREATE TABLE IF NOT EXISTS user_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,  -- User-defined name for this webhook
    url TEXT NOT NULL,  -- HTTPS endpoint to POST to
    secret TEXT NOT NULL,  -- HMAC secret for signature verification
    is_active BOOLEAN DEFAULT 1,

    -- Filters (NULL means no filter)
    min_amount_usd REAL,  -- Only send exploits >= this amount
    chains TEXT,  -- JSON array: ["ethereum", "arbitrum"]
    protocols TEXT,  -- JSON array: ["uniswap", "aave"]
    categories TEXT,  -- JSON array: ["flash_loan", "reentrancy"]

    -- Delivery stats
    total_sent INTEGER DEFAULT 0,
    total_success INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    last_sent_at DATETIME,
    last_success_at DATETIME,
    last_failure_at DATETIME,
    last_error TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Webhook delivery log (for debugging and retry)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL,
    exploit_id INTEGER NOT NULL,

    -- Request details
    url TEXT NOT NULL,
    payload TEXT NOT NULL,  -- JSON payload
    signature TEXT NOT NULL,  -- HMAC-SHA256 signature

    -- Response details
    status_code INTEGER,
    response_body TEXT,
    error TEXT,

    -- Retry tracking
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at DATETIME,

    -- Timestamps
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME,
    failed_at DATETIME,

    FOREIGN KEY (webhook_id) REFERENCES user_webhooks(id) ON DELETE CASCADE,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_user_webhooks_user ON user_webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_webhooks_active ON user_webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_exploit ON webhook_deliveries(exploit_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sent ON webhook_deliveries(sent_at DESC);

-- View for webhook health
CREATE VIEW IF NOT EXISTS v_webhook_health AS
SELECT
    w.id,
    w.user_id,
    w.name,
    w.url,
    w.is_active,
    w.total_sent,
    w.total_success,
    w.total_failed,
    ROUND(
        CASE
            WHEN w.total_sent > 0 THEN (1.0 * w.total_success / w.total_sent) * 100
            ELSE 0
        END,
        2
    ) as success_rate,
    w.last_sent_at,
    w.last_success_at,
    w.last_failure_at,
    w.last_error
FROM user_webhooks w;
