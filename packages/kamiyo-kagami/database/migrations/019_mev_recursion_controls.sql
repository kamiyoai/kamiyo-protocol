-- Migration: MEV resistance and multi-agent recursion controls
-- Date: 2025-01-16
-- Description: Hop limits, stake amplification prevention, activation delays,
--              and computational cost bounds for Nash equilibrium under MEV

-- Recursion Controls
ALTER TABLE erc8004_forward_receipts ADD COLUMN IF NOT EXISTS hop_limit_violated BOOLEAN DEFAULT FALSE;
ALTER TABLE erc8004_forward_receipts ADD COLUMN IF NOT EXISTS computational_cost_usdc DECIMAL(10, 6);

-- Add hop limit check constraint
ALTER TABLE erc8004_forward_receipts DROP CONSTRAINT IF EXISTS check_hop_limit;
ALTER TABLE erc8004_forward_receipts ADD CONSTRAINT check_hop_limit CHECK (hop <= 10);

-- MEV Protection
ALTER TABLE erc8004_endpoint_manifests ADD COLUMN IF NOT EXISTS activation_delay_seconds INTEGER DEFAULT 0 CHECK (activation_delay_seconds >= 0);
ALTER TABLE erc8004_endpoint_manifests ADD COLUMN IF NOT EXISTS commit_tx_hash VARCHAR(66) CHECK (commit_tx_hash IS NULL OR commit_tx_hash ~ '^0x[a-fA-F0-9]{64}$');
ALTER TABLE erc8004_endpoint_manifests ADD COLUMN IF NOT EXISTS reveal_block_number BIGINT CHECK (reveal_block_number IS NULL OR reveal_block_number > 0);

-- Stake Tracking Across Recursive Paths
CREATE TABLE IF NOT EXISTS erc8004_stake_utilization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    root_tx_hash VARCHAR(66) NOT NULL CHECK (root_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    stake_amount_usdc DECIMAL(20, 6) NOT NULL CHECK (stake_amount_usdc >= 0),
    utilization_count INTEGER NOT NULL DEFAULT 1 CHECK (utilization_count > 0),
    paths_involved TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(agent_uuid, root_tx_hash)
);

CREATE INDEX idx_stake_util_agent ON erc8004_stake_utilization(agent_uuid);
CREATE INDEX idx_stake_util_root_tx ON erc8004_stake_utilization(root_tx_hash);
CREATE INDEX idx_stake_util_active ON erc8004_stake_utilization(agent_uuid, created_at DESC) WHERE released_at IS NULL;

-- Computational Cost Bounds (per-hop)
CREATE TABLE IF NOT EXISTS erc8004_computational_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('verify', 'sign', 'forward', 'settle')),
    base_cost_usdc DECIMAL(10, 6) NOT NULL CHECK (base_cost_usdc >= 0),
    per_hop_multiplier DECIMAL(5, 3) NOT NULL DEFAULT 1.1 CHECK (per_hop_multiplier >= 1.0),
    max_rational_hops INTEGER NOT NULL DEFAULT 8 CHECK (max_rational_hops > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Initialize default computational costs
INSERT INTO erc8004_computational_costs (operation_type, base_cost_usdc, per_hop_multiplier, max_rational_hops)
VALUES
    ('verify', 0.001, 1.05, 10),
    ('sign', 0.002, 1.1, 10),
    ('forward', 0.005, 1.15, 8),
    ('settle', 0.010, 1.2, 6)
ON CONFLICT DO NOTHING;

-- MEV Attack Detection
CREATE TABLE IF NOT EXISTS erc8004_mev_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_tx_hash VARCHAR(66) NOT NULL CHECK (root_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
    attack_type VARCHAR(50) NOT NULL CHECK (attack_type IN ('frontrun', 'sandwich', 'timebandit', 'extraction_loop')),
    attacker_agent_uuid UUID REFERENCES erc8004_agents(id) ON DELETE SET NULL,
    victim_agent_uuid UUID REFERENCES erc8004_agents(id) ON DELETE SET NULL,
    extracted_value_usdc DECIMAL(20, 6) CHECK (extracted_value_usdc >= 0),
    block_number BIGINT NOT NULL CHECK (block_number > 0),
    tx_index INTEGER NOT NULL CHECK (tx_index >= 0),
    evidence_hash VARCHAR(66) NOT NULL CHECK (evidence_hash ~ '^0x[a-fA-F0-9]{64}$'),
    slashing_applied BOOLEAN DEFAULT FALSE,
    slashed_amount_usdc DECIMAL(20, 6) CHECK (slashed_amount_usdc IS NULL OR slashed_amount_usdc >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_mev_incidents_root_tx ON erc8004_mev_incidents(root_tx_hash);
CREATE INDEX idx_mev_incidents_attacker ON erc8004_mev_incidents(attacker_agent_uuid);
CREATE INDEX idx_mev_incidents_block ON erc8004_mev_incidents(block_number, tx_index);
CREATE INDEX idx_mev_incidents_type ON erc8004_mev_incidents(attack_type, created_at DESC);

-- Function: Check stake amplification across paths
CREATE OR REPLACE FUNCTION check_stake_amplification(
    p_agent_uuid UUID,
    p_root_tx_hash VARCHAR(66),
    p_required_stake_usdc DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
    v_total_stake DECIMAL;
    v_utilized_stake DECIMAL;
    v_available_stake DECIMAL;
BEGIN
    -- Get agent's total stake
    SELECT COALESCE(SUM(amount_usdc), 0)
    INTO v_total_stake
    FROM erc8004_stake_locks
    WHERE agent_uuid = p_agent_uuid
      AND status = 'active'
      AND unlock_time > CURRENT_TIMESTAMP;

    -- Get currently utilized stake for this tx
    SELECT COALESCE(stake_amount_usdc, 0)
    INTO v_utilized_stake
    FROM erc8004_stake_utilization
    WHERE agent_uuid = p_agent_uuid
      AND root_tx_hash = p_root_tx_hash
      AND released_at IS NULL;

    -- Get total utilized across all active paths
    SELECT COALESCE(SUM(stake_amount_usdc), 0)
    INTO v_utilized_stake
    FROM erc8004_stake_utilization
    WHERE agent_uuid = p_agent_uuid
      AND released_at IS NULL;

    v_available_stake := v_total_stake - v_utilized_stake;

    RETURN v_available_stake >= p_required_stake_usdc;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Calculate computational cost for hop depth
CREATE OR REPLACE FUNCTION calculate_computational_cost(
    p_operation_type VARCHAR(50),
    p_hop_depth INTEGER
) RETURNS DECIMAL AS $$
DECLARE
    v_cost_config RECORD;
    v_total_cost DECIMAL;
BEGIN
    SELECT base_cost_usdc, per_hop_multiplier, max_rational_hops
    INTO v_cost_config
    FROM erc8004_computational_costs
    WHERE operation_type = p_operation_type
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown operation type: %', p_operation_type;
    END IF;

    -- Beyond max rational hops, cost becomes prohibitive
    IF p_hop_depth > v_cost_config.max_rational_hops THEN
        RETURN 999999.99;
    END IF;

    -- Exponential cost growth: base * multiplier^hop
    v_total_cost := v_cost_config.base_cost_usdc * (v_cost_config.per_hop_multiplier ^ p_hop_depth);

    RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Detect recursive value extraction (A→B→C→B pattern)
CREATE OR REPLACE FUNCTION detect_extraction_loop(
    p_root_tx_hash VARCHAR(66)
) RETURNS TABLE(
    has_loop BOOLEAN,
    loop_agents UUID[],
    loop_hops INTEGER[],
    extracted_value_usdc DECIMAL
) AS $$
DECLARE
    v_receipts RECORD;
    v_agent_visits JSONB := '{}'::JSONB;
    v_loop_agents UUID[];
    v_loop_hops INTEGER[];
    v_extracted DECIMAL := 0;
BEGIN
    -- Track agent visits with hop numbers
    FOR v_receipts IN
        SELECT dest_agent_uuid, hop
        FROM erc8004_forward_receipts
        WHERE root_tx_hash = p_root_tx_hash
          AND is_valid = TRUE
        ORDER BY hop ASC
    LOOP
        -- Check if agent already visited
        IF v_agent_visits ? v_receipts.dest_agent_uuid::TEXT THEN
            -- Loop detected
            has_loop := TRUE;
            v_loop_agents := ARRAY[v_receipts.dest_agent_uuid];
            v_loop_hops := ARRAY[
                (v_agent_visits->v_receipts.dest_agent_uuid::TEXT)::INTEGER,
                v_receipts.hop
            ];

            -- Estimate extracted value (simplified)
            v_extracted := calculate_computational_cost('forward', v_receipts.hop) * 10;

            loop_agents := v_loop_agents;
            loop_hops := v_loop_hops;
            extracted_value_usdc := v_extracted;

            RETURN NEXT;
            RETURN;
        END IF;

        -- Record visit
        v_agent_visits := jsonb_set(
            v_agent_visits,
            ARRAY[v_receipts.dest_agent_uuid::TEXT],
            to_jsonb(v_receipts.hop)
        );
    END LOOP;

    -- No loop found
    has_loop := FALSE;
    loop_agents := ARRAY[]::UUID[];
    loop_hops := ARRAY[]::INTEGER[];
    extracted_value_usdc := 0;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Enforce activation delay for manifest updates
CREATE OR REPLACE FUNCTION enforce_activation_delay(
    p_agent_uuid UUID,
    p_activation_delay_seconds INTEGER
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_last_manifest_time TIMESTAMP WITH TIME ZONE;
    v_earliest_activation TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get timestamp of last active manifest
    SELECT created_at INTO v_last_manifest_time
    FROM erc8004_endpoint_manifests
    WHERE agent_uuid = p_agent_uuid
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_manifest_time IS NULL THEN
        -- First manifest, can activate immediately
        RETURN CURRENT_TIMESTAMP;
    END IF;

    -- Calculate earliest activation time
    v_earliest_activation := v_last_manifest_time + (p_activation_delay_seconds || ' seconds')::INTERVAL;

    -- Must be at least this time or current time, whichever is later
    IF v_earliest_activation > CURRENT_TIMESTAMP THEN
        RETURN v_earliest_activation;
    ELSE
        RETURN CURRENT_TIMESTAMP;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Record MEV incident
CREATE OR REPLACE FUNCTION record_mev_incident(
    p_root_tx_hash VARCHAR(66),
    p_attack_type VARCHAR(50),
    p_attacker_agent_uuid UUID,
    p_victim_agent_uuid UUID,
    p_extracted_value_usdc DECIMAL,
    p_block_number BIGINT,
    p_tx_index INTEGER,
    p_evidence_hash VARCHAR(66)
) RETURNS UUID AS $$
DECLARE
    v_incident_id UUID;
    v_slash_amount DECIMAL;
BEGIN
    -- Record incident
    INSERT INTO erc8004_mev_incidents (
        root_tx_hash, attack_type, attacker_agent_uuid, victim_agent_uuid,
        extracted_value_usdc, block_number, tx_index, evidence_hash
    ) VALUES (
        p_root_tx_hash, p_attack_type, p_attacker_agent_uuid, p_victim_agent_uuid,
        p_extracted_value_usdc, p_block_number, p_tx_index, p_evidence_hash
    ) RETURNING id INTO v_incident_id;

    -- Apply slashing: 2x extracted value
    IF p_attacker_agent_uuid IS NOT NULL THEN
        v_slash_amount := p_extracted_value_usdc * 2;

        UPDATE erc8004_mev_incidents
        SET slashing_applied = TRUE,
            slashed_amount_usdc = v_slash_amount
        WHERE id = v_incident_id;

        -- Execute slash (calls existing slash function)
        PERFORM slash_stake_for_violation(p_attacker_agent_uuid, 5);
    END IF;

    RETURN v_incident_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Validate hop limit and computational rationality on receipt insert
CREATE OR REPLACE FUNCTION validate_receipt_rationality()
RETURNS TRIGGER AS $$
DECLARE
    v_cost DECIMAL;
    v_max_rational_hops INTEGER;
BEGIN
    -- Check hop limit
    IF NEW.hop > 10 THEN
        NEW.hop_limit_violated := TRUE;
        NEW.is_valid := FALSE;
        NEW.invalidation_reason := 'Hop limit exceeded (max 10)';
        RETURN NEW;
    END IF;

    -- Calculate computational cost
    v_cost := calculate_computational_cost('forward', NEW.hop);
    NEW.computational_cost_usdc := v_cost;

    -- Check if hop is economically rational
    SELECT max_rational_hops INTO v_max_rational_hops
    FROM erc8004_computational_costs
    WHERE operation_type = 'forward'
    LIMIT 1;

    IF NEW.hop > v_max_rational_hops THEN
        -- Mark as potentially irrational but don't invalidate
        -- (agent may have strategic reasons)
        NEW.hop_limit_violated := TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_receipt_rationality
    BEFORE INSERT ON erc8004_forward_receipts
    FOR EACH ROW
    EXECUTE FUNCTION validate_receipt_rationality();

-- Monitoring view: Recursion depth distribution
CREATE OR REPLACE VIEW v_recursion_depth_metrics AS
SELECT
    hop as depth,
    COUNT(*) as receipt_count,
    COUNT(CASE WHEN hop_limit_violated THEN 1 END) as irrational_count,
    AVG(computational_cost_usdc)::NUMERIC(10,6) as avg_cost_usdc,
    MAX(computational_cost_usdc)::NUMERIC(10,6) as max_cost_usdc,
    COUNT(DISTINCT root_tx_hash) as unique_transactions
FROM erc8004_forward_receipts
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY hop
ORDER BY hop ASC;

-- Monitoring view: MEV attack summary
CREATE OR REPLACE VIEW v_mev_attack_summary AS
SELECT
    attack_type,
    COUNT(*) as incident_count,
    SUM(extracted_value_usdc)::NUMERIC(20,2) as total_extracted_usdc,
    SUM(slashed_amount_usdc)::NUMERIC(20,2) as total_slashed_usdc,
    COUNT(DISTINCT attacker_agent_uuid) as unique_attackers,
    COUNT(DISTINCT victim_agent_uuid) as unique_victims,
    AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY attack_type ORDER BY created_at))))::NUMERIC(10,2) as avg_time_between_incidents_seconds
FROM erc8004_mev_incidents
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY attack_type
ORDER BY incident_count DESC;

-- Monitoring view: Stake amplification metrics
CREATE OR REPLACE VIEW v_stake_amplification_metrics AS
SELECT
    su.agent_uuid,
    a.agent_id,
    COUNT(su.id) as active_utilizations,
    SUM(su.stake_amount_usdc)::NUMERIC(20,2) as total_utilized_usdc,
    MAX(su.utilization_count) as max_reuse_count,
    array_agg(DISTINCT su.root_tx_hash) as active_transactions
FROM erc8004_stake_utilization su
JOIN erc8004_agents a ON su.agent_uuid = a.id
WHERE su.released_at IS NULL
GROUP BY su.agent_uuid, a.agent_id
HAVING COUNT(su.id) > 1
ORDER BY COUNT(su.id) DESC;
