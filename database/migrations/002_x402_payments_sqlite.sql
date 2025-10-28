-- x402 Payment Facilitator Database Schema (SQLite version)
-- Migration: 002_x402_payments
-- Purpose: Store x402 payment records, tokens, and usage tracking

-- Payment records for x402 on-chain payments
CREATE TABLE IF NOT EXISTS x402_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT UNIQUE NOT NULL,
    chain TEXT NOT NULL CHECK(chain IN ('base', 'ethereum', 'solana')),
    amount_usdc REAL NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    confirmations INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'verified', 'expired', 'used')),
    risk_score REAL DEFAULT 0.1,
    requests_allocated INTEGER NOT NULL,
    requests_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    verified_at TEXT,
    expires_at TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Payment tokens for API access
CREATE TABLE IF NOT EXISTS x402_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,  -- SHA256 hash of token
    payment_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    last_used_at TEXT,
    FOREIGN KEY (payment_id) REFERENCES x402_payments(id) ON DELETE CASCADE
);

-- API usage tracking for x402 payments
CREATE TABLE IF NOT EXISTS x402_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES x402_payments(id) ON DELETE CASCADE
);

-- Payment analytics aggregated by hour
CREATE TABLE IF NOT EXISTS x402_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_bucket TEXT NOT NULL,
    chain TEXT NOT NULL,
    total_payments INTEGER DEFAULT 0,
    total_amount_usdc REAL DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    unique_payers INTEGER DEFAULT 0,
    average_payment_usdc REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(hour_bucket, chain)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_x402_payments_tx_hash ON x402_payments(tx_hash);
CREATE INDEX IF NOT EXISTS idx_x402_payments_chain ON x402_payments(chain);
CREATE INDEX IF NOT EXISTS idx_x402_payments_from_address ON x402_payments(from_address);
CREATE INDEX IF NOT EXISTS idx_x402_payments_status ON x402_payments(status);
CREATE INDEX IF NOT EXISTS idx_x402_payments_created_at ON x402_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_x402_payments_expires_at ON x402_payments(expires_at);

CREATE INDEX IF NOT EXISTS idx_x402_tokens_token_hash ON x402_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_x402_tokens_payment_id ON x402_tokens(payment_id);
CREATE INDEX IF NOT EXISTS idx_x402_tokens_expires_at ON x402_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_x402_usage_payment_id ON x402_usage(payment_id);
CREATE INDEX IF NOT EXISTS idx_x402_usage_endpoint ON x402_usage(endpoint);
CREATE INDEX IF NOT EXISTS idx_x402_usage_created_at ON x402_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_x402_analytics_hour_bucket ON x402_analytics(hour_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_x402_analytics_chain ON x402_analytics(chain);

-- Views for common queries (SQLite compatible)

-- Active payments with remaining requests
CREATE VIEW IF NOT EXISTS v_x402_active_payments AS
SELECT
    p.id,
    p.tx_hash,
    p.chain,
    p.amount_usdc,
    p.from_address,
    p.requests_allocated,
    p.requests_used,
    (p.requests_allocated - p.requests_used) as requests_remaining,
    p.created_at,
    p.expires_at
FROM x402_payments p
WHERE p.status = 'verified'
AND datetime(p.expires_at) > datetime('now')
AND (p.requests_allocated - p.requests_used) > 0;

-- Payment statistics by chain (last 24 hours)
CREATE VIEW IF NOT EXISTS v_x402_stats_24h AS
SELECT
    chain,
    COUNT(*) as total_payments,
    SUM(amount_usdc) as total_amount_usdc,
    SUM(requests_allocated) as total_requests_allocated,
    SUM(requests_used) as total_requests_used,
    COUNT(DISTINCT from_address) as unique_payers,
    AVG(amount_usdc) as average_payment_usdc
FROM x402_payments
WHERE datetime(created_at) >= datetime('now', '-24 hours')
AND status = 'verified'
GROUP BY chain;

-- Top payers by total spending
CREATE VIEW IF NOT EXISTS v_x402_top_payers AS
SELECT
    from_address,
    COUNT(*) as payment_count,
    SUM(amount_usdc) as total_spent_usdc,
    SUM(requests_used) as total_requests_used,
    MAX(created_at) as last_payment_at
FROM x402_payments
WHERE status IN ('verified', 'used')
GROUP BY from_address
ORDER BY total_spent_usdc DESC
LIMIT 100;

-- API endpoint usage statistics
CREATE VIEW IF NOT EXISTS v_x402_endpoint_stats AS
SELECT
    u.endpoint,
    COUNT(*) as request_count,
    AVG(u.response_time_ms) as avg_response_time_ms,
    COUNT(DISTINCT u.payment_id) as unique_payers,
    COUNT(CASE WHEN u.status_code >= 200 AND u.status_code < 300 THEN 1 END) as success_count,
    COUNT(CASE WHEN u.status_code >= 400 THEN 1 END) as error_count
FROM x402_usage u
WHERE datetime(u.created_at) >= datetime('now', '-24 hours')
GROUP BY u.endpoint
ORDER BY request_count DESC;
