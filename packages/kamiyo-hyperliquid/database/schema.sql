-- KAMIYO Hyperliquid Security Monitoring Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- HLP Vault Monitoring Tables
-- ============================================================================

CREATE TABLE hlp_vault_snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    vault_address VARCHAR(66) NOT NULL,

    -- Vault metrics
    total_value_locked DECIMAL(20, 2) NOT NULL,
    account_value DECIMAL(20, 2) NOT NULL,
    pnl_24h DECIMAL(20, 2),
    pnl_7d DECIMAL(20, 2),
    pnl_30d DECIMAL(20, 2),

    -- Performance metrics
    sharpe_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(10, 4),
    win_rate DECIMAL(5, 4),

    -- Anomaly detection
    anomaly_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    volatility_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    loss_streak_score DECIMAL(5, 2) NOT NULL DEFAULT 0,

    -- Health status
    is_healthy BOOLEAN NOT NULL DEFAULT true,
    health_issues TEXT[],

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_vault_snapshot UNIQUE (vault_address, timestamp)
);

CREATE INDEX idx_hlp_snapshots_timestamp ON hlp_vault_snapshots(timestamp DESC);
CREATE INDEX idx_hlp_snapshots_vault ON hlp_vault_snapshots(vault_address);
CREATE INDEX idx_hlp_snapshots_unhealthy ON hlp_vault_snapshots(is_healthy) WHERE is_healthy = false;

-- ============================================================================
-- Security Events and Alerts
-- ============================================================================

CREATE TABLE security_events (
    event_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    threat_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,

    -- Financial impact
    estimated_loss_usd DECIMAL(20, 2),
    affected_users INTEGER,

    -- Technical details
    affected_assets TEXT[],
    indicators JSONB,

    -- Actions and status
    recommended_action TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Related data
    related_liquidations TEXT[],
    related_transactions TEXT[],
    related_addresses TEXT[],

    -- Source tracking
    source VARCHAR(100) NOT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX idx_events_severity ON security_events(severity);
CREATE INDEX idx_events_threat_type ON security_events(threat_type);
CREATE INDEX idx_events_active ON security_events(is_active) WHERE is_active = true;
CREATE INDEX idx_events_source ON security_events(source);

-- ============================================================================
-- Oracle Price Deviations
-- ============================================================================

CREATE TABLE oracle_deviations (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    asset VARCHAR(20) NOT NULL,

    -- Price data
    hyperliquid_price DECIMAL(20, 8) NOT NULL,
    binance_price DECIMAL(20, 8),
    coinbase_price DECIMAL(20, 8),
    pyth_price DECIMAL(20, 8),

    -- Deviation metrics
    max_deviation_pct DECIMAL(10, 4) NOT NULL,
    duration_seconds DECIMAL(10, 2) NOT NULL DEFAULT 0,

    -- Risk assessment
    is_dangerous BOOLEAN NOT NULL DEFAULT false,
    risk_score DECIMAL(5, 2) NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deviations_timestamp ON oracle_deviations(timestamp DESC);
CREATE INDEX idx_deviations_asset ON oracle_deviations(asset);
CREATE INDEX idx_deviations_dangerous ON oracle_deviations(is_dangerous) WHERE is_dangerous = true;
CREATE INDEX idx_deviations_asset_time ON oracle_deviations(asset, timestamp DESC);

-- ============================================================================
-- Liquidation Patterns
-- ============================================================================

CREATE TABLE liquidation_patterns (
    pattern_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN ('flash_loan', 'cascade', 'manipulation', 'coordinated')),

    -- Pattern details
    liquidation_ids TEXT[],
    total_liquidated_usd DECIMAL(20, 2) NOT NULL,
    affected_users INTEGER NOT NULL,

    -- Pattern characteristics
    duration_seconds DECIMAL(10, 2) NOT NULL,
    assets_involved TEXT[],
    price_impact JSONB,

    -- Suspicion analysis
    suspicion_score DECIMAL(5, 2) NOT NULL,
    indicators TEXT[],

    -- Context
    block_number BIGINT,
    is_cross_block BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patterns_timestamp ON liquidation_patterns(timestamp DESC);
CREATE INDEX idx_patterns_type ON liquidation_patterns(pattern_type);
CREATE INDEX idx_patterns_suspicion ON liquidation_patterns(suspicion_score DESC);

-- ============================================================================
-- Exploits/Incidents Aggregation
-- ============================================================================

CREATE TABLE exploits (
    id SERIAL PRIMARY KEY,
    exploit_id VARCHAR(128) UNIQUE NOT NULL,
    tx_hash VARCHAR(128),

    -- Basic information
    chain VARCHAR(50) NOT NULL,
    protocol VARCHAR(100) NOT NULL,
    category VARCHAR(50),

    -- Financial impact
    amount_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,

    -- Temporal data
    timestamp TIMESTAMPTZ NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Details
    description TEXT,
    recovery_status VARCHAR(50),

    -- Source tracking
    source VARCHAR(100) NOT NULL,
    source_url TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exploits_timestamp ON exploits(timestamp DESC);
CREATE INDEX idx_exploits_chain ON exploits(chain);
CREATE INDEX idx_exploits_protocol ON exploits(protocol);
CREATE INDEX idx_exploits_amount ON exploits(amount_usd DESC);
CREATE INDEX idx_exploits_source ON exploits(source);
CREATE INDEX idx_exploits_detected ON exploits(detected_at DESC);

-- ============================================================================
-- API Usage Tracking (for rate limiting and analytics)
-- ============================================================================

CREATE TABLE api_requests (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Request details
    ip_address INET NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,

    -- Response
    status_code INTEGER,
    response_time_ms INTEGER,

    -- User tracking (for authenticated requests)
    api_key VARCHAR(64),
    user_id VARCHAR(64),

    -- Rate limiting
    rate_limit_hit BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    user_agent TEXT,
    query_params JSONB
);

CREATE INDEX idx_requests_timestamp ON api_requests(timestamp DESC);
CREATE INDEX idx_requests_ip ON api_requests(ip_address, timestamp DESC);
CREATE INDEX idx_requests_endpoint ON api_requests(endpoint);
CREATE INDEX idx_requests_rate_limit ON api_requests(rate_limit_hit) WHERE rate_limit_hit = true;

-- Partition by month for scalability
-- CREATE TABLE api_requests_y2025m01 PARTITION OF api_requests
--     FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- ============================================================================
-- System Audit Log (immutable, for compliance)
-- ============================================================================

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Action details
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(128),

    -- Actor
    user_id VARCHAR(64),
    ip_address INET,

    -- Changes
    before_state JSONB,
    after_state JSONB,

    -- Metadata
    details JSONB,

    -- Tamper detection
    checksum VARCHAR(64) NOT NULL
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================================================
-- Alert Subscriptions (for notification system)
-- ============================================================================

CREATE TABLE alert_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,

    -- Subscription details
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('webhook', 'telegram', 'discord', 'email', 'sms')),
    channel_config JSONB NOT NULL, -- webhook URL, telegram chat_id, etc.

    -- Filters
    min_severity VARCHAR(20) CHECK (min_severity IN ('critical', 'high', 'medium', 'low', 'info')),
    threat_types TEXT[],
    min_amount_usd DECIMAL(20, 2),

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON alert_subscriptions(user_id);
CREATE INDEX idx_subscriptions_active ON alert_subscriptions(is_active) WHERE is_active = true;

-- ============================================================================
-- Alert Delivery Log
-- ============================================================================

CREATE TABLE alert_deliveries (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Alert details
    event_id VARCHAR(64) NOT NULL REFERENCES security_events(event_id),
    subscription_id INTEGER NOT NULL REFERENCES alert_subscriptions(id),

    -- Delivery status
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
    retry_count INTEGER NOT NULL DEFAULT 0,

    -- Response
    response_code INTEGER,
    response_message TEXT,

    -- Metadata
    delivered_at TIMESTAMPTZ,
    error_details TEXT
);

CREATE INDEX idx_deliveries_timestamp ON alert_deliveries(timestamp DESC);
CREATE INDEX idx_deliveries_event ON alert_deliveries(event_id);
CREATE INDEX idx_deliveries_status ON alert_deliveries(status);

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- Recent critical events
CREATE VIEW recent_critical_events AS
SELECT
    event_id,
    timestamp,
    severity,
    threat_type,
    title,
    estimated_loss_usd,
    is_active
FROM security_events
WHERE severity IN ('critical', 'high')
    AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- HLP vault health summary
CREATE VIEW hlp_vault_health_summary AS
SELECT
    vault_address,
    MAX(timestamp) as last_update,
    (SELECT account_value FROM hlp_vault_snapshots s2
     WHERE s2.vault_address = s1.vault_address
     ORDER BY timestamp DESC LIMIT 1) as current_value,
    (SELECT is_healthy FROM hlp_vault_snapshots s2
     WHERE s2.vault_address = s1.vault_address
     ORDER BY timestamp DESC LIMIT 1) as is_healthy,
    AVG(anomaly_score) as avg_anomaly_score
FROM hlp_vault_snapshots s1
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY vault_address;

-- API usage statistics
CREATE VIEW api_usage_stats AS
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    endpoint,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_response_time,
    SUM(CASE WHEN rate_limit_hit THEN 1 ELSE 0 END) as rate_limited_count
FROM api_requests
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp), endpoint
ORDER BY hour DESC, request_count DESC;

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at
CREATE TRIGGER update_security_events_updated_at BEFORE UPDATE ON security_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exploits_updated_at BEFORE UPDATE ON exploits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_subscriptions_updated_at BEFORE UPDATE ON alert_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate checksum for audit log
CREATE OR REPLACE FUNCTION calculate_audit_checksum()
RETURNS TRIGGER AS $$
BEGIN
    NEW.checksum = encode(
        digest(
            NEW.timestamp::text ||
            NEW.action ||
            COALESCE(NEW.entity_id, '') ||
            COALESCE(NEW.user_id, '') ||
            COALESCE(NEW.details::text, ''),
            'sha256'
        ),
        'hex'
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_log_checksum BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION calculate_audit_checksum();

-- ============================================================================
-- Initial Data / Seed Data
-- ============================================================================

-- Insert system user for automated actions
-- (Add seed data here if needed)

-- ============================================================================
-- Permissions (adjust for your security requirements)
-- ============================================================================

-- Create read-only role for reporting/analytics
-- CREATE ROLE kamiyo_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO kamiyo_readonly;

-- Create application role with full access
-- CREATE ROLE kamiyo_app;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kamiyo_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kamiyo_app;

-- ============================================================================
-- Maintenance
-- ============================================================================

-- Clean up old API requests (keep 30 days)
-- Schedule this with pg_cron or external cron
-- DELETE FROM api_requests WHERE timestamp < NOW() - INTERVAL '30 days';

-- Archive old exploits (optional)
-- CREATE TABLE exploits_archive (LIKE exploits INCLUDING ALL);

COMMENT ON TABLE hlp_vault_snapshots IS 'Historical snapshots of HLP vault health metrics';
COMMENT ON TABLE security_events IS 'Security events and threats detected by monitoring system';
COMMENT ON TABLE oracle_deviations IS 'Oracle price deviations across multiple sources';
COMMENT ON TABLE liquidation_patterns IS 'Detected suspicious liquidation patterns';
COMMENT ON TABLE exploits IS 'Aggregated exploit and incident data from all sources';
COMMENT ON TABLE api_requests IS 'API usage tracking for rate limiting and analytics';
COMMENT ON TABLE audit_log IS 'Immutable audit trail for compliance';
COMMENT ON TABLE alert_subscriptions IS 'User alert notification preferences';
COMMENT ON TABLE alert_deliveries IS 'Alert delivery tracking and retry logic';
