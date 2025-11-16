-- Kamiyo Exploit Intelligence Platform Database Schema
-- Version: 1.0
-- Purpose: Store aggregated exploit data from external sources

-- Main exploits table
CREATE TABLE IF NOT EXISTS exploits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT UNIQUE NOT NULL,
    chain TEXT NOT NULL,
    protocol TEXT NOT NULL,
    amount_usd REAL,
    timestamp DATETIME NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    category TEXT,
    description TEXT,
    recovery_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sources table to track aggregator health
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    url TEXT,
    last_fetch DATETIME,
    fetch_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alerts sent tracking (for rate limiting and deduplication)
CREATE TABLE IF NOT EXISTS alerts_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exploit_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE
);

-- User subscriptions and API keys
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_request DATETIME,
    request_count INTEGER DEFAULT 0
);

-- Alert preferences per user
CREATE TABLE IF NOT EXISTS alert_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    min_amount_usd REAL DEFAULT 0,
    chains TEXT,  -- JSON array of chains
    protocols TEXT,  -- JSON array of protocols
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Community submissions from users
CREATE TABLE IF NOT EXISTS community_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT NOT NULL,
    chain TEXT NOT NULL,
    protocol TEXT NOT NULL,
    amount_usd REAL,
    description TEXT,
    submitter_wallet TEXT NOT NULL,
    evidence_url TEXT,
    status TEXT DEFAULT 'pending',  -- pending, verified, rejected, duplicate
    bounty_paid REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by TEXT,
    UNIQUE(tx_hash, submitter_wallet)
);

-- User reputation tracking
CREATE TABLE IF NOT EXISTS user_reputation (
    wallet_address TEXT PRIMARY KEY,
    verified_count INTEGER DEFAULT 0,
    false_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    total_bounties REAL DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_exploits_timestamp ON exploits(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exploits_chain ON exploits(chain);
CREATE INDEX IF NOT EXISTS idx_exploits_amount ON exploits(amount_usd DESC);
CREATE INDEX IF NOT EXISTS idx_exploits_protocol ON exploits(protocol);
CREATE INDEX IF NOT EXISTS idx_exploits_source ON exploits(source);
CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(is_active);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_alerts_exploit ON alerts_sent(exploit_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON community_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_wallet ON community_submissions(submitter_wallet);
CREATE INDEX IF NOT EXISTS idx_reputation_score ON user_reputation(reputation_score DESC);

-- Views for common queries (excluding test data)
CREATE VIEW IF NOT EXISTS v_recent_exploits AS
SELECT
    e.id,
    e.tx_hash,
    e.chain,
    e.protocol,
    e.amount_usd,
    e.timestamp,
    e.source,
    e.source_url,
    e.category,
    e.description,
    e.recovery_status
FROM exploits e
WHERE LOWER(e.protocol) NOT LIKE '%test%'
AND LOWER(COALESCE(e.category, '')) NOT LIKE '%test%'
ORDER BY e.timestamp DESC
LIMIT 100;

CREATE VIEW IF NOT EXISTS v_stats_24h AS
SELECT
    COUNT(*) as total_exploits,
    SUM(amount_usd) as total_loss_usd,
    COUNT(DISTINCT chain) as chains_affected,
    COUNT(DISTINCT protocol) as protocols_affected
FROM exploits
WHERE timestamp >= datetime('now', '-1 day')
AND LOWER(protocol) NOT LIKE '%test%'
AND LOWER(COALESCE(category, '')) NOT LIKE '%test%';

CREATE VIEW IF NOT EXISTS v_source_health AS
SELECT
    name,
    last_fetch,
    fetch_count,
    error_count,
    ROUND((1.0 * (fetch_count - error_count) / fetch_count) * 100, 2) as success_rate,
    is_active
FROM sources
WHERE fetch_count > 0;
