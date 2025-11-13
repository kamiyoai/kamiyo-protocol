-- Migration: Add ERC-8004 Agent Identity tables (Production Hardened)
-- Date: 2025-01-13
-- Description: Production-grade ERC-8004 agent identity and reputation system
--              with comprehensive constraints, indexes, and security features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization

-- Agent Identity Registry
-- Tracks on-chain agent identities (ERC-721 NFTs)
CREATE TABLE IF NOT EXISTS erc8004_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id BIGINT NOT NULL CHECK (agent_id > 0),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    registry_address VARCHAR(66) NOT NULL CHECK (registry_address ~ '^0x[a-fA-F0-9]{40}$'),
    owner_address VARCHAR(66) NOT NULL CHECK (owner_address ~ '^0x[a-fA-F0-9]{40}$'),
    token_uri TEXT CHECK (token_uri IS NULL OR length(token_uri) <= 2048),
    registration_file JSONB CHECK (jsonb_typeof(registration_file) = 'object'),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chain, registry_address, agent_id),
    CONSTRAINT valid_registration_file CHECK (
        registration_file IS NULL OR (
            registration_file ? 'name' AND
            registration_file ? 'description' AND
            jsonb_typeof(registration_file->'endpoints') = 'array'
        )
    )
);

-- Indexes for performance
CREATE INDEX idx_erc8004_agents_owner ON erc8004_agents(lower(owner_address));
CREATE INDEX idx_erc8004_agents_chain ON erc8004_agents(chain) WHERE status = 'active';
CREATE INDEX idx_erc8004_agents_status ON erc8004_agents(status);
CREATE INDEX idx_erc8004_agents_created ON erc8004_agents(created_at DESC);
CREATE INDEX idx_erc8004_agents_activity ON erc8004_agents(last_activity_at DESC) WHERE status = 'active';
CREATE INDEX idx_erc8004_agents_name ON erc8004_agents USING gin ((registration_file->'name') gin_trgm_ops);

-- Agent Metadata with size limits
CREATE TABLE IF NOT EXISTS erc8004_agent_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL CHECK (key ~ '^[a-zA-Z0-9_-]+$'),
    value BYTEA CHECK (length(value) <= 1048576), -- 1MB limit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(agent_uuid, key)
);

CREATE INDEX idx_erc8004_metadata_agent ON erc8004_agent_metadata(agent_uuid);
CREATE INDEX idx_erc8004_metadata_key ON erc8004_agent_metadata(key);

-- Agent Reputation Feedback with enhanced constraints
CREATE TABLE IF NOT EXISTS erc8004_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    client_address VARCHAR(66) NOT NULL CHECK (client_address ~ '^0x[a-fA-F0-9]{40}$'),
    score SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
    tag1 VARCHAR(64) CHECK (tag1 IS NULL OR tag1 ~ '^[a-z0-9_-]+$'),
    tag2 VARCHAR(64) CHECK (tag2 IS NULL OR tag2 ~ '^[a-z0-9_-]+$'),
    file_uri TEXT CHECK (file_uri IS NULL OR length(file_uri) <= 2048),
    file_hash VARCHAR(66) CHECK (file_hash IS NULL OR file_hash ~ '^0x[a-fA-F0-9]{64}$'),
    feedback_auth BYTEA CHECK (feedback_auth IS NULL OR length(feedback_auth) <= 4096),
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    tx_hash VARCHAR(66) CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT CHECK (revocation_reason IS NULL OR length(revocation_reason) <= 500),
    CONSTRAINT valid_revocation CHECK (
        (is_revoked = FALSE AND revoked_at IS NULL) OR
        (is_revoked = TRUE AND revoked_at IS NOT NULL)
    )
);

-- Indexes optimized for queries
CREATE INDEX idx_erc8004_reputation_agent ON erc8004_reputation(agent_uuid) WHERE is_revoked = FALSE;
CREATE INDEX idx_erc8004_reputation_client ON erc8004_reputation(lower(client_address));
CREATE INDEX idx_erc8004_reputation_score ON erc8004_reputation(score) WHERE is_revoked = FALSE;
CREATE INDEX idx_erc8004_reputation_tags ON erc8004_reputation(tag1, tag2) WHERE is_revoked = FALSE;
CREATE INDEX idx_erc8004_reputation_created ON erc8004_reputation(created_at DESC);
CREATE INDEX idx_erc8004_reputation_tx ON erc8004_reputation(tx_hash) WHERE tx_hash IS NOT NULL;

-- Agent Validation Records
CREATE TABLE IF NOT EXISTS erc8004_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_hash VARCHAR(66) NOT NULL UNIQUE CHECK (request_hash ~ '^0x[a-fA-F0-9]{64}$'),
    validator_address VARCHAR(66) NOT NULL CHECK (validator_address ~ '^0x[a-fA-F0-9]{40}$'),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    response SMALLINT CHECK (response IS NULL OR (response >= 0 AND response <= 100)),
    tag VARCHAR(64) CHECK (tag IS NULL OR tag ~ '^[a-z0-9_-]+$'),
    request_uri TEXT CHECK (request_uri IS NULL OR length(request_uri) <= 2048),
    request_hash_value VARCHAR(66) CHECK (request_hash_value IS NULL OR request_hash_value ~ '^0x[a-fA-F0-9]{64}$'),
    response_uri TEXT CHECK (response_uri IS NULL OR length(response_uri) <= 2048),
    response_hash VARCHAR(66) CHECK (response_hash IS NULL OR response_hash ~ '^0x[a-fA-F0-9]{64}$'),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    tx_hash VARCHAR(66) CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND response IS NOT NULL) OR
        (status != 'completed')
    )
);

CREATE INDEX idx_erc8004_validations_agent ON erc8004_validations(agent_uuid);
CREATE INDEX idx_erc8004_validations_validator ON erc8004_validations(lower(validator_address));
CREATE INDEX idx_erc8004_validations_status ON erc8004_validations(status, created_at DESC);
CREATE INDEX idx_erc8004_validations_expires ON erc8004_validations(expires_at) WHERE status = 'pending';

-- Agent Payment History with proper foreign key
CREATE TABLE IF NOT EXISTS erc8004_agent_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    x402_payment_id UUID,
    tx_hash VARCHAR(66) NOT NULL CHECK (tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    amount_usdc DECIMAL(20, 6) NOT NULL CHECK (amount_usdc >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'rejected')),
    endpoint VARCHAR(255) CHECK (endpoint IS NULL OR length(endpoint) <= 255),
    failure_reason TEXT CHECK (failure_reason IS NULL OR length(failure_reason) <= 1000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tx_hash, chain),
    CONSTRAINT valid_verification CHECK (
        (status = 'verified' AND verified_at IS NOT NULL) OR
        (status != 'verified')
    )
);

CREATE INDEX idx_erc8004_agent_payments_agent ON erc8004_agent_payments(agent_uuid);
CREATE INDEX idx_erc8004_agent_payments_tx ON erc8004_agent_payments(tx_hash, chain);
CREATE INDEX idx_erc8004_agent_payments_status ON erc8004_agent_payments(status, created_at DESC);
CREATE INDEX idx_erc8004_agent_payments_created ON erc8004_agent_payments(created_at DESC);

-- Reputation Summary View (Materialized for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_erc8004_agent_reputation AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.chain,
    a.owner_address,
    COUNT(r.id) as total_feedback,
    COALESCE(AVG(r.score)::NUMERIC(5,2), 0) as average_score,
    COUNT(CASE WHEN r.score >= 80 THEN 1 END) as positive_feedback,
    COUNT(CASE WHEN r.score < 50 THEN 1 END) as negative_feedback,
    COUNT(CASE WHEN r.is_revoked = true THEN 1 END) as revoked_feedback,
    MAX(r.created_at) as last_feedback_at,
    COUNT(DISTINCT r.client_address) as unique_clients
FROM erc8004_agents a
LEFT JOIN erc8004_reputation r ON a.id = r.agent_uuid AND r.is_revoked = false
GROUP BY a.id, a.agent_id, a.chain, a.owner_address;

CREATE UNIQUE INDEX idx_mv_erc8004_agent_reputation_uuid ON mv_erc8004_agent_reputation(agent_uuid);
CREATE INDEX idx_mv_erc8004_agent_reputation_score ON mv_erc8004_agent_reputation(average_score DESC);

-- Payment Statistics View (Materialized)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_erc8004_agent_payment_stats AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.owner_address,
    COUNT(ap.id) as total_payments,
    COALESCE(SUM(ap.amount_usdc), 0) as total_amount_usdc,
    COUNT(CASE WHEN ap.status = 'verified' THEN 1 END) as successful_payments,
    COUNT(CASE WHEN ap.status = 'failed' THEN 1 END) as failed_payments,
    COALESCE(AVG(ap.amount_usdc)::NUMERIC(20,6), 0) as avg_payment_amount,
    MAX(ap.created_at) as last_payment_at,
    COALESCE(
        (COUNT(CASE WHEN ap.status = 'verified' THEN 1 END)::FLOAT /
         NULLIF(COUNT(ap.id), 0) * 100)::NUMERIC(5,2),
        0
    ) as success_rate,
    COUNT(DISTINCT ap.endpoint) as unique_endpoints_used
FROM erc8004_agents a
LEFT JOIN erc8004_agent_payments ap ON a.id = ap.agent_uuid
GROUP BY a.id, a.agent_id, a.owner_address;

CREATE UNIQUE INDEX idx_mv_erc8004_agent_payment_stats_uuid ON mv_erc8004_agent_payment_stats(agent_uuid);
CREATE INDEX idx_mv_erc8004_agent_payment_stats_success ON mv_erc8004_agent_payment_stats(success_rate DESC);

-- Combined Agent Stats View (Regular view using materialized views)
CREATE OR REPLACE VIEW v_erc8004_agent_stats AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.chain,
    a.registry_address,
    a.owner_address,
    a.status,
    a.created_at as registered_at,
    a.last_activity_at,
    r.total_feedback,
    r.average_score as reputation_score,
    r.positive_feedback,
    r.negative_feedback,
    r.unique_clients as reputation_sources,
    p.total_payments,
    p.total_amount_usdc,
    p.success_rate as payment_success_rate,
    p.last_payment_at,
    p.unique_endpoints_used,
    CASE
        WHEN p.success_rate >= 95 AND r.average_score >= 80 AND p.total_payments >= 10 THEN 'excellent'
        WHEN p.success_rate >= 85 AND r.average_score >= 70 AND p.total_payments >= 5 THEN 'good'
        WHEN p.success_rate >= 75 AND r.average_score >= 60 THEN 'fair'
        WHEN p.total_payments = 0 AND r.total_feedback = 0 THEN 'new'
        ELSE 'poor'
    END as trust_level
FROM erc8004_agents a
LEFT JOIN mv_erc8004_agent_reputation r ON a.id = r.agent_uuid
LEFT JOIN mv_erc8004_agent_payment_stats p ON a.id = p.agent_uuid;

-- Update agent_id column in x402_payments table with proper constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'x402_payments' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE x402_payments ADD COLUMN agent_id UUID;
    END IF;
END $$;

ALTER TABLE x402_payments DROP CONSTRAINT IF EXISTS fk_x402_payments_agent;
ALTER TABLE x402_payments ADD CONSTRAINT fk_x402_payments_agent
    FOREIGN KEY (agent_id) REFERENCES erc8004_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_x402_payments_agent ON x402_payments(agent_id) WHERE agent_id IS NOT NULL;

-- Auto-update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_erc8004_agents_updated_at BEFORE UPDATE ON erc8004_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_erc8004_agent_metadata_updated_at BEFORE UPDATE ON erc8004_agent_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_erc8004_validations_updated_at BEFORE UPDATE ON erc8004_validations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update last_activity_at on agents
CREATE OR REPLACE FUNCTION update_agent_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE erc8004_agents
    SET last_activity_at = CURRENT_TIMESTAMP
    WHERE id = NEW.agent_uuid;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_activity_on_reputation AFTER INSERT ON erc8004_reputation
    FOR EACH ROW EXECUTE FUNCTION update_agent_activity();

CREATE TRIGGER update_agent_activity_on_payment AFTER INSERT ON erc8004_agent_payments
    FOR EACH ROW EXECUTE FUNCTION update_agent_activity();

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_erc8004_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_reputation;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_payment_stats;
END;
$$ LANGUAGE plpgsql;

-- Scheduled refresh (requires pg_cron extension)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('refresh-erc8004-stats', '*/5 * * * *', 'SELECT refresh_erc8004_stats()');

-- Table comments for documentation
COMMENT ON TABLE erc8004_agents IS 'ERC-8004 agent identity registry (ERC-721 NFTs)';
COMMENT ON TABLE erc8004_reputation IS 'Agent reputation feedback following ERC-8004 standard';
COMMENT ON TABLE erc8004_validations IS 'Independent validation records for agents';
COMMENT ON TABLE erc8004_agent_payments IS 'Links x402 payments to agent identities for reputation building';
COMMENT ON VIEW v_erc8004_agent_stats IS 'Real-time combined agent reputation and payment statistics';
COMMENT ON MATERIALIZED VIEW mv_erc8004_agent_reputation IS 'Materialized reputation metrics for performance';
COMMENT ON MATERIALIZED VIEW mv_erc8004_agent_payment_stats IS 'Materialized payment statistics for performance';

-- Grant appropriate permissions (adjust for your user)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO api_user;
