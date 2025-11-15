-- Migration: Add ERC-8004 Agent Identity tables
-- Date: 2025-01-13
-- Description: Add tables for ERC-8004 agent identity and reputation system
--              integrated with x402 payment verification

-- Agent Identity Registry
-- Tracks on-chain agent identities (ERC-721 NFTs)
CREATE TABLE IF NOT EXISTS erc8004_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id BIGINT NOT NULL,
    chain VARCHAR(50) NOT NULL,
    registry_address VARCHAR(66) NOT NULL,
    owner_address VARCHAR(66) NOT NULL,
    token_uri TEXT,
    registration_file JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chain, registry_address, agent_id)
);

CREATE INDEX idx_erc8004_agents_owner ON erc8004_agents(owner_address);
CREATE INDEX idx_erc8004_agents_chain ON erc8004_agents(chain);
CREATE INDEX idx_erc8004_agents_status ON erc8004_agents(status);

-- Agent Metadata
-- Key-value metadata storage for agents
CREATE TABLE IF NOT EXISTS erc8004_agent_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_uuid, key)
);

CREATE INDEX idx_erc8004_metadata_agent ON erc8004_agent_metadata(agent_uuid);

-- Agent Reputation Feedback
-- Stores reputation feedback for agents (payment reliability, etc.)
CREATE TABLE IF NOT EXISTS erc8004_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    client_address VARCHAR(66) NOT NULL,
    score SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
    tag1 VARCHAR(64),
    tag2 VARCHAR(64),
    file_uri TEXT,
    file_hash VARCHAR(66),
    feedback_auth BYTEA,
    is_revoked BOOLEAN DEFAULT FALSE,
    chain VARCHAR(50) NOT NULL,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    UNIQUE(agent_uuid, client_address, created_at)
);

CREATE INDEX idx_erc8004_reputation_agent ON erc8004_reputation(agent_uuid);
CREATE INDEX idx_erc8004_reputation_client ON erc8004_reputation(client_address);
CREATE INDEX idx_erc8004_reputation_score ON erc8004_reputation(score);
CREATE INDEX idx_erc8004_reputation_tags ON erc8004_reputation(tag1, tag2);

-- Agent Validation Records
-- Independent validation/verification records
CREATE TABLE IF NOT EXISTS erc8004_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_hash VARCHAR(66) NOT NULL UNIQUE,
    validator_address VARCHAR(66) NOT NULL,
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    response SMALLINT CHECK (response >= 0 AND response <= 100),
    tag VARCHAR(64),
    request_uri TEXT,
    request_hash_value VARCHAR(66),
    response_uri TEXT,
    response_hash VARCHAR(66),
    chain VARCHAR(50) NOT NULL,
    tx_hash VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_erc8004_validations_agent ON erc8004_validations(agent_uuid);
CREATE INDEX idx_erc8004_validations_validator ON erc8004_validations(validator_address);
CREATE INDEX idx_erc8004_validations_status ON erc8004_validations(status);

-- Agent Payment History
-- Links x402 payments to agent identities
CREATE TABLE IF NOT EXISTS erc8004_agent_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES erc8004_agents(id) ON DELETE CASCADE,
    x402_payment_id UUID NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    amount_usdc DECIMAL(20, 6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    endpoint VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_erc8004_agent_payments_agent ON erc8004_agent_payments(agent_uuid);
CREATE INDEX idx_erc8004_agent_payments_tx ON erc8004_agent_payments(tx_hash);
CREATE INDEX idx_erc8004_agent_payments_status ON erc8004_agent_payments(status);

-- Agent Reputation Summary View
-- Real-time reputation metrics per agent
CREATE OR REPLACE VIEW v_erc8004_agent_reputation AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.chain,
    a.owner_address,
    COUNT(r.id) as total_feedback,
    AVG(r.score)::NUMERIC(5,2) as average_score,
    COUNT(CASE WHEN r.score >= 80 THEN 1 END) as positive_feedback,
    COUNT(CASE WHEN r.score < 50 THEN 1 END) as negative_feedback,
    COUNT(CASE WHEN r.is_revoked = true THEN 1 END) as revoked_feedback,
    MAX(r.created_at) as last_feedback_at
FROM erc8004_agents a
LEFT JOIN erc8004_reputation r ON a.id = r.agent_uuid AND r.is_revoked = false
GROUP BY a.id, a.agent_id, a.chain, a.owner_address;

-- Agent Payment Statistics View
-- Payment reliability metrics per agent
CREATE OR REPLACE VIEW v_erc8004_agent_payment_stats AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.owner_address,
    COUNT(ap.id) as total_payments,
    SUM(ap.amount_usdc) as total_amount_usdc,
    COUNT(CASE WHEN ap.status = 'verified' THEN 1 END) as successful_payments,
    COUNT(CASE WHEN ap.status = 'failed' THEN 1 END) as failed_payments,
    AVG(ap.amount_usdc)::NUMERIC(20,6) as avg_payment_amount,
    MAX(ap.created_at) as last_payment_at,
    (COUNT(CASE WHEN ap.status = 'verified' THEN 1 END)::FLOAT /
     NULLIF(COUNT(ap.id), 0) * 100)::NUMERIC(5,2) as success_rate
FROM erc8004_agents a
LEFT JOIN erc8004_agent_payments ap ON a.id = ap.agent_uuid
GROUP BY a.id, a.agent_id, a.owner_address;

-- Combined Agent Stats View
CREATE OR REPLACE VIEW v_erc8004_agent_stats AS
SELECT
    a.id as agent_uuid,
    a.agent_id,
    a.chain,
    a.registry_address,
    a.owner_address,
    a.status,
    a.created_at as registered_at,
    r.total_feedback,
    r.average_score as reputation_score,
    r.positive_feedback,
    r.negative_feedback,
    p.total_payments,
    p.total_amount_usdc,
    p.success_rate as payment_success_rate,
    p.last_payment_at,
    CASE
        WHEN p.success_rate >= 95 AND r.average_score >= 80 THEN 'excellent'
        WHEN p.success_rate >= 85 AND r.average_score >= 70 THEN 'good'
        WHEN p.success_rate >= 75 AND r.average_score >= 60 THEN 'fair'
        ELSE 'poor'
    END as trust_level
FROM erc8004_agents a
LEFT JOIN v_erc8004_agent_reputation r ON a.id = r.agent_uuid
LEFT JOIN v_erc8004_agent_payment_stats p ON a.id = p.agent_uuid;

-- Add agent_id column to x402_payments table
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES erc8004_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_x402_payments_agent ON x402_payments(agent_id);

COMMENT ON TABLE erc8004_agents IS 'ERC-8004 agent identity registry (ERC-721 NFTs)';
COMMENT ON TABLE erc8004_reputation IS 'Agent reputation feedback following ERC-8004 standard';
COMMENT ON TABLE erc8004_validations IS 'Independent validation records for agents';
COMMENT ON TABLE erc8004_agent_payments IS 'Links x402 payments to agent identities';
COMMENT ON VIEW v_erc8004_agent_stats IS 'Combined agent reputation and payment statistics';
