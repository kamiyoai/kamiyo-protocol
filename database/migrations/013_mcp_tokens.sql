-- =====================================================
-- Migration 013: MCP Token Management
-- Created: 2025-10-28
-- Description: Tables for MCP (Model Context Protocol) authentication tokens
-- =====================================================

-- Create mcp_tokens table
CREATE TABLE IF NOT EXISTS mcp_tokens (
    id SERIAL PRIMARY KEY,

    -- User and subscription linkage
    user_id VARCHAR(255) NOT NULL,
    subscription_id VARCHAR(255) NOT NULL,

    -- Token information
    token_hash VARCHAR(255) NOT NULL,  -- SHA-256 hash of JWT token
    tier VARCHAR(50) NOT NULL,          -- personal, team, enterprise

    -- Lifecycle timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Token status
    is_active BOOLEAN DEFAULT TRUE,

    -- Constraints
    CONSTRAINT valid_tier CHECK (tier IN ('personal', 'team', 'enterprise')),
    CONSTRAINT unique_user_subscription UNIQUE (user_id, subscription_id)
);

-- Create indexes for performance
CREATE INDEX idx_mcp_tokens_user_id ON mcp_tokens(user_id);
CREATE INDEX idx_mcp_tokens_subscription_id ON mcp_tokens(subscription_id);
CREATE INDEX idx_mcp_tokens_token_hash ON mcp_tokens(token_hash);
CREATE INDEX idx_mcp_tokens_is_active ON mcp_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_mcp_tokens_expires_at ON mcp_tokens(expires_at);

-- Create composite index for active token lookups
CREATE INDEX idx_mcp_tokens_active_user ON mcp_tokens(user_id, is_active)
WHERE is_active = TRUE;

-- Create index for cleanup queries
CREATE INDEX idx_mcp_tokens_expired ON mcp_tokens(expires_at, is_active)
WHERE is_active = TRUE;


-- Create mcp_token_usage table for tracking and analytics
CREATE TABLE IF NOT EXISTS mcp_token_usage (
    id BIGSERIAL PRIMARY KEY,

    -- Token reference
    token_hash VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,

    -- Usage metadata
    tool_name VARCHAR(255),           -- MCP tool that was called
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    -- Request metadata
    ip_address INET,
    user_agent TEXT,

    -- Performance metrics
    response_time_ms INTEGER
);

-- Create indexes for usage tracking
CREATE INDEX idx_mcp_token_usage_token_hash ON mcp_token_usage(token_hash);
CREATE INDEX idx_mcp_token_usage_user_id ON mcp_token_usage(user_id);
CREATE INDEX idx_mcp_token_usage_timestamp ON mcp_token_usage(timestamp DESC);
CREATE INDEX idx_mcp_token_usage_tool_name ON mcp_token_usage(tool_name);

-- Create composite index for analytics queries
CREATE INDEX idx_mcp_token_usage_user_time ON mcp_token_usage(user_id, timestamp DESC);


-- Create function to update last_used_at on token usage
CREATE OR REPLACE FUNCTION update_mcp_token_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE mcp_tokens
    SET last_used_at = NEW.timestamp
    WHERE token_hash = NEW.token_hash;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update last_used_at
CREATE TRIGGER update_mcp_token_last_used_trigger
    AFTER INSERT ON mcp_token_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_mcp_token_last_used();


-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mcp_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_mcp_tokens_updated_at_trigger
    BEFORE UPDATE ON mcp_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_mcp_tokens_updated_at();


-- Create view for active MCP tokens
CREATE OR REPLACE VIEW v_mcp_active_tokens AS
SELECT
    mt.id,
    mt.user_id,
    mt.subscription_id,
    mt.tier,
    mt.created_at,
    mt.expires_at,
    mt.last_used_at,
    mt.is_active,
    -- Calculate days until expiration
    EXTRACT(EPOCH FROM (mt.expires_at - CURRENT_TIMESTAMP)) / 86400 AS days_until_expiry,
    -- Usage statistics (last 30 days)
    COUNT(mtu.id) FILTER (WHERE mtu.timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS usage_count_30d,
    MAX(mtu.timestamp) AS last_usage_timestamp
FROM mcp_tokens mt
LEFT JOIN mcp_token_usage mtu ON mt.token_hash = mtu.token_hash
WHERE mt.is_active = TRUE
GROUP BY mt.id;


-- Create view for MCP token analytics
CREATE OR REPLACE VIEW v_mcp_token_analytics AS
SELECT
    DATE_TRUNC('day', mtu.timestamp) AS day,
    mt.tier,
    mtu.tool_name,
    COUNT(*) AS total_requests,
    COUNT(DISTINCT mtu.user_id) AS unique_users,
    COUNT(*) FILTER (WHERE mtu.success = TRUE) AS successful_requests,
    COUNT(*) FILTER (WHERE mtu.success = FALSE) AS failed_requests,
    AVG(mtu.response_time_ms) AS avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mtu.response_time_ms) AS p95_response_time_ms
FROM mcp_token_usage mtu
JOIN mcp_tokens mt ON mtu.token_hash = mt.token_hash
WHERE mtu.timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', mtu.timestamp), mt.tier, mtu.tool_name
ORDER BY day DESC, mt.tier, mtu.tool_name;


-- Create view for token expiration monitoring
CREATE OR REPLACE VIEW v_mcp_tokens_expiring_soon AS
SELECT
    mt.id,
    mt.user_id,
    mt.subscription_id,
    mt.tier,
    mt.created_at,
    mt.expires_at,
    mt.last_used_at,
    EXTRACT(EPOCH FROM (mt.expires_at - CURRENT_TIMESTAMP)) / 86400 AS days_until_expiry,
    c.email
FROM mcp_tokens mt
JOIN customers c ON mt.user_id = c.user_id
WHERE mt.is_active = TRUE
  AND mt.expires_at > CURRENT_TIMESTAMP
  AND mt.expires_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
ORDER BY mt.expires_at ASC;


-- Create function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_tokens()
RETURNS INTEGER AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    -- Mark expired tokens as inactive
    UPDATE mcp_tokens
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;

    -- Log the cleanup
    RAISE NOTICE 'Marked % expired MCP tokens as inactive', rows_updated;

    RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;


-- Create function to cleanup old usage data (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_mcp_usage()
RETURNS INTEGER AS $$
DECLARE
    rows_deleted INTEGER;
BEGIN
    DELETE FROM mcp_token_usage
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';

    GET DIAGNOSTICS rows_deleted = ROW_COUNT;

    RAISE NOTICE 'Deleted % old MCP usage records', rows_deleted;

    RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql;


-- Create function to get token statistics for a user
CREATE OR REPLACE FUNCTION get_user_mcp_stats(p_user_id VARCHAR)
RETURNS TABLE (
    active_tokens INTEGER,
    total_requests_30d BIGINT,
    last_used TIMESTAMP,
    current_tier VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT mt.id)::INTEGER AS active_tokens,
        COUNT(mtu.id) AS total_requests_30d,
        MAX(mtu.timestamp) AS last_used,
        MAX(mt.tier) AS current_tier
    FROM mcp_tokens mt
    LEFT JOIN mcp_token_usage mtu ON mt.token_hash = mtu.token_hash
        AND mtu.timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    WHERE mt.user_id = p_user_id
      AND mt.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;


-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON mcp_tokens TO kamiyo_app;
-- GRANT SELECT, INSERT ON mcp_token_usage TO kamiyo_app;
-- GRANT SELECT ON v_mcp_active_tokens TO kamiyo_app;
-- GRANT SELECT ON v_mcp_token_analytics TO kamiyo_app;
-- GRANT SELECT ON v_mcp_tokens_expiring_soon TO kamiyo_app;


-- Insert sample data for testing (optional - comment out for production)
-- INSERT INTO mcp_tokens (user_id, subscription_id, token_hash, tier, expires_at)
-- VALUES
--     ('test_user_1', 'sub_test_123', 'hash_test_1', 'personal', CURRENT_TIMESTAMP + INTERVAL '365 days'),
--     ('test_user_2', 'sub_test_456', 'hash_test_2', 'team', CURRENT_TIMESTAMP + INTERVAL '365 days'),
--     ('test_user_3', 'sub_test_789', 'hash_test_3', 'enterprise', CURRENT_TIMESTAMP + INTERVAL '365 days');


-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 013 completed successfully';
    RAISE NOTICE 'Created tables: mcp_tokens, mcp_token_usage';
    RAISE NOTICE 'Created views: v_mcp_active_tokens, v_mcp_token_analytics, v_mcp_tokens_expiring_soon';
    RAISE NOTICE 'Created functions: cleanup_expired_mcp_tokens, cleanup_old_mcp_usage, get_user_mcp_stats';
    RAISE NOTICE 'Created triggers: update_mcp_token_last_used_trigger, update_mcp_tokens_updated_at_trigger';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Configure MCP_JWT_SECRET in environment';
    RAISE NOTICE '2. Update Stripe webhooks to generate MCP tokens';
    RAISE NOTICE '3. Set up cron job for cleanup_expired_mcp_tokens()';
    RAISE NOTICE '4. Monitor v_mcp_token_analytics for usage patterns';
END $$;
