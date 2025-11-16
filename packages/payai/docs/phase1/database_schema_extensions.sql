-- ============================================================================
-- KAMIYO "Invisible Harmony" Database Schema Extensions
-- ============================================================================
-- Migration: 003_harmony_features
-- Purpose: Add tables for AI agent alignment features
-- Author: KAMIYO Team
-- Date: 2025-10-28
-- Version: 1.0
--
-- Dependencies:
--   - 002_x402_payments (existing x402 payment tables)
--
-- Features Covered:
--   1. Auto-Negotiation Escrows
--   2. Cross-Chain Harmony Bridges
--   3. Silent Verifier Oracles
--   4. Balance Whisperers (Shadow Balances)
--   5. Harmony Analytics (cache tables)
--   6. KAMIYO Token Staking
-- ============================================================================

-- ============================================================================
-- FEATURE 1: AUTO-NEGOTIATION ESCROWS
-- ============================================================================

-- Main escrow records table
CREATE TABLE IF NOT EXISTS harmony_escrows (
    id SERIAL PRIMARY KEY,

    -- Escrow identification
    escrow_address VARCHAR(255) UNIQUE NOT NULL,  -- On-chain contract address
    chain VARCHAR(50) NOT NULL,  -- 'base', 'ethereum', 'solana'

    -- Parties
    buyer_address VARCHAR(255) NOT NULL,
    seller_address VARCHAR(255),  -- NULL until accepted

    -- Payment details
    amount_usdc DECIMAL(18, 6) NOT NULL,
    payment_tx_hash VARCHAR(255),  -- Initial deposit transaction

    -- Terms & conditions
    terms_hash VARCHAR(64) NOT NULL,  -- SHA256 of terms JSON
    terms_json JSONB NOT NULL,
    /* Example terms_json:
    {
      "title": "Generate 10 exploit intelligence reports",
      "description": "Detailed analysis of recent DeFi exploits...",
      "deliverables": ["10 markdown reports", "Transaction graphs"],
      "delivery_deadline": "2025-11-04T23:59:59Z",
      "quality_threshold": 80
    }
    */

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status values: 'pending', 'accepted', 'submitted', 'disputed', 'released', 'refunded', 'expired'

    -- Deliverable submission
    deliverable_url TEXT,  -- IPFS/Arweave URL
    deliverable_hash VARCHAR(64),  -- SHA256 for integrity
    submission_time TIMESTAMP,

    -- Verification (links to Feature 3)
    verification_id INTEGER,  -- Foreign key to harmony_verifications
    quality_score INTEGER,  -- 0-100 from AI verifier

    -- Dispute resolution
    dispute_reason TEXT,
    dispute_initiated_by VARCHAR(255),  -- Address who initiated dispute
    dispute_resolved_by VARCHAR(50),  -- 'buyer', 'seller', 'arbitrator', 'timeout'
    arbitrator_notes TEXT,

    -- Deadlines
    acceptance_deadline TIMESTAMP,  -- Seller must accept by this time
    delivery_deadline TIMESTAMP,  -- Work must be submitted by this time
    review_deadline TIMESTAMP,  -- Buyer must review by this time

    -- KAMIYO staking benefits (priority queue)
    buyer_kamiyo_staked DECIMAL(18, 6) DEFAULT 0,
    seller_kamiyo_staked DECIMAL(18, 6) DEFAULT 0,
    priority_score INTEGER DEFAULT 0,  -- Calculated from stakes

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_escrow_status CHECK (status IN (
        'pending', 'accepted', 'submitted', 'disputed', 'released', 'refunded', 'expired'
    )),
    CONSTRAINT chk_quality_score CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
    CONSTRAINT chk_amount_positive CHECK (amount_usdc > 0)
);

-- Negotiation messages between buyer and seller
CREATE TABLE IF NOT EXISTS escrow_negotiations (
    id SERIAL PRIMARY KEY,
    escrow_id INTEGER NOT NULL,

    -- Message details
    sender_address VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL,  -- 'proposal', 'counter_proposal', 'question', 'clarification'
    message_content TEXT NOT NULL,

    -- Negotiation state
    proposed_terms_json JSONB,  -- Modified terms if counter-proposal
    is_accepted BOOLEAN DEFAULT FALSE,

    -- AI assistance
    ai_suggested_response TEXT,  -- Claude's suggested counter-offer

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_escrow_negotiation FOREIGN KEY (escrow_id)
        REFERENCES harmony_escrows(id) ON DELETE CASCADE,
    CONSTRAINT chk_negotiation_message_type CHECK (message_type IN (
        'proposal', 'counter_proposal', 'question', 'clarification', 'acceptance', 'rejection'
    ))
);

-- Indexes for escrows
CREATE INDEX IF NOT EXISTS idx_escrows_status ON harmony_escrows(status);
CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON harmony_escrows(buyer_address);
CREATE INDEX IF NOT EXISTS idx_escrows_seller ON harmony_escrows(seller_address);
CREATE INDEX IF NOT EXISTS idx_escrows_chain ON harmony_escrows(chain);
CREATE INDEX IF NOT EXISTS idx_escrows_priority ON harmony_escrows(priority_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrows_deadlines ON harmony_escrows(delivery_deadline, review_deadline);
CREATE INDEX IF NOT EXISTS idx_escrows_address ON harmony_escrows(escrow_address);

-- Indexes for negotiations
CREATE INDEX IF NOT EXISTS idx_negotiations_escrow ON escrow_negotiations(escrow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_negotiations_sender ON escrow_negotiations(sender_address);


-- ============================================================================
-- FEATURE 2: CROSS-CHAIN HARMONY BRIDGES
-- ============================================================================

-- Bridge transfer records
CREATE TABLE IF NOT EXISTS harmony_bridges (
    id SERIAL PRIMARY KEY,

    -- Bridge identification
    bridge_id VARCHAR(64) UNIQUE NOT NULL,  -- Unique bridge transaction ID
    wormhole_vaa_hash VARCHAR(128),  -- Wormhole Verified Action Approval hash

    -- Source chain details
    source_chain VARCHAR(50) NOT NULL,
    source_address VARCHAR(255) NOT NULL,
    source_tx_hash VARCHAR(255) NOT NULL,
    source_amount_usdc DECIMAL(18, 6) NOT NULL,

    -- Destination chain details
    destination_chain VARCHAR(50) NOT NULL,
    destination_address VARCHAR(255) NOT NULL,
    destination_tx_hash VARCHAR(255),  -- NULL until completed
    destination_amount_usdc DECIMAL(18, 6),  -- After fees

    -- Fee breakdown
    bridge_fee_usdc DECIMAL(18, 6),  -- Wormhole relay fee
    kamiyo_fee_usdc DECIMAL(18, 6),  -- KAMIYO platform fee (0.5%)
    gas_fee_usdc DECIMAL(18, 6),  -- Estimated gas cost
    total_fees_usdc DECIMAL(18, 6),

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status values: 'pending', 'locked', 'bridging', 'completed', 'failed', 'refunded'
    failure_reason TEXT,

    -- Timing
    estimated_completion_time TIMESTAMP,
    actual_completion_time TIMESTAMP,

    -- KAMIYO benefits
    kamiyo_discount_applied BOOLEAN DEFAULT FALSE,
    kamiyo_discount_amount DECIMAL(18, 6) DEFAULT 0,

    -- Priority routing (higher = faster)
    priority_level INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_bridge_status CHECK (status IN (
        'pending', 'locked', 'bridging', 'completed', 'failed', 'refunded'
    )),
    CONSTRAINT chk_bridge_chains_different CHECK (source_chain != destination_chain),
    CONSTRAINT chk_bridge_amount_positive CHECK (source_amount_usdc > 0)
);

-- Pre-computed optimal routes for common chain pairs
CREATE TABLE IF NOT EXISTS bridge_routes (
    id SERIAL PRIMARY KEY,

    source_chain VARCHAR(50) NOT NULL,
    destination_chain VARCHAR(50) NOT NULL,

    -- Route efficiency
    average_time_seconds INTEGER NOT NULL,  -- Historical average
    success_rate DECIMAL(5, 2) NOT NULL,  -- Percentage (0-100)

    -- Fee structure
    base_fee_percentage DECIMAL(5, 4) NOT NULL,  -- e.g., 0.0150 = 1.5%
    min_fee_usdc DECIMAL(18, 6) NOT NULL,
    max_fee_usdc DECIMAL(18, 6),

    -- Capacity limits
    min_bridge_amount DECIMAL(18, 6) DEFAULT 1.00,
    max_bridge_amount DECIMAL(18, 6) DEFAULT 100000.00,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(source_chain, destination_chain),
    CONSTRAINT chk_route_success_rate CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- Pre-populate common bridge routes
INSERT INTO bridge_routes (source_chain, destination_chain, average_time_seconds, success_rate, base_fee_percentage, min_fee_usdc)
VALUES
    ('solana', 'base', 120, 99.5, 0.0150, 0.50),
    ('base', 'solana', 150, 99.2, 0.0150, 0.50),
    ('ethereum', 'base', 180, 99.8, 0.0100, 1.00),
    ('base', 'ethereum', 200, 99.7, 0.0100, 1.00),
    ('ethereum', 'solana', 240, 98.5, 0.0200, 2.00),
    ('solana', 'ethereum', 250, 98.3, 0.0200, 2.00)
ON CONFLICT (source_chain, destination_chain) DO NOTHING;

-- Indexes for bridges
CREATE INDEX IF NOT EXISTS idx_bridges_status ON harmony_bridges(status);
CREATE INDEX IF NOT EXISTS idx_bridges_source_address ON harmony_bridges(source_address);
CREATE INDEX IF NOT EXISTS idx_bridges_dest_address ON harmony_bridges(destination_address);
CREATE INDEX IF NOT EXISTS idx_bridges_source_chain ON harmony_bridges(source_chain, source_tx_hash);
CREATE INDEX IF NOT EXISTS idx_bridges_dest_chain ON harmony_bridges(destination_chain);
CREATE INDEX IF NOT EXISTS idx_bridges_wormhole_vaa ON harmony_bridges(wormhole_vaa_hash);
CREATE INDEX IF NOT EXISTS idx_bridges_bridge_id ON harmony_bridges(bridge_id);


-- ============================================================================
-- FEATURE 3: SILENT VERIFIER ORACLES
-- ============================================================================

-- AI verification results
CREATE TABLE IF NOT EXISTS harmony_verifications (
    id SERIAL PRIMARY KEY,

    -- Link to escrow
    escrow_id INTEGER,

    -- Deliverable details
    deliverable_url TEXT NOT NULL,
    deliverable_type VARCHAR(50),  -- 'document', 'code', 'design', 'data'
    deliverable_hash VARCHAR(64),  -- SHA256 for integrity

    -- Verification criteria
    criteria_json JSONB NOT NULL,
    /*
    Example criteria_json:
    {
      "technical_accuracy": {
        "weight": 0.4,
        "description": "Factually correct and technically sound"
      },
      "completeness": {
        "weight": 0.3,
        "description": "All required deliverables included"
      },
      "code_quality": {
        "weight": 0.2,
        "description": "Clean, maintainable, documented code"
      },
      "documentation": {
        "weight": 0.1,
        "description": "Clear README and inline comments"
      }
    }
    */

    -- AI verifier details
    verifier_model VARCHAR(50) NOT NULL,  -- 'claude-3-5-sonnet', 'gpt-4'
    verifier_version VARCHAR(20),

    -- Verification results
    overall_score INTEGER NOT NULL,  -- 0-100
    criteria_scores JSONB,
    /*
    Example criteria_scores:
    {
      "technical_accuracy": {
        "score": 90,
        "reasoning": "Code is factually correct with proper error handling"
      },
      "completeness": {
        "score": 85,
        "reasoning": "All deliverables present, minor formatting issues"
      },
      "code_quality": {
        "score": 80,
        "reasoning": "Well-structured but needs more comments"
      },
      "documentation": {
        "score": 75,
        "reasoning": "Good README, some functions lack docstrings"
      }
    }
    */

    detailed_feedback TEXT,  -- AI-generated detailed feedback
    strengths TEXT[],  -- Array of strength bullet points
    improvements TEXT[],  -- Array of suggested improvements

    -- Verification metadata
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status values: 'pending', 'in_progress', 'completed', 'failed'
    confidence_score DECIMAL(3, 2),  -- 0.00-1.00

    -- Costs
    tokens_used INTEGER,  -- AI tokens consumed
    cost_usdc DECIMAL(10, 6),  -- Cost of verification
    paid_by VARCHAR(50),  -- 'buyer', 'seller', 'kamiyo' (if discounted)

    -- Human override
    human_reviewed BOOLEAN DEFAULT FALSE,
    human_reviewer_address VARCHAR(255),
    human_override_score INTEGER,
    human_override_reason TEXT,

    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    processing_time_seconds INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_verification_escrow FOREIGN KEY (escrow_id)
        REFERENCES harmony_escrows(id) ON DELETE CASCADE,
    CONSTRAINT chk_verification_status CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed'
    )),
    CONSTRAINT chk_verification_score CHECK (overall_score >= 0 AND overall_score <= 100),
    CONSTRAINT chk_verification_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    CONSTRAINT chk_human_override_score CHECK (human_override_score IS NULL OR (human_override_score >= 0 AND human_override_score <= 100))
);

-- Add foreign key constraint to escrows (circular reference, added after both tables exist)
ALTER TABLE harmony_escrows
    DROP CONSTRAINT IF EXISTS fk_escrow_verification;

ALTER TABLE harmony_escrows
    ADD CONSTRAINT fk_escrow_verification
    FOREIGN KEY (verification_id) REFERENCES harmony_verifications(id) ON DELETE SET NULL;

-- Pre-defined verification templates
CREATE TABLE IF NOT EXISTS verifier_templates (
    id SERIAL PRIMARY KEY,

    template_name VARCHAR(100) UNIQUE NOT NULL,
    deliverable_type VARCHAR(50) NOT NULL,

    -- Template details
    description TEXT,
    criteria_json JSONB NOT NULL,
    example_prompts TEXT[],

    -- Usage stats
    times_used INTEGER DEFAULT 0,
    average_score DECIMAL(5, 2),

    -- Access control
    is_public BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-populate common templates
INSERT INTO verifier_templates (template_name, deliverable_type, description, criteria_json, is_public)
VALUES
    (
        'code_quality',
        'code',
        'Evaluate code quality, style, and documentation',
        '{"readability": {"weight": 0.3, "description": "Code is easy to read and understand"}, "efficiency": {"weight": 0.25, "description": "Optimal algorithms and performance"}, "documentation": {"weight": 0.25, "description": "Comprehensive comments and README"}, "testing": {"weight": 0.2, "description": "Unit tests with good coverage"}}'::JSONB,
        TRUE
    ),
    (
        'technical_report',
        'document',
        'Assess technical accuracy and completeness of reports',
        '{"accuracy": {"weight": 0.4, "description": "Factually correct information"}, "depth": {"weight": 0.3, "description": "Comprehensive analysis with details"}, "clarity": {"weight": 0.2, "description": "Clear and well-structured writing"}, "sources": {"weight": 0.1, "description": "Proper citations and references"}}'::JSONB,
        TRUE
    ),
    (
        'design_assets',
        'design',
        'Review design quality and adherence to brand guidelines',
        '{"aesthetic": {"weight": 0.3, "description": "Visually appealing design"}, "usability": {"weight": 0.3, "description": "User-friendly and intuitive"}, "brand_compliance": {"weight": 0.2, "description": "Follows brand guidelines"}, "file_quality": {"weight": 0.2, "description": "High-quality, production-ready files"}}'::JSONB,
        TRUE
    )
ON CONFLICT (template_name) DO NOTHING;

-- Indexes for verifications
CREATE INDEX IF NOT EXISTS idx_verifications_escrow ON harmony_verifications(escrow_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON harmony_verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_score ON harmony_verifications(overall_score);
CREATE INDEX IF NOT EXISTS idx_verifications_model ON harmony_verifications(verifier_model);
CREATE INDEX IF NOT EXISTS idx_verifications_created ON harmony_verifications(created_at DESC);


-- ============================================================================
-- FEATURE 4: BALANCE WHISPERERS (SHADOW BALANCES)
-- ============================================================================
-- Note: Redis is primary storage for real-time balances
-- PostgreSQL stores historical records for auditing and settlement

-- Shadow balance deposits (funding)
CREATE TABLE IF NOT EXISTS shadow_deposits (
    id SERIAL PRIMARY KEY,

    -- User identification
    wallet_address VARCHAR(255) NOT NULL,

    -- Deposit details
    chain VARCHAR(50) NOT NULL,
    deposit_tx_hash VARCHAR(255) UNIQUE NOT NULL,
    amount_usdc DECIMAL(18, 6) NOT NULL,

    -- Shadow balance state
    previous_balance DECIMAL(18, 6) DEFAULT 0,
    new_balance DECIMAL(18, 6) NOT NULL,

    -- Verification
    confirmations INTEGER NOT NULL,
    verified_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_deposit_amount_positive CHECK (amount_usdc > 0)
);

-- Shadow balance settlements (withdrawals)
CREATE TABLE IF NOT EXISTS shadow_settlements (
    id SERIAL PRIMARY KEY,

    -- User identification
    wallet_address VARCHAR(255) NOT NULL,

    -- Settlement details
    settlement_type VARCHAR(50) NOT NULL,
    -- Types: 'withdrawal', 'auto_threshold', 'force_settle', 'dispute_refund'
    shadow_balance_before DECIMAL(18, 6) NOT NULL,
    settlement_amount DECIMAL(18, 6) NOT NULL,
    shadow_balance_after DECIMAL(18, 6) NOT NULL,

    -- On-chain execution
    chain VARCHAR(50) NOT NULL,
    settlement_tx_hash VARCHAR(255) UNIQUE NOT NULL,
    gas_fee_usdc DECIMAL(18, 6),

    -- Batch settlement (if grouped)
    batch_id VARCHAR(64),  -- NULL if individual settlement
    included_transactions INTEGER,  -- Count if batch

    -- Timing
    initiated_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    processing_time_seconds INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_settlement_type CHECK (settlement_type IN (
        'withdrawal', 'auto_threshold', 'force_settle', 'dispute_refund'
    )),
    CONSTRAINT chk_settlement_amount_positive CHECK (settlement_amount > 0)
);

-- Shadow balance transaction history (audit log)
CREATE TABLE IF NOT EXISTS shadow_transactions (
    id SERIAL PRIMARY KEY,

    -- User identification
    wallet_address VARCHAR(255) NOT NULL,

    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL,
    -- Types: 'deposit', 'debit', 'credit', 'withdrawal', 'settlement'
    amount_usdc DECIMAL(18, 6) NOT NULL,

    -- Balance state
    balance_before DECIMAL(18, 6) NOT NULL,
    balance_after DECIMAL(18, 6) NOT NULL,

    -- Associated records
    related_tx_hash VARCHAR(255),  -- On-chain tx if applicable
    related_escrow_id INTEGER,  -- If related to escrow
    related_payment_id INTEGER,  -- If related to x402 payment
    related_bridge_id INTEGER,  -- If related to bridge

    -- Metadata
    description TEXT,
    reference_id VARCHAR(255),  -- External reference (escrow ID, bridge ID, etc.)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_shadow_tx_type CHECK (transaction_type IN (
        'deposit', 'debit', 'credit', 'withdrawal', 'settlement', 'refund'
    ))
);

-- Indexes for shadow balance tables
CREATE INDEX IF NOT EXISTS idx_deposits_wallet ON shadow_deposits(wallet_address);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON shadow_deposits(deposit_tx_hash);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON shadow_deposits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlements_wallet ON shadow_settlements(wallet_address);
CREATE INDEX IF NOT EXISTS idx_settlements_type ON shadow_settlements(settlement_type);
CREATE INDEX IF NOT EXISTS idx_settlements_batch ON shadow_settlements(batch_id);
CREATE INDEX IF NOT EXISTS idx_settlements_tx_hash ON shadow_settlements(settlement_tx_hash);
CREATE INDEX IF NOT EXISTS idx_settlements_created ON shadow_settlements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_txs_wallet ON shadow_transactions(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_txs_type ON shadow_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_shadow_txs_reference ON shadow_transactions(reference_id);


-- ============================================================================
-- FEATURE 5: HARMONY ANALYTICS
-- ============================================================================

-- Analytics cache table (for expensive aggregate queries)
CREATE TABLE IF NOT EXISTS harmony_analytics_cache (
    id SERIAL PRIMARY KEY,

    -- Cache key
    metric_type VARCHAR(100) NOT NULL,
    -- Types: 'escrow_success_rate', 'bridge_avg_time', 'verifier_accuracy', 'shadow_utilization'
    metric_scope VARCHAR(50) NOT NULL,  -- 'global', 'user', 'chain', 'daily'
    scope_value VARCHAR(255),  -- User address, chain name, or date

    -- Cached data
    metric_data JSONB NOT NULL,

    -- Cache metadata
    last_updated TIMESTAMP NOT NULL,
    ttl_seconds INTEGER DEFAULT 3600,  -- 1 hour

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(metric_type, metric_scope, scope_value)
);

-- Aggregated analytics by hour (for long-term trend analysis)
CREATE TABLE IF NOT EXISTS harmony_analytics_hourly (
    id SERIAL PRIMARY KEY,

    hour_bucket TIMESTAMP NOT NULL,
    chain VARCHAR(50),

    -- Escrow metrics
    escrows_created INTEGER DEFAULT 0,
    escrows_completed INTEGER DEFAULT 0,
    escrows_disputed INTEGER DEFAULT 0,
    escrow_volume_usdc DECIMAL(18, 6) DEFAULT 0,

    -- Bridge metrics
    bridges_completed INTEGER DEFAULT 0,
    bridge_volume_usdc DECIMAL(18, 6) DEFAULT 0,
    bridge_fees_collected_usdc DECIMAL(18, 6) DEFAULT 0,

    -- Verifier metrics
    verifications_completed INTEGER DEFAULT 0,
    verifications_cost_usdc DECIMAL(18, 6) DEFAULT 0,
    avg_verification_score DECIMAL(5, 2),

    -- Shadow balance metrics
    shadow_deposits INTEGER DEFAULT 0,
    shadow_settlements INTEGER DEFAULT 0,
    shadow_volume_usdc DECIMAL(18, 6) DEFAULT 0,

    -- Network metrics
    unique_users INTEGER DEFAULT 0,
    total_fees_collected_usdc DECIMAL(18, 6) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(hour_bucket, chain)
);

-- Indexes for analytics tables
CREATE INDEX IF NOT EXISTS idx_analytics_cache_lookup ON harmony_analytics_cache(metric_type, metric_scope, scope_value);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expiry ON harmony_analytics_cache(last_updated);

CREATE INDEX IF NOT EXISTS idx_analytics_hourly_bucket ON harmony_analytics_hourly(hour_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_hourly_chain ON harmony_analytics_hourly(chain);


-- ============================================================================
-- FEATURE 6: KAMIYO TOKEN STAKING
-- ============================================================================

-- KAMIYO token stakes for premium benefits
CREATE TABLE IF NOT EXISTS kamiyo_stakes (
    id SERIAL PRIMARY KEY,

    -- User identification
    wallet_address VARCHAR(255) NOT NULL,

    -- Staking details
    amount_kamiyo DECIMAL(18, 6) NOT NULL,
    stake_tx_hash VARCHAR(255) UNIQUE NOT NULL,
    chain VARCHAR(50) NOT NULL,

    -- Lock period
    lock_duration_days INTEGER DEFAULT 0,  -- 0 = flexible, 30/90/365 = locked
    locked_until TIMESTAMP,

    -- Tier calculation
    current_tier VARCHAR(50),  -- 'bronze', 'silver', 'gold', 'platinum'
    /*
    Tiers:
    - Bronze: 1,000 KAMIYO
    - Silver: 5,000 KAMIYO
    - Gold: 10,000 KAMIYO
    - Platinum: 50,000 KAMIYO
    */

    -- Rewards
    rewards_earned_kamiyo DECIMAL(18, 6) DEFAULT 0,
    last_reward_claim TIMESTAMP,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    -- Status values: 'active', 'unstaking', 'unstaked'
    unstake_initiated_at TIMESTAMP,
    unstake_tx_hash VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_stake_amount_positive CHECK (amount_kamiyo > 0),
    CONSTRAINT chk_stake_status CHECK (status IN ('active', 'unstaking', 'unstaked')),
    CONSTRAINT chk_stake_tier CHECK (current_tier IN ('bronze', 'silver', 'gold', 'platinum'))
);

-- KAMIYO staking benefits usage tracking
CREATE TABLE IF NOT EXISTS kamiyo_benefits_usage (
    id SERIAL PRIMARY KEY,

    -- User identification
    wallet_address VARCHAR(255) NOT NULL,
    stake_id INTEGER NOT NULL,

    -- Benefit details
    benefit_type VARCHAR(50) NOT NULL,
    -- Types: 'escrow_priority', 'bridge_discount', 'verifier_discount', 'analytics_access'
    discount_amount_usdc DECIMAL(18, 6),
    feature_used VARCHAR(50),  -- 'escrow', 'bridge', 'verifier', 'analytics'

    -- References
    related_escrow_id INTEGER,
    related_bridge_id INTEGER,
    related_verification_id INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_benefit_stake FOREIGN KEY (stake_id)
        REFERENCES kamiyo_stakes(id) ON DELETE CASCADE,
    CONSTRAINT chk_benefit_type CHECK (benefit_type IN (
        'escrow_priority', 'bridge_discount', 'verifier_discount',
        'analytics_access', 'dispute_fast_track'
    ))
);

-- Indexes for staking tables
CREATE INDEX IF NOT EXISTS idx_stakes_wallet ON kamiyo_stakes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_stakes_tier ON kamiyo_stakes(current_tier);
CREATE INDEX IF NOT EXISTS idx_stakes_status ON kamiyo_stakes(status);
CREATE INDEX IF NOT EXISTS idx_stakes_tx_hash ON kamiyo_stakes(stake_tx_hash);

CREATE INDEX IF NOT EXISTS idx_benefits_wallet ON kamiyo_benefits_usage(wallet_address);
CREATE INDEX IF NOT EXISTS idx_benefits_stake ON kamiyo_benefits_usage(stake_id);
CREATE INDEX IF NOT EXISTS idx_benefits_type ON kamiyo_benefits_usage(benefit_type);


-- ============================================================================
-- ANALYTICS VIEWS (PRE-COMPUTED QUERIES)
-- ============================================================================

-- View: Active escrows with remaining time
CREATE OR REPLACE VIEW v_harmony_active_escrows AS
SELECT
    e.id,
    e.escrow_address,
    e.chain,
    e.buyer_address,
    e.seller_address,
    e.amount_usdc,
    e.status,
    e.quality_score,
    e.delivery_deadline,
    e.review_deadline,
    EXTRACT(EPOCH FROM (e.delivery_deadline - CURRENT_TIMESTAMP)) / 3600 AS hours_until_delivery,
    e.buyer_kamiyo_staked,
    e.seller_kamiyo_staked,
    e.priority_score,
    e.created_at
FROM harmony_escrows e
WHERE e.status IN ('pending', 'accepted', 'submitted')
AND e.delivery_deadline > CURRENT_TIMESTAMP
ORDER BY e.priority_score DESC, e.created_at ASC;

-- View: Escrow performance metrics by chain
CREATE OR REPLACE VIEW v_harmony_escrow_stats AS
SELECT
    chain,
    COUNT(*) as total_count,
    SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) as successful_count,
    SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed_count,
    SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
    ROUND((SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2) as success_rate,
    SUM(amount_usdc) as total_volume_usdc,
    AVG(amount_usdc) as avg_escrow_amount,
    AVG(quality_score) as avg_quality_score,
    COUNT(DISTINCT buyer_address) as unique_buyers,
    COUNT(DISTINCT seller_address) as unique_sellers
FROM harmony_escrows
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY chain;

-- View: Bridge performance metrics
CREATE OR REPLACE VIEW v_harmony_bridge_stats AS
SELECT
    source_chain,
    destination_chain,
    COUNT(*) as total_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_count,
    ROUND((SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2) as success_rate,
    SUM(source_amount_usdc) as total_volume_usdc,
    AVG(source_amount_usdc) as avg_transfer_amount,
    AVG(total_fees_usdc) as avg_total_fees,
    AVG((total_fees_usdc / source_amount_usdc) * 100) as avg_fee_percentage,
    AVG(EXTRACT(EPOCH FROM (actual_completion_time - created_at))) as avg_completion_seconds,
    SUM(kamiyo_discount_amount) as total_discounts_given
FROM harmony_bridges
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
AND status = 'completed'
GROUP BY source_chain, destination_chain;

-- View: Verifier performance metrics
CREATE OR REPLACE VIEW v_harmony_verifier_stats AS
SELECT
    verifier_model,
    COUNT(*) as total_count,
    AVG(overall_score) as avg_score,
    AVG(confidence_score) as avg_confidence,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usdc) as total_cost_usdc,
    AVG(cost_usdc) as avg_cost_per_verification,
    AVG(processing_time_seconds) as avg_processing_time,
    SUM(CASE WHEN human_reviewed = TRUE THEN 1 ELSE 0 END) as human_override_count,
    SUM(CASE WHEN overall_score >= 80 THEN 1 ELSE 0 END) as auto_release_count
FROM harmony_verifications
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
AND status = 'completed'
GROUP BY verifier_model;

-- View: User reputation scores
CREATE OR REPLACE VIEW v_harmony_user_reputation AS
SELECT
    wallet_address,
    escrows_as_buyer,
    escrows_as_seller,
    successful_buyer_escrows,
    successful_seller_escrows,
    avg_quality_delivered,
    bridges_completed,
    total_spent_usdc,
    reputation_score,
    RANK() OVER (ORDER BY reputation_score DESC) as rank
FROM (
    SELECT
        COALESCE(e_buyer.buyer_address, e_seller.seller_address, b.source_address, s.wallet_address) as wallet_address,

        -- Escrow metrics (as buyer)
        COUNT(DISTINCT e_buyer.id) as escrows_as_buyer,
        SUM(CASE WHEN e_buyer.status = 'released' THEN 1 ELSE 0 END) as successful_buyer_escrows,

        -- Escrow metrics (as seller)
        COUNT(DISTINCT e_seller.id) as escrows_as_seller,
        SUM(CASE WHEN e_seller.status = 'released' THEN 1 ELSE 0 END) as successful_seller_escrows,
        AVG(e_seller.quality_score) as avg_quality_delivered,

        -- Bridge usage
        COUNT(DISTINCT b.id) as bridges_completed,

        -- Shadow balance activity
        SUM(CASE WHEN s.transaction_type = 'debit' THEN s.amount_usdc ELSE 0 END) as total_spent_usdc,

        -- Overall reputation score (0-100)
        LEAST(100, (
            COALESCE((SUM(CASE WHEN e_buyer.status = 'released' THEN 1 ELSE 0 END)::DECIMAL /
                     NULLIF(COUNT(DISTINCT e_buyer.id), 0)) * 40, 0) +
            COALESCE(AVG(e_seller.quality_score) * 0.4, 0) +
            COALESCE(LEAST(COUNT(DISTINCT b.id) / 10.0, 1.0) * 20, 0)
        ))::INTEGER as reputation_score

    FROM harmony_escrows e_buyer
    FULL OUTER JOIN harmony_escrows e_seller ON e_seller.seller_address = e_buyer.buyer_address
    FULL OUTER JOIN harmony_bridges b ON b.source_address = e_buyer.buyer_address OR b.source_address = e_seller.seller_address
    FULL OUTER JOIN shadow_transactions s ON s.wallet_address = e_buyer.buyer_address OR s.wallet_address = e_seller.seller_address
    WHERE e_buyer.buyer_address IS NOT NULL OR e_seller.seller_address IS NOT NULL
    GROUP BY COALESCE(e_buyer.buyer_address, e_seller.seller_address, b.source_address, s.wallet_address)
) subquery;

-- View: Shadow balance summary by user
CREATE OR REPLACE VIEW v_harmony_shadow_balance_summary AS
SELECT
    wallet_address,
    SUM(CASE WHEN transaction_type = 'deposit' THEN amount_usdc ELSE 0 END) as total_deposited,
    SUM(CASE WHEN transaction_type = 'debit' THEN amount_usdc ELSE 0 END) as total_spent,
    SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount_usdc ELSE 0 END) as total_withdrawn,
    COUNT(*) as transaction_count,
    MAX(created_at) as last_activity
FROM shadow_transactions
GROUP BY wallet_address;


-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Calculate escrow priority score based on KAMIYO stakes
CREATE OR REPLACE FUNCTION calculate_escrow_priority()
RETURNS TRIGGER AS $$
BEGIN
    -- Priority = (buyer_stake / 1000) + (seller_stake / 1000)
    -- Bronze (1k) = 1 point, Silver (5k) = 5 points, Gold (10k) = 10 points, Platinum (50k) = 50 points
    NEW.priority_score := FLOOR(
        (COALESCE(NEW.buyer_kamiyo_staked, 0) / 1000.0) +
        (COALESCE(NEW.seller_kamiyo_staked, 0) / 1000.0)
    )::INTEGER;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_escrow_priority
BEFORE INSERT OR UPDATE OF buyer_kamiyo_staked, seller_kamiyo_staked ON harmony_escrows
FOR EACH ROW
EXECUTE FUNCTION calculate_escrow_priority();

-- Function: Calculate KAMIYO staking tier
CREATE OR REPLACE FUNCTION calculate_kamiyo_tier()
RETURNS TRIGGER AS $$
BEGIN
    NEW.current_tier :=
        CASE
            WHEN NEW.amount_kamiyo >= 50000 THEN 'platinum'
            WHEN NEW.amount_kamiyo >= 10000 THEN 'gold'
            WHEN NEW.amount_kamiyo >= 5000 THEN 'silver'
            WHEN NEW.amount_kamiyo >= 1000 THEN 'bronze'
            ELSE NULL
        END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_kamiyo_tier
BEFORE INSERT OR UPDATE OF amount_kamiyo ON kamiyo_stakes
FOR EACH ROW
EXECUTE FUNCTION calculate_kamiyo_tier();

-- Function: Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_updated_at trigger to relevant tables
CREATE TRIGGER trg_update_escrows_timestamp
BEFORE UPDATE ON harmony_escrows
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_update_bridges_timestamp
BEFORE UPDATE ON harmony_bridges
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_update_stakes_timestamp
BEFORE UPDATE ON kamiyo_stakes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Cleanup expired escrows
CREATE OR REPLACE FUNCTION cleanup_expired_escrows()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Mark escrows as expired if past delivery_deadline and still pending/accepted
    UPDATE harmony_escrows
    SET status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('pending', 'accepted')
    AND delivery_deadline < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Refresh analytics hourly aggregates
CREATE OR REPLACE FUNCTION refresh_harmony_analytics()
RETURNS VOID AS $$
DECLARE
    current_hour TIMESTAMP;
BEGIN
    current_hour := DATE_TRUNC('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour');

    -- Insert or update hourly analytics for each chain
    INSERT INTO harmony_analytics_hourly (
        hour_bucket,
        chain,
        escrows_created,
        escrows_completed,
        escrows_disputed,
        escrow_volume_usdc,
        bridges_completed,
        bridge_volume_usdc,
        bridge_fees_collected_usdc,
        verifications_completed,
        verifications_cost_usdc,
        avg_verification_score,
        shadow_deposits,
        shadow_settlements,
        shadow_volume_usdc,
        unique_users,
        total_fees_collected_usdc
    )
    SELECT
        current_hour,
        COALESCE(e.chain, b.source_chain, 'all') as chain,
        COUNT(DISTINCT e.id) as escrows_created,
        SUM(CASE WHEN e.status = 'released' THEN 1 ELSE 0 END) as escrows_completed,
        SUM(CASE WHEN e.status = 'disputed' THEN 1 ELSE 0 END) as escrows_disputed,
        COALESCE(SUM(e.amount_usdc), 0) as escrow_volume_usdc,
        COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as bridges_completed,
        COALESCE(SUM(b.source_amount_usdc), 0) as bridge_volume_usdc,
        COALESCE(SUM(b.total_fees_usdc), 0) as bridge_fees_collected_usdc,
        COUNT(DISTINCT v.id) as verifications_completed,
        COALESCE(SUM(v.cost_usdc), 0) as verifications_cost_usdc,
        AVG(v.overall_score) as avg_verification_score,
        COUNT(DISTINCT sd.id) as shadow_deposits,
        COUNT(DISTINCT ss.id) as shadow_settlements,
        COALESCE(SUM(sd.amount_usdc), 0) as shadow_volume_usdc,
        COUNT(DISTINCT COALESCE(e.buyer_address, b.source_address, sd.wallet_address)) as unique_users,
        COALESCE(SUM(e.amount_usdc * 0.005), 0) + COALESCE(SUM(b.kamiyo_fee_usdc), 0) as total_fees_collected_usdc
    FROM harmony_escrows e
    FULL OUTER JOIN harmony_bridges b ON b.created_at >= current_hour AND b.created_at < current_hour + INTERVAL '1 hour'
    FULL OUTER JOIN harmony_verifications v ON v.created_at >= current_hour AND v.created_at < current_hour + INTERVAL '1 hour'
    FULL OUTER JOIN shadow_deposits sd ON sd.created_at >= current_hour AND sd.created_at < current_hour + INTERVAL '1 hour'
    FULL OUTER JOIN shadow_settlements ss ON ss.created_at >= current_hour AND ss.created_at < current_hour + INTERVAL '1 hour'
    WHERE e.created_at >= current_hour AND e.created_at < current_hour + INTERVAL '1 hour'
    GROUP BY COALESCE(e.chain, b.source_chain, 'all')
    ON CONFLICT (hour_bucket, chain)
    DO UPDATE SET
        escrows_created = EXCLUDED.escrows_created,
        escrows_completed = EXCLUDED.escrows_completed,
        escrows_disputed = EXCLUDED.escrows_disputed,
        escrow_volume_usdc = EXCLUDED.escrow_volume_usdc,
        bridges_completed = EXCLUDED.bridges_completed,
        bridge_volume_usdc = EXCLUDED.bridge_volume_usdc,
        bridge_fees_collected_usdc = EXCLUDED.bridge_fees_collected_usdc,
        verifications_completed = EXCLUDED.verifications_completed,
        verifications_cost_usdc = EXCLUDED.verifications_cost_usdc,
        avg_verification_score = EXCLUDED.avg_verification_score,
        shadow_deposits = EXCLUDED.shadow_deposits,
        shadow_settlements = EXCLUDED.shadow_settlements,
        shadow_volume_usdc = EXCLUDED.shadow_volume_usdc,
        unique_users = EXCLUDED.unique_users,
        total_fees_collected_usdc = EXCLUDED.total_fees_collected_usdc;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE harmony_escrows IS 'Auto-negotiation escrows for AI agent work agreements';
COMMENT ON TABLE escrow_negotiations IS 'Negotiation message history between buyer and seller';
COMMENT ON TABLE harmony_bridges IS 'Cross-chain USDC transfers via Wormhole protocol';
COMMENT ON TABLE bridge_routes IS 'Pre-computed optimal routes for common chain pairs';
COMMENT ON TABLE harmony_verifications IS 'AI-powered quality verification results for deliverables';
COMMENT ON TABLE verifier_templates IS 'Pre-defined verification criteria templates';
COMMENT ON TABLE shadow_deposits IS 'Off-chain balance deposits for microtransaction efficiency';
COMMENT ON TABLE shadow_settlements IS 'Batch settlement transactions from shadow balances to on-chain';
COMMENT ON TABLE shadow_transactions IS 'Complete audit log of all shadow balance operations';
COMMENT ON TABLE harmony_analytics_cache IS 'Cached analytics results for performance optimization';
COMMENT ON TABLE harmony_analytics_hourly IS 'Hourly aggregated metrics across all Harmony features';
COMMENT ON TABLE kamiyo_stakes IS 'KAMIYO token stakes for premium benefits and discounts';
COMMENT ON TABLE kamiyo_benefits_usage IS 'Tracking of KAMIYO staking benefits utilization';

-- ============================================================================
-- GRANT PERMISSIONS (adjust based on your database user)
-- ============================================================================
-- Example permissions (uncomment and adjust for your environment):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kamiyo_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kamiyo_api;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kamiyo_api;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Review and test schema in development environment
-- 2. Run performance benchmarks on views and indexes
-- 3. Deploy to staging for integration testing
-- 4. Schedule cleanup functions as cron jobs:
--    - cleanup_expired_escrows(): Every 1 hour
--    - refresh_harmony_analytics(): Every 1 hour
-- ============================================================================
