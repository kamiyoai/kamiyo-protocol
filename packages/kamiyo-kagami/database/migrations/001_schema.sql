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

-- Payment Chain Tracking (Circular Dependency Detection)
CREATE TABLE IF NOT EXISTS erc8004_payment_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_tx_hash VARCHAR(66) NOT NULL CHECK (root_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    forwarded_to_agent UUID REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    hop_number INT NOT NULL CHECK (hop_number > 0 AND hop_number <= 10),
    amount_usdc DECIMAL(20, 6) NOT NULL CHECK (amount_usdc >= 0),
    detected_cycle BOOLEAN DEFAULT FALSE NOT NULL,
    cycle_depth INT CHECK (cycle_depth IS NULL OR cycle_depth > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT no_self_forward CHECK (agent_uuid != forwarded_to_agent)
);

CREATE INDEX idx_erc8004_payment_chains_root ON erc8004_payment_chains(root_tx_hash);
CREATE INDEX idx_erc8004_payment_chains_agent ON erc8004_payment_chains(agent_uuid);
CREATE INDEX idx_erc8004_payment_chains_forwarded ON erc8004_payment_chains(forwarded_to_agent) WHERE forwarded_to_agent IS NOT NULL;
CREATE INDEX idx_erc8004_payment_chains_cycle ON erc8004_payment_chains(detected_cycle) WHERE detected_cycle = TRUE;

-- Detect payment cycles using recursive CTE
CREATE OR REPLACE FUNCTION detect_payment_cycle(root_tx VARCHAR(66))
RETURNS TABLE(has_cycle BOOLEAN, cycle_agents UUID[], cycle_depth INT) AS $$
WITH RECURSIVE payment_path AS (
    SELECT
        agent_uuid,
        forwarded_to_agent,
        ARRAY[agent_uuid] as path,
        1 as depth
    FROM erc8004_payment_chains
    WHERE root_tx_hash = root_tx AND hop_number = 1

    UNION ALL

    SELECT
        pc.agent_uuid,
        pc.forwarded_to_agent,
        pp.path || pc.agent_uuid,
        pp.depth + 1
    FROM erc8004_payment_chains pc
    JOIN payment_path pp ON pc.agent_uuid = pp.forwarded_to_agent
    WHERE NOT pc.agent_uuid = ANY(pp.path) AND pp.depth < 10
)
SELECT
    EXISTS(
        SELECT 1 FROM payment_path
        WHERE forwarded_to_agent = ANY(path)
    ) as has_cycle,
    COALESCE(
        (SELECT path FROM payment_path
         WHERE forwarded_to_agent = ANY(path)
         ORDER BY depth DESC LIMIT 1),
        '{}'::UUID[]
    ) as cycle_agents,
    COALESCE(
        (SELECT depth FROM payment_path
         WHERE forwarded_to_agent = ANY(path)
         ORDER BY depth DESC LIMIT 1),
        0
    ) as cycle_depth;
$$ LANGUAGE sql STABLE;

-- Verify if a forward would create a cycle
CREATE OR REPLACE FUNCTION verify_forward_safe(
    p_root_tx VARCHAR(66),
    p_source_agent UUID,
    p_target_agent UUID
)
RETURNS TABLE(safe BOOLEAN, reason TEXT, existing_cycle_agents UUID[]) AS $$
DECLARE
    v_cycle_result RECORD;
BEGIN
    IF p_source_agent = p_target_agent THEN
        RETURN QUERY SELECT FALSE, 'self_forward'::TEXT, ARRAY[p_source_agent]::UUID[];
        RETURN;
    END IF;

    SELECT * INTO v_cycle_result FROM detect_payment_cycle(p_root_tx);

    IF v_cycle_result.has_cycle THEN
        RETURN QUERY SELECT FALSE, 'existing_cycle'::TEXT, v_cycle_result.cycle_agents;
        RETURN;
    END IF;

    IF EXISTS(
        SELECT 1 FROM erc8004_payment_chains
        WHERE root_tx_hash = p_root_tx
        AND agent_uuid = p_target_agent
    ) THEN
        RETURN QUERY SELECT FALSE, 'would_create_cycle'::TEXT, ARRAY[p_source_agent, p_target_agent]::UUID[];
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'safe'::TEXT, '{}'::UUID[];
END;
$$ LANGUAGE plpgsql;

-- Update trust calculation to include cycle violations
DROP VIEW IF EXISTS v_erc8004_agent_stats;
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
    COALESCE(
        (SELECT COUNT(*) FROM erc8004_reputation rep
         WHERE rep.agent_uuid = a.id
         AND rep.tag1 = 'payment_cycle'),
        0
    ) as cycle_violations,
    CASE
        WHEN EXISTS(
            SELECT 1 FROM erc8004_reputation rep
            WHERE rep.agent_uuid = a.id
            AND rep.tag1 = 'payment_cycle'
        ) THEN 'untrusted'
        WHEN p.success_rate >= 95 AND r.average_score >= 80 AND p.total_payments >= 10 THEN 'excellent'
        WHEN p.success_rate >= 85 AND r.average_score >= 70 AND p.total_payments >= 5 THEN 'good'
        WHEN p.success_rate >= 75 AND r.average_score >= 60 THEN 'fair'
        WHEN p.total_payments = 0 AND r.total_feedback = 0 THEN 'new'
        ELSE 'poor'
    END as trust_level
FROM erc8004_agents a
LEFT JOIN mv_erc8004_agent_reputation r ON a.id = r.agent_uuid
LEFT JOIN mv_erc8004_agent_payment_stats p ON a.id = p.agent_uuid;

-- Game Theory: Stake and Rewards System
CREATE TABLE IF NOT EXISTS erc8004_agent_stakes (
    agent_uuid UUID PRIMARY KEY REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    staked_amount_usdc DECIMAL(20, 6) NOT NULL DEFAULT 0 CHECK (staked_amount_usdc >= 0),
    slashed_amount_usdc DECIMAL(20, 6) NOT NULL DEFAULT 0 CHECK (slashed_amount_usdc >= 0),
    locked_until TIMESTAMP WITH TIME ZONE,
    stake_tier VARCHAR(20) DEFAULT 'none' CHECK (stake_tier IN ('none', 'bronze', 'silver', 'gold', 'platinum')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT valid_stake CHECK (staked_amount_usdc >= slashed_amount_usdc)
);

CREATE INDEX idx_erc8004_agent_stakes_tier ON erc8004_agent_stakes(stake_tier) WHERE stake_tier != 'none';
CREATE INDEX idx_erc8004_agent_stakes_amount ON erc8004_agent_stakes(staked_amount_usdc DESC);

-- Game Theory: Cooperation Rewards for Honest Forwarding
CREATE TABLE IF NOT EXISTS erc8004_cooperation_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL CHECK (reward_type IN ('honest_forward', 'cycle_report', 'long_term_reliability', 'network_contribution')),
    reward_points INT NOT NULL CHECK (reward_points >= 0),
    reward_amount_usdc DECIMAL(20, 6) CHECK (reward_amount_usdc IS NULL OR reward_amount_usdc >= 0),
    tx_hash VARCHAR(66) CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_erc8004_cooperation_rewards_agent ON erc8004_cooperation_rewards(agent_uuid);
CREATE INDEX idx_erc8004_cooperation_rewards_type ON erc8004_cooperation_rewards(reward_type);
CREATE INDEX idx_erc8004_cooperation_rewards_created ON erc8004_cooperation_rewards(created_at DESC);

-- Game Theory: Reputation Decay and Recovery
CREATE TABLE IF NOT EXISTS erc8004_reputation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    reputation_score NUMERIC(5, 2) NOT NULL,
    trust_level VARCHAR(20) NOT NULL,
    decay_applied BOOLEAN DEFAULT FALSE,
    recovery_milestone VARCHAR(50),
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_erc8004_reputation_history_agent ON erc8004_reputation_history(agent_uuid, snapshot_at DESC);
CREATE INDEX idx_erc8004_reputation_history_decay ON erc8004_reputation_history(decay_applied) WHERE decay_applied = TRUE;

-- Calculate stake tier based on amount
CREATE OR REPLACE FUNCTION calculate_stake_tier(stake_amount DECIMAL)
RETURNS VARCHAR AS $$
BEGIN
    IF stake_amount >= 10000 THEN RETURN 'platinum';
    ELSIF stake_amount >= 5000 THEN RETURN 'gold';
    ELSIF stake_amount >= 1000 THEN RETURN 'silver';
    ELSIF stake_amount >= 100 THEN RETURN 'bronze';
    ELSE RETURN 'none';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Slash stake on cycle violation (Nash equilibrium enforcement)
CREATE OR REPLACE FUNCTION slash_stake_for_violation(
    p_agent_uuid UUID,
    p_violation_severity INT
)
RETURNS DECIMAL AS $$
DECLARE
    v_staked_amount DECIMAL;
    v_slash_amount DECIMAL;
    v_slash_percentage DECIMAL;
BEGIN
    SELECT staked_amount_usdc INTO v_staked_amount
    FROM erc8004_agent_stakes
    WHERE agent_uuid = p_agent_uuid;

    IF v_staked_amount IS NULL OR v_staked_amount = 0 THEN
        RETURN 0;
    END IF;

    v_slash_percentage := LEAST(0.5, p_violation_severity * 0.1);
    v_slash_amount := v_staked_amount * v_slash_percentage;

    UPDATE erc8004_agent_stakes
    SET slashed_amount_usdc = slashed_amount_usdc + v_slash_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE agent_uuid = p_agent_uuid;

    RETURN v_slash_amount;
END;
$$ LANGUAGE plpgsql;

-- Apply reputation decay (time-based, encourages continued good behavior)
CREATE OR REPLACE FUNCTION apply_reputation_decay()
RETURNS void AS $$
BEGIN
    INSERT INTO erc8004_reputation_history (agent_uuid, reputation_score, trust_level, decay_applied)
    SELECT
        agent_uuid,
        reputation_score,
        trust_level,
        TRUE
    FROM v_erc8004_agent_stats
    WHERE last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

    UPDATE erc8004_agents a
    SET last_activity_at = CURRENT_TIMESTAMP
    WHERE a.last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND EXISTS (
        SELECT 1 FROM erc8004_reputation r
        WHERE r.agent_uuid = a.id
        AND r.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    );
END;
$$ LANGUAGE plpgsql;

-- Sybil resistance: Link uniqueness score based on network topology
CREATE OR REPLACE FUNCTION calculate_sybil_resistance_score(p_agent_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_unique_counterparties INT;
    v_total_transactions INT;
    v_avg_transaction_amount DECIMAL;
    v_time_span_days INT;
    v_score NUMERIC;
BEGIN
    SELECT
        COUNT(DISTINCT client_address),
        COUNT(*),
        COALESCE(AVG(
            (SELECT amount_usdc FROM erc8004_agent_payments ap
             WHERE ap.agent_uuid = p_agent_uuid LIMIT 1)
        ), 0),
        EXTRACT(DAYS FROM (MAX(created_at) - MIN(created_at)))
    INTO v_unique_counterparties, v_total_transactions, v_avg_transaction_amount, v_time_span_days
    FROM erc8004_reputation
    WHERE agent_uuid = p_agent_uuid;

    v_score := (
        (v_unique_counterparties::NUMERIC / NULLIF(v_total_transactions, 0) * 40) +
        (LEAST(v_time_span_days / 365.0, 1.0) * 30) +
        (LEAST(v_avg_transaction_amount / 100.0, 1.0) * 30)
    );

    RETURN COALESCE(v_score, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Enhanced trust calculation with game theory
DROP VIEW IF EXISTS v_erc8004_agent_stats;
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
    COALESCE(
        (SELECT COUNT(*) FROM erc8004_reputation rep
         WHERE rep.agent_uuid = a.id
         AND rep.tag1 = 'payment_cycle'),
        0
    ) as cycle_violations,
    COALESCE(s.staked_amount_usdc, 0) as staked_amount,
    COALESCE(s.slashed_amount_usdc, 0) as slashed_amount,
    COALESCE(s.stake_tier, 'none') as stake_tier,
    COALESCE(
        (SELECT SUM(reward_points) FROM erc8004_cooperation_rewards cr
         WHERE cr.agent_uuid = a.id),
        0
    ) as cooperation_score,
    calculate_sybil_resistance_score(a.id) as sybil_resistance_score,
    CASE
        WHEN EXISTS(
            SELECT 1 FROM erc8004_reputation rep
            WHERE rep.agent_uuid = a.id
            AND rep.tag1 = 'payment_cycle'
        ) THEN 'untrusted'
        WHEN calculate_sybil_resistance_score(a.id) < 20 THEN 'sybil_risk'
        WHEN p.success_rate >= 95 AND r.average_score >= 80 AND p.total_payments >= 10 AND COALESCE(s.stake_tier, 'none') IN ('gold', 'platinum') THEN 'excellent'
        WHEN p.success_rate >= 85 AND r.average_score >= 70 AND p.total_payments >= 5 THEN 'good'
        WHEN p.success_rate >= 75 AND r.average_score >= 60 THEN 'fair'
        WHEN p.total_payments = 0 AND r.total_feedback = 0 THEN 'new'
        ELSE 'poor'
    END as trust_level
FROM erc8004_agents a
LEFT JOIN mv_erc8004_agent_reputation r ON a.id = r.agent_uuid
LEFT JOIN mv_erc8004_agent_payment_stats p ON a.id = p.agent_uuid
LEFT JOIN erc8004_agent_stakes s ON a.id = s.agent_uuid;

-- Table comments for documentation
COMMENT ON TABLE erc8004_agents IS 'ERC-8004 agent identity registry (ERC-721 NFTs)';
COMMENT ON TABLE erc8004_reputation IS 'Agent reputation feedback following ERC-8004 standard';
COMMENT ON TABLE erc8004_validations IS 'Independent validation records for agents';
COMMENT ON TABLE erc8004_agent_payments IS 'Links x402 payments to agent identities for reputation building';
COMMENT ON TABLE erc8004_payment_chains IS 'Tracks payment forwarding chains to detect circular dependencies';
COMMENT ON TABLE erc8004_agent_stakes IS 'Stake-weighted penalties for Nash equilibrium enforcement';
COMMENT ON TABLE erc8004_cooperation_rewards IS 'Cooperation rewards for honest forwarding and network contribution';
COMMENT ON TABLE erc8004_reputation_history IS 'Time-series reputation tracking for decay and recovery analysis';
COMMENT ON VIEW v_erc8004_agent_stats IS 'Real-time combined agent reputation and payment statistics with game theory metrics';
COMMENT ON MATERIALIZED VIEW mv_erc8004_agent_reputation IS 'Materialized reputation metrics for performance';
COMMENT ON MATERIALIZED VIEW mv_erc8004_agent_payment_stats IS 'Materialized payment statistics for performance';

-- Grant appropriate permissions (adjust for your user)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO api_user;
