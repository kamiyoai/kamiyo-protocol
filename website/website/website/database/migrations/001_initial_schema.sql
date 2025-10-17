-- PostgreSQL Production Schema for Kamiyo Exploit Intelligence Platform
-- Version: 1.0
-- Migration: SQLite → PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main exploits table
CREATE TABLE IF NOT EXISTS exploits (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    chain VARCHAR(100) NOT NULL,
    protocol VARCHAR(255) NOT NULL,
    amount_usd DECIMAL(20, 2),
    timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL,
    source_url TEXT,
    category VARCHAR(100),
    description TEXT,
    recovery_status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Sources table to track aggregator health
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    url TEXT,
    last_fetch TIMESTAMPTZ,
    fetch_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Alerts sent tracking
CREATE TABLE IF NOT EXISTS alerts_sent (
    id SERIAL PRIMARY KEY,
    exploit_id INTEGER NOT NULL,
    channel VARCHAR(50) NOT NULL,
    recipient VARCHAR(255),
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE
);

-- User accounts
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key UUID UNIQUE DEFAULT uuid_generate_v4(),
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    stripe_customer_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'inactive',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ,
    last_request TIMESTAMPTZ,
    request_count INTEGER DEFAULT 0,
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true
);

-- Alert preferences per user
CREATE TABLE IF NOT EXISTS alert_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    channel VARCHAR(50) NOT NULL,
    min_amount_usd DECIMAL(20, 2) DEFAULT 0,
    chains JSONB,
    protocols JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Community submissions from users
CREATE TABLE IF NOT EXISTS community_submissions (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(255) NOT NULL,
    chain VARCHAR(100) NOT NULL,
    protocol VARCHAR(255) NOT NULL,
    amount_usd DECIMAL(20, 2),
    description TEXT,
    submitter_wallet VARCHAR(255) NOT NULL,
    evidence_url TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    bounty_paid DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255),
    UNIQUE(tx_hash, submitter_wallet)
);

-- User reputation tracking
CREATE TABLE IF NOT EXISTS user_reputation (
    wallet_address VARCHAR(255) PRIMARY KEY,
    verified_count INTEGER DEFAULT 0,
    false_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    total_bounties DECIMAL(10, 2) DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Payment history
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stripe_payment_id VARCHAR(255) UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    tier VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Subscription changes log
CREATE TABLE IF NOT EXISTS subscription_changes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    old_tier VARCHAR(50),
    new_tier VARCHAR(50) NOT NULL,
    change_reason VARCHAR(255),
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX idx_exploits_timestamp ON exploits(timestamp DESC);
CREATE INDEX idx_exploits_chain ON exploits(chain);
CREATE INDEX idx_exploits_amount ON exploits(amount_usd DESC);
CREATE INDEX idx_exploits_protocol ON exploits(protocol);
CREATE INDEX idx_exploits_source ON exploits(source);
CREATE INDEX idx_exploits_timestamp_chain ON exploits(timestamp DESC, chain);
CREATE INDEX idx_exploits_created_at ON exploits(created_at DESC);

CREATE INDEX idx_sources_active ON sources(is_active);
CREATE INDEX idx_sources_name ON sources(name);

CREATE INDEX idx_users_api_key ON users(api_key);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_users_stripe_id ON users(stripe_customer_id);

CREATE INDEX idx_alerts_exploit ON alerts_sent(exploit_id);
CREATE INDEX idx_alerts_sent_at ON alerts_sent(sent_at DESC);

CREATE INDEX idx_submissions_status ON community_submissions(status);
CREATE INDEX idx_submissions_wallet ON community_submissions(submitter_wallet);
CREATE INDEX idx_submissions_created ON community_submissions(created_at DESC);

CREATE INDEX idx_reputation_score ON user_reputation(reputation_score DESC);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_created ON payments(created_at DESC);

-- Views for common queries
CREATE OR REPLACE VIEW v_recent_exploits AS
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
ORDER BY e.timestamp DESC
LIMIT 100;

CREATE OR REPLACE VIEW v_stats_24h AS
SELECT
    COUNT(*) as total_exploits,
    SUM(amount_usd) as total_loss_usd,
    COUNT(DISTINCT chain) as chains_affected,
    COUNT(DISTINCT protocol) as protocols_affected
FROM exploits
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 day';

CREATE OR REPLACE VIEW v_source_health AS
SELECT
    name,
    last_fetch,
    fetch_count,
    error_count,
    ROUND((1.0 * (fetch_count - error_count) / NULLIF(fetch_count, 0)) * 100, 2) as success_rate,
    is_active
FROM sources
WHERE fetch_count > 0;

CREATE OR REPLACE VIEW v_user_stats AS
SELECT
    tier,
    COUNT(*) as user_count,
    COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_subscriptions,
    COUNT(CASE WHEN last_login >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 END) as active_7d
FROM users
WHERE is_active = true
GROUP BY tier;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_exploits_updated_at BEFORE UPDATE ON exploits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_preferences_updated_at BEFORE UPDATE ON alert_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_reputation_updated_at BEFORE UPDATE ON user_reputation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE exploits IS 'Main table storing confirmed cryptocurrency exploits from all sources';
COMMENT ON TABLE sources IS 'Tracks health and reliability of aggregation sources';
COMMENT ON TABLE users IS 'User accounts with subscription tiers and API keys';
COMMENT ON TABLE community_submissions IS 'User-submitted exploits pending verification';
COMMENT ON TABLE user_reputation IS 'Reputation scores for community contributors';
COMMENT ON TABLE payments IS 'Payment transaction history';
COMMENT ON TABLE subscription_changes IS 'Audit log of subscription tier changes';

COMMENT ON COLUMN exploits.tx_hash IS 'Blockchain transaction hash (or generated hash for sources without tx)';
COMMENT ON COLUMN users.api_key IS 'UUID-based API key for programmatic access';
COMMENT ON COLUMN users.tier IS 'Subscription tier: free, basic, pro, enterprise';
COMMENT ON COLUMN community_submissions.status IS 'Submission status: pending, verified, rejected, duplicate';
