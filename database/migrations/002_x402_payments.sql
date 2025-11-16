-- x402 Payment Facilitator Database Schema
-- Migration: 002_x402_payments
-- Purpose: Store x402 payment records, tokens, and usage tracking

-- Payment records for x402 on-chain payments
CREATE TABLE IF NOT EXISTS x402_payments (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    chain VARCHAR(50) NOT NULL,  -- 'base', 'ethereum', 'solana'
    amount_usdc DECIMAL(18, 6) NOT NULL,
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    block_number BIGINT NOT NULL,
    confirmations INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,  -- 'pending', 'verified', 'expired', 'used'
    risk_score DECIMAL(3, 2) DEFAULT 0.1,
    requests_allocated INTEGER NOT NULL,
    requests_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment tokens for API access
CREATE TABLE IF NOT EXISTS x402_tokens (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 hash of token
    payment_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES x402_payments(id) ON DELETE CASCADE
);

-- API usage tracking for x402 payments
CREATE TABLE IF NOT EXISTS x402_usage (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES x402_payments(id) ON DELETE CASCADE
);

-- Payment analytics aggregated by hour
CREATE TABLE IF NOT EXISTS x402_analytics (
    id SERIAL PRIMARY KEY,
    hour_bucket TIMESTAMP NOT NULL,
    chain VARCHAR(50) NOT NULL,
    total_payments INTEGER DEFAULT 0,
    total_amount_usdc DECIMAL(18, 6) DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    unique_payers INTEGER DEFAULT 0,
    average_payment_usdc DECIMAL(18, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

-- Views for common queries

-- Active payments with remaining requests
CREATE OR REPLACE VIEW v_x402_active_payments AS
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
AND p.expires_at > CURRENT_TIMESTAMP
AND (p.requests_allocated - p.requests_used) > 0;

-- Payment statistics by chain (last 24 hours)
CREATE OR REPLACE VIEW v_x402_stats_24h AS
SELECT
    chain,
    COUNT(*) as total_payments,
    SUM(amount_usdc) as total_amount_usdc,
    SUM(requests_allocated) as total_requests_allocated,
    SUM(requests_used) as total_requests_used,
    COUNT(DISTINCT from_address) as unique_payers,
    AVG(amount_usdc) as average_payment_usdc
FROM x402_payments
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
AND status = 'verified'
GROUP BY chain;

-- Top payers by total spending
CREATE OR REPLACE VIEW v_x402_top_payers AS
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
CREATE OR REPLACE VIEW v_x402_endpoint_stats AS
SELECT
    u.endpoint,
    COUNT(*) as request_count,
    AVG(u.response_time_ms) as avg_response_time_ms,
    COUNT(DISTINCT u.payment_id) as unique_payers,
    COUNT(CASE WHEN u.status_code >= 200 AND u.status_code < 300 THEN 1 END) as success_count,
    COUNT(CASE WHEN u.status_code >= 400 THEN 1 END) as error_count
FROM x402_usage u
WHERE u.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY u.endpoint
ORDER BY request_count DESC;

-- Function to clean up expired payments and tokens
CREATE OR REPLACE FUNCTION cleanup_expired_x402_payments()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Update expired verified payments
    UPDATE x402_payments
    SET status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'verified'
    AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;

    -- Delete expired tokens
    DELETE FROM x402_tokens
    WHERE expires_at < CURRENT_TIMESTAMP;

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update payment analytics hourly
CREATE OR REPLACE FUNCTION update_x402_analytics()
RETURNS VOID AS $$
BEGIN
    INSERT INTO x402_analytics (
        hour_bucket,
        chain,
        total_payments,
        total_amount_usdc,
        total_requests,
        unique_payers,
        average_payment_usdc
    )
    SELECT
        date_trunc('hour', created_at) as hour_bucket,
        chain,
        COUNT(*) as total_payments,
        SUM(amount_usdc) as total_amount_usdc,
        SUM(requests_used) as total_requests,
        COUNT(DISTINCT from_address) as unique_payers,
        AVG(amount_usdc) as average_payment_usdc
    FROM x402_payments
    WHERE created_at >= date_trunc('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour')
    AND created_at < date_trunc('hour', CURRENT_TIMESTAMP)
    AND status = 'verified'
    GROUP BY date_trunc('hour', created_at), chain
    ON CONFLICT (hour_bucket, chain)
    DO UPDATE SET
        total_payments = EXCLUDED.total_payments,
        total_amount_usdc = EXCLUDED.total_amount_usdc,
        total_requests = EXCLUDED.total_requests,
        unique_payers = EXCLUDED.unique_payers,
        average_payment_usdc = EXCLUDED.average_payment_usdc;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE x402_payments IS 'On-chain USDC payment records for x402 HTTP 402 Payment Required implementation';
COMMENT ON TABLE x402_tokens IS 'Payment access tokens for authenticated API requests';
COMMENT ON TABLE x402_usage IS 'API usage tracking per payment for analytics and billing';
COMMENT ON TABLE x402_analytics IS 'Aggregated payment analytics by hour for reporting and monitoring';

COMMENT ON COLUMN x402_payments.tx_hash IS 'Blockchain transaction hash (unique per chain)';
COMMENT ON COLUMN x402_payments.chain IS 'Blockchain network: base, ethereum, or solana';
COMMENT ON COLUMN x402_payments.risk_score IS 'Risk assessment score (0.0-1.0, lower is better)';
COMMENT ON COLUMN x402_payments.requests_allocated IS 'Number of API requests allocated based on payment amount';
COMMENT ON COLUMN x402_payments.requests_used IS 'Number of API requests consumed';

COMMENT ON COLUMN x402_tokens.token_hash IS 'SHA256 hash of the payment token for secure storage';
COMMENT ON COLUMN x402_tokens.payment_id IS 'Reference to the payment record that generated this token';

-- Grant permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE ON x402_payments TO kamiyo_api;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON x402_tokens TO kamiyo_api;
-- GRANT SELECT, INSERT ON x402_usage TO kamiyo_api;
-- GRANT SELECT ON x402_analytics TO kamiyo_api;
