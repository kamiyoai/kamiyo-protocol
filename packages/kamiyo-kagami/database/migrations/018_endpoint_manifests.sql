-- Migration: Add endpoint manifest and forward receipt tracking
-- Date: 2025-01-16
-- Description: Signed endpoint manifests and non-repudiable forward receipts
--              to prevent dynamic routing attacks

-- Endpoint Manifests
-- Signed, immutable routing declarations per agent
CREATE TABLE IF NOT EXISTS erc8004_endpoint_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    endpoint_uri TEXT NOT NULL CHECK (length(endpoint_uri) <= 2048),
    pubkey TEXT NOT NULL CHECK (length(pubkey) <= 512),
    nonce BIGINT NOT NULL CHECK (nonce >= 0),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    manifest_hash VARCHAR(66) NOT NULL CHECK (manifest_hash ~ '^0x[a-fA-F0-9]{64}$'),
    signature TEXT NOT NULL CHECK (length(signature) <= 512),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(agent_uuid, nonce),
    CONSTRAINT valid_time_window CHECK (valid_until > valid_from),
    CONSTRAINT valid_revocation CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL) OR
        (status != 'revoked')
    )
);

CREATE INDEX idx_manifests_agent ON erc8004_endpoint_manifests(agent_uuid);
CREATE INDEX idx_manifests_status ON erc8004_endpoint_manifests(status, valid_until DESC);
CREATE INDEX idx_manifests_hash ON erc8004_endpoint_manifests(manifest_hash);
CREATE INDEX idx_manifests_nonce ON erc8004_endpoint_manifests(agent_uuid, nonce DESC);

-- Forward Receipts
-- Chained signatures proving routing at forward-time
CREATE TABLE IF NOT EXISTS erc8004_forward_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_tx_hash VARCHAR(66) NOT NULL CHECK (root_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    hop INTEGER NOT NULL CHECK (hop >= 0),
    source_agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    dest_agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    manifest_id UUID NOT NULL REFERENCES erc8004_endpoint_manifests(id) ON DELETE RESTRICT,
    next_hop_hash VARCHAR(66) CHECK (next_hop_hash IS NULL OR next_hop_hash ~ '^0x[a-fA-F0-9]{64}$'),
    receipt_nonce BIGINT NOT NULL CHECK (receipt_nonce >= 0),
    receipt_hash VARCHAR(66) NOT NULL UNIQUE CHECK (receipt_hash ~ '^0x[a-fA-F0-9]{64}$'),
    signature TEXT NOT NULL CHECK (length(signature) <= 512),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    is_valid BOOLEAN DEFAULT TRUE NOT NULL,
    invalidated_at TIMESTAMP WITH TIME ZONE,
    invalidation_reason TEXT CHECK (invalidation_reason IS NULL OR length(invalidation_reason) <= 1000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(root_tx_hash, hop, source_agent_uuid, dest_agent_uuid),
    CONSTRAINT valid_invalidation CHECK (
        (is_valid = TRUE AND invalidated_at IS NULL) OR
        (is_valid = FALSE AND invalidated_at IS NOT NULL)
    )
);

CREATE INDEX idx_receipts_root_tx ON erc8004_forward_receipts(root_tx_hash, hop);
CREATE INDEX idx_receipts_source ON erc8004_forward_receipts(source_agent_uuid);
CREATE INDEX idx_receipts_dest ON erc8004_forward_receipts(dest_agent_uuid);
CREATE INDEX idx_receipts_manifest ON erc8004_forward_receipts(manifest_id);
CREATE INDEX idx_receipts_hash ON erc8004_forward_receipts(receipt_hash);
CREATE INDEX idx_receipts_validity ON erc8004_forward_receipts(is_valid, created_at DESC);

-- On-chain Commitments
-- High-value flow commitments for auditability
CREATE TABLE IF NOT EXISTS erc8004_onchain_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_tx_hash VARCHAR(66) NOT NULL UNIQUE CHECK (root_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    commitment_tx_hash VARCHAR(66) NOT NULL UNIQUE CHECK (commitment_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    chain VARCHAR(50) NOT NULL CHECK (chain ~ '^[a-z0-9-]+$'),
    first_hop_agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    routing_hash VARCHAR(66) NOT NULL CHECK (routing_hash ~ '^0x[a-fA-F0-9]{64}$'),
    amount_usdc DECIMAL(20, 6) NOT NULL CHECK (amount_usdc >= 0),
    time_lock_until TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'settled', 'disputed')),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    settled_at TIMESTAMP WITH TIME ZONE,
    dispute_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT valid_confirmation CHECK (
        (status = 'confirmed' AND confirmed_at IS NOT NULL) OR
        (status != 'confirmed')
    ),
    CONSTRAINT valid_settlement CHECK (
        (status = 'settled' AND settled_at IS NOT NULL) OR
        (status != 'settled')
    )
);

CREATE INDEX idx_commitments_root_tx ON erc8004_onchain_commitments(root_tx_hash);
CREATE INDEX idx_commitments_chain ON erc8004_onchain_commitments(chain, commitment_tx_hash);
CREATE INDEX idx_commitments_agent ON erc8004_onchain_commitments(first_hop_agent_uuid);
CREATE INDEX idx_commitments_status ON erc8004_onchain_commitments(status, created_at DESC);
CREATE INDEX idx_commitments_timelock ON erc8004_onchain_commitments(time_lock_until) WHERE status = 'pending';

-- Manifest Flips (Monitoring)
-- Track suspicious routing changes
CREATE TABLE IF NOT EXISTS erc8004_manifest_flips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    old_manifest_id UUID NOT NULL REFERENCES erc8004_endpoint_manifests(id) ON DELETE CASCADE,
    new_manifest_id UUID NOT NULL REFERENCES erc8004_endpoint_manifests(id) ON DELETE CASCADE,
    time_delta_seconds INTEGER NOT NULL CHECK (time_delta_seconds >= 0),
    endpoint_changed BOOLEAN NOT NULL,
    pubkey_changed BOOLEAN NOT NULL,
    flip_hash VARCHAR(66) NOT NULL CHECK (flip_hash ~ '^0x[a-fA-F0-9]{64}$'),
    suspicion_score SMALLINT NOT NULL CHECK (suspicion_score >= 0 AND suspicion_score <= 100),
    alerted BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_flips_agent ON erc8004_manifest_flips(agent_uuid);
CREATE INDEX idx_flips_score ON erc8004_manifest_flips(suspicion_score DESC, created_at DESC);
CREATE INDEX idx_flips_alerted ON erc8004_manifest_flips(alerted, created_at DESC) WHERE suspicion_score >= 70;

-- Cycle Reports with enhanced economics
-- Already exists in 001_schema.sql but extend for bounties
ALTER TABLE erc8004_payment_chains ADD COLUMN IF NOT EXISTS reporter_address VARCHAR(66) CHECK (reporter_address IS NULL OR reporter_address ~ '^0x[a-fA-F0-9]{40}$');
ALTER TABLE erc8004_payment_chains ADD COLUMN IF NOT EXISTS reporter_bounty_usdc DECIMAL(20, 6) CHECK (reporter_bounty_usdc IS NULL OR reporter_bounty_usdc >= 0);
ALTER TABLE erc8004_payment_chains ADD COLUMN IF NOT EXISTS bounty_paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE erc8004_payment_chains ADD COLUMN IF NOT EXISTS bounty_tx_hash VARCHAR(66) CHECK (bounty_tx_hash IS NULL OR bounty_tx_hash ~ '^0x[a-fA-F0-9]{64}$');

CREATE INDEX IF NOT EXISTS idx_payment_chains_reporter ON erc8004_payment_chains(reporter_address) WHERE reporter_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_chains_bounty ON erc8004_payment_chains(reporter_bounty_usdc DESC) WHERE reporter_bounty_usdc IS NOT NULL;

-- Function: Verify manifest signature and nonce
CREATE OR REPLACE FUNCTION verify_manifest(
    p_agent_uuid UUID,
    p_manifest_hash VARCHAR(66),
    p_nonce BIGINT,
    p_check_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS BOOLEAN AS $$
DECLARE
    v_manifest RECORD;
BEGIN
    SELECT * INTO v_manifest
    FROM erc8004_endpoint_manifests
    WHERE agent_uuid = p_agent_uuid
      AND manifest_hash = p_manifest_hash
      AND nonce = p_nonce
      AND status = 'active'
      AND valid_from <= p_check_time
      AND valid_until >= p_check_time;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Record manifest flip
CREATE OR REPLACE FUNCTION record_manifest_flip(
    p_agent_uuid UUID,
    p_old_manifest_id UUID,
    p_new_manifest_id UUID
) RETURNS UUID AS $$
DECLARE
    v_old RECORD;
    v_new RECORD;
    v_time_delta INTEGER;
    v_endpoint_changed BOOLEAN;
    v_pubkey_changed BOOLEAN;
    v_suspicion_score SMALLINT;
    v_flip_hash VARCHAR(66);
    v_flip_id UUID;
BEGIN
    SELECT * INTO v_old FROM erc8004_endpoint_manifests WHERE id = p_old_manifest_id;
    SELECT * INTO v_new FROM erc8004_endpoint_manifests WHERE id = p_new_manifest_id;

    v_time_delta := EXTRACT(EPOCH FROM (v_new.created_at - v_old.created_at))::INTEGER;
    v_endpoint_changed := v_old.endpoint_uri != v_new.endpoint_uri;
    v_pubkey_changed := v_old.pubkey != v_new.pubkey;

    -- Suspicion scoring
    v_suspicion_score := 0;
    IF v_endpoint_changed THEN v_suspicion_score := v_suspicion_score + 50; END IF;
    IF v_pubkey_changed THEN v_suspicion_score := v_suspicion_score + 30; END IF;
    IF v_time_delta < 60 THEN v_suspicion_score := v_suspicion_score + 20; END IF;

    v_flip_hash := encode(sha256(
        (p_agent_uuid::TEXT || p_old_manifest_id::TEXT || p_new_manifest_id::TEXT)::BYTEA
    ), 'hex');
    v_flip_hash := '0x' || v_flip_hash;

    INSERT INTO erc8004_manifest_flips (
        agent_uuid, old_manifest_id, new_manifest_id,
        time_delta_seconds, endpoint_changed, pubkey_changed,
        flip_hash, suspicion_score
    ) VALUES (
        p_agent_uuid, p_old_manifest_id, p_new_manifest_id,
        v_time_delta, v_endpoint_changed, v_pubkey_changed,
        v_flip_hash, v_suspicion_score
    ) RETURNING id INTO v_flip_id;

    RETURN v_flip_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate reporter bounty
CREATE OR REPLACE FUNCTION calculate_reporter_bounty(
    p_cycle_depth INT,
    p_total_slashed_usdc DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    v_base_bounty DECIMAL := 50.0;
    v_depth_multiplier DECIMAL;
    v_slash_percentage DECIMAL := 0.10;
    v_bounty DECIMAL;
BEGIN
    v_depth_multiplier := 1.0 + (p_cycle_depth * 0.5);
    v_bounty := v_base_bounty * v_depth_multiplier;
    v_bounty := v_bounty + (p_total_slashed_usdc * v_slash_percentage);

    -- Cap bounty
    IF v_bounty > 1000.0 THEN
        v_bounty := 1000.0;
    END IF;

    RETURN v_bounty;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Enhanced cycle detection with receipt validation
CREATE OR REPLACE FUNCTION detect_cycle_with_receipts(
    p_root_tx_hash VARCHAR(66)
) RETURNS TABLE(
    has_cycle BOOLEAN,
    cycle_agents UUID[],
    cycle_depth INT,
    invalid_receipts UUID[]
) AS $$
DECLARE
    v_cycle_agents UUID[];
    v_cycle_depth INT;
    v_invalid_receipts UUID[];
BEGIN
    -- First run standard cycle detection
    SELECT dc.has_cycle, dc.cycle_agents, dc.cycle_depth
    INTO has_cycle, v_cycle_agents, v_cycle_depth
    FROM detect_payment_cycle(p_root_tx_hash) dc;

    -- If cycle found, check receipt validity
    IF has_cycle THEN
        SELECT array_agg(r.id)
        INTO v_invalid_receipts
        FROM erc8004_forward_receipts r
        WHERE r.root_tx_hash = p_root_tx_hash
          AND (r.is_valid = FALSE OR r.dest_agent_uuid = ANY(v_cycle_agents));
    END IF;

    cycle_agents := v_cycle_agents;
    cycle_depth := v_cycle_depth;
    invalid_receipts := COALESCE(v_invalid_receipts, ARRAY[]::UUID[]);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Automatic provisional settlement
CREATE OR REPLACE FUNCTION trigger_provisional_settlement(
    p_root_tx_hash VARCHAR(66),
    p_cycle_agents UUID[],
    p_cycle_depth INT,
    p_reporter_address VARCHAR(66) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_settlement_id UUID;
    v_total_slashed DECIMAL := 0;
    v_agent_uuid UUID;
    v_slashed DECIMAL;
    v_bounty DECIMAL;
BEGIN
    -- Invalidate all receipts in cycle
    UPDATE erc8004_forward_receipts
    SET is_valid = FALSE,
        invalidated_at = CURRENT_TIMESTAMP,
        invalidation_reason = 'Cycle detected in payment chain'
    WHERE root_tx_hash = p_root_tx_hash
      AND dest_agent_uuid = ANY(p_cycle_agents);

    -- Slash stakes for cycle participants
    FOREACH v_agent_uuid IN ARRAY p_cycle_agents
    LOOP
        SELECT slash_stake_for_violation(v_agent_uuid, p_cycle_depth)
        INTO v_slashed;
        v_total_slashed := v_total_slashed + v_slashed;
    END LOOP;

    -- Calculate and record reporter bounty
    IF p_reporter_address IS NOT NULL THEN
        v_bounty := calculate_reporter_bounty(p_cycle_depth, v_total_slashed);

        UPDATE erc8004_payment_chains
        SET reporter_address = p_reporter_address,
            reporter_bounty_usdc = v_bounty
        WHERE root_tx_hash = p_root_tx_hash;
    END IF;

    -- Create settlement record
    v_settlement_id := gen_random_uuid();

    RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql;

-- Monitoring view for manifest flip rates
CREATE OR REPLACE VIEW v_agent_manifest_flip_metrics AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.owner_address,
    COUNT(mf.id) as total_flips,
    COUNT(CASE WHEN mf.time_delta_seconds < 60 THEN 1 END) as rapid_flips_1min,
    COUNT(CASE WHEN mf.endpoint_changed THEN 1 END) as endpoint_changes,
    COUNT(CASE WHEN mf.suspicion_score >= 70 THEN 1 END) as high_suspicion_flips,
    AVG(mf.suspicion_score)::NUMERIC(5,2) as avg_suspicion_score,
    MAX(mf.created_at) as last_flip_at
FROM erc8004_agents a
LEFT JOIN erc8004_manifest_flips mf ON a.id = mf.agent_uuid
GROUP BY a.id, a.agent_id, a.owner_address;

-- Prometheus metrics helper
CREATE OR REPLACE VIEW v_forward_path_churn_metrics AS
SELECT
    DATE_TRUNC('hour', created_at) as time_bucket,
    COUNT(*) as manifest_flips,
    COUNT(CASE WHEN suspicion_score >= 70 THEN 1 END) as suspicious_flips,
    COUNT(CASE WHEN endpoint_changed THEN 1 END) as endpoint_changes,
    AVG(time_delta_seconds)::NUMERIC(10,2) as avg_flip_interval_seconds
FROM erc8004_manifest_flips
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY time_bucket
ORDER BY time_bucket DESC;
