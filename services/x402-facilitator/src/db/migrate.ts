import { getPool, closePool } from './pool';
import * as dotenv from 'dotenv';

const MIGRATIONS = [
  {
    name: '001_initial',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_wallet TEXT NOT NULL,
        payer_wallet TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        fee_amount NUMERIC(20, 6) NOT NULL,
        asset TEXT NOT NULL DEFAULT 'USDC',
        tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        network TEXT NOT NULL DEFAULT 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS escrow_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id),
        escrow_address TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        fee_amount NUMERIC(20, 6) NOT NULL,
        quality_score SMALLINT,
        release_tx TEXT,
        dispute_id UUID,
        status TEXT NOT NULL DEFAULT 'active',
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fee_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id),
        escrow_id UUID REFERENCES escrow_records(id),
        fee_type TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        treasury_tx TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_hash TEXT NOT NULL UNIQUE,
        merchant_wallet TEXT NOT NULL,
        label TEXT,
        rate_limit INT NOT NULL DEFAULT 100,
        monthly_volume NUMERIC(20, 6) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON settlements(merchant_wallet);
      CREATE INDEX IF NOT EXISTS idx_settlements_payer ON settlements(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
      CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_records(status);
      CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_fee_ledger_type ON fee_ledger(fee_type);
      CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(merchant_wallet);
    `,
  },
  {
    name: '002_disputes_reputation',
    sql: `
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        escrow_id UUID NOT NULL,
        escrow_address TEXT NOT NULL,
        opener_wallet TEXT NOT NULL,
        reason TEXT NOT NULL,
        median_score SMALLINT,
        refund_percentage SMALLINT,
        resolution TEXT,
        finalize_tx TEXT,
        status TEXT NOT NULL DEFAULT 'commit_phase',
        commit_phase_ends_at TIMESTAMPTZ NOT NULL,
        reveal_phase_ends_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS oracle_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dispute_id UUID NOT NULL,
        oracle TEXT NOT NULL,
        commitment_hash TEXT NOT NULL,
        quality_score SMALLINT,
        committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revealed_at TIMESTAMPTZ,
        UNIQUE(dispute_id, oracle)
      );

      ALTER TABLE disputes
        ADD COLUMN IF NOT EXISTS escrow_id UUID,
        ADD COLUMN IF NOT EXISTS escrow_address TEXT,
        ADD COLUMN IF NOT EXISTS opener_wallet TEXT,
        ADD COLUMN IF NOT EXISTS reason TEXT,
        ADD COLUMN IF NOT EXISTS median_score SMALLINT,
        ADD COLUMN IF NOT EXISTS refund_percentage SMALLINT,
        ADD COLUMN IF NOT EXISTS resolution TEXT,
        ADD COLUMN IF NOT EXISTS finalize_tx TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS commit_phase_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reveal_phase_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

      ALTER TABLE disputes
        ALTER COLUMN status SET DEFAULT 'commit_phase',
        ALTER COLUMN created_at SET DEFAULT NOW();

      UPDATE disputes
      SET
        status = COALESCE(status, 'commit_phase'),
        created_at = COALESCE(created_at, NOW())
      WHERE status IS NULL OR created_at IS NULL;

      ALTER TABLE oracle_votes
        ADD COLUMN IF NOT EXISTS dispute_id UUID,
        ADD COLUMN IF NOT EXISTS oracle TEXT,
        ADD COLUMN IF NOT EXISTS commitment_hash TEXT,
        ADD COLUMN IF NOT EXISTS quality_score SMALLINT,
        ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS revealed_at TIMESTAMPTZ;

      ALTER TABLE oracle_votes
        ALTER COLUMN committed_at SET DEFAULT NOW();

      UPDATE oracle_votes
      SET committed_at = COALESCE(committed_at, NOW())
      WHERE committed_at IS NULL;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_oracle_votes_dispute_oracle') THEN
          ALTER TABLE oracle_votes ADD CONSTRAINT uq_oracle_votes_dispute_oracle UNIQUE (dispute_id, oracle);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_address);
      CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
      CREATE INDEX IF NOT EXISTS idx_disputes_opener ON disputes(opener_wallet);
      CREATE INDEX IF NOT EXISTS idx_oracle_votes_dispute ON oracle_votes(dispute_id);

      DO $$
      BEGIN
        BEGIN
          EXECUTE 'ALTER TABLE disputes ADD CONSTRAINT fk_disputes_escrow FOREIGN KEY (escrow_id) REFERENCES escrow_records(id)';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
          WHEN undefined_column THEN NULL;
          WHEN undefined_table THEN NULL;
          WHEN OTHERS THEN
            RAISE NOTICE 'skipping fk_disputes_escrow migration constraint: %', SQLERRM;
        END;

        BEGIN
          EXECUTE 'ALTER TABLE oracle_votes ADD CONSTRAINT fk_oracle_votes_dispute FOREIGN KEY (dispute_id) REFERENCES disputes(id)';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
          WHEN undefined_column THEN NULL;
          WHEN undefined_table THEN NULL;
          WHEN OTHERS THEN
            RAISE NOTICE 'skipping fk_oracle_votes_dispute migration constraint: %', SQLERRM;
        END;

        BEGIN
          EXECUTE 'ALTER TABLE escrow_records ADD CONSTRAINT fk_escrow_dispute FOREIGN KEY (dispute_id) REFERENCES disputes(id)';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
          WHEN undefined_column THEN NULL;
          WHEN undefined_table THEN NULL;
          WHEN OTHERS THEN
            RAISE NOTICE 'skipping fk_escrow_dispute migration constraint: %', SQLERRM;
        END;
      END $$;
    `,
  },
  {
    name: '003_value_checks',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_escrow_quality') THEN
          ALTER TABLE escrow_records ADD CONSTRAINT chk_escrow_quality CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_oracle_quality') THEN
          ALTER TABLE oracle_votes ADD CONSTRAINT chk_oracle_quality CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispute_median') THEN
          ALTER TABLE disputes ADD CONSTRAINT chk_dispute_median CHECK (median_score IS NULL OR (median_score >= 0 AND median_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispute_refund') THEN
          ALTER TABLE disputes ADD CONSTRAINT chk_dispute_refund CHECK (refund_percentage IS NULL OR (refund_percentage >= 0 AND refund_percentage <= 100));
        END IF;
      END $$;
    `,
  },
  {
    name: '004_privacy',
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS shadow_commitment TEXT;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS shadow_nullifier TEXT;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS privacy_tier TEXT;

      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS shadow_commitment TEXT;
      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS shadow_nullifier TEXT;
      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS privacy_tier TEXT;

      CREATE INDEX IF NOT EXISTS idx_settlements_shadow ON settlements(shadow_commitment) WHERE shadow_commitment IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_settlements_nullifier ON settlements(shadow_nullifier) WHERE shadow_nullifier IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_escrow_shadow ON escrow_records(shadow_commitment) WHERE shadow_commitment IS NOT NULL;
    `,
  },
  {
    name: '005_discovery_resources',
    sql: `
      CREATE TABLE IF NOT EXISTS discovery_resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_wallet TEXT NOT NULL,
        resource_url TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_discovery_merchant ON discovery_resources(merchant_wallet);
    `,
  },
  {
    name: '006_network_canonicalization',
    sql: `
      UPDATE settlements
      SET network = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
      WHERE network IN ('solana:mainnet', 'solana:mainnet-beta');

      ALTER TABLE settlements
      ALTER COLUMN network SET DEFAULT 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    `,
  },
  {
    name: '007_payment_nonce_guard',
    sql: `
      CREATE TABLE IF NOT EXISTS payment_nonce_guard (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payer_wallet TEXT NOT NULL,
        nonce TEXT NOT NULL,
        usage TEXT NOT NULL,
        network TEXT NOT NULL,
        resource TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (payer_wallet, nonce)
      );

      CREATE INDEX IF NOT EXISTS idx_payment_nonce_usage ON payment_nonce_guard(usage);
      CREATE INDEX IF NOT EXISTS idx_payment_nonce_network ON payment_nonce_guard(network);
    `,
  },
  {
    name: '008_rate_limit_windows',
    sql: `
      CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
        rate_key TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (rate_key, window_start)
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_window_start ON api_rate_limit_windows(window_start);
    `,
  },
  {
    name: '009_session_auth',
    sql: `
      CREATE TABLE IF NOT EXISTS session_challenges (
        nonce TEXT PRIMARY KEY,
        payer_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        max_total_micro NUMERIC(30, 0) NOT NULL,
        max_single_micro NUMERIC(30, 0),
        session_expires_at TIMESTAMPTZ NOT NULL,
        message TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_session_challenges_payer ON session_challenges(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_session_challenges_expires ON session_challenges(expires_at);

      CREATE TABLE IF NOT EXISTS payment_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        max_total_micro NUMERIC(30, 0) NOT NULL,
        max_single_micro NUMERIC(30, 0),
        spent_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_payment_sessions_payer ON payment_sessions(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires ON payment_sessions(expires_at);
    `,
  },
  {
    name: '010_payment_nonce_tx_hash',
    sql: `
      ALTER TABLE payment_nonce_guard ADD COLUMN IF NOT EXISTS tx_hash TEXT;
      ALTER TABLE payment_nonce_guard ADD COLUMN IF NOT EXISTS settlement_id UUID;

      CREATE INDEX IF NOT EXISTS idx_payment_nonce_tx_hash ON payment_nonce_guard(tx_hash) WHERE tx_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_payment_nonce_settlement ON payment_nonce_guard(settlement_id) WHERE settlement_id IS NOT NULL;
    `,
  },
  {
    name: '011_kizuna_credit',
    sql: `
      CREATE TABLE IF NOT EXISTS kizuna_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        repay_wallet TEXT NOT NULL,
        passport_address TEXT,
        networks JSONB NOT NULL DEFAULT '[]'::jsonb,
        mandate_single_limit_micro NUMERIC(30, 0),
        mandate_daily_limit_micro NUMERIC(30, 0),
        mandate_monthly_limit_micro NUMERIC(30, 0),
        mandate_human_approval_micro NUMERIC(30, 0),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_accounts_status
          CHECK (status IN ('active', 'suspended')),
        CONSTRAINT chk_kizuna_accounts_single_limit
          CHECK (mandate_single_limit_micro IS NULL OR mandate_single_limit_micro >= 0),
        CONSTRAINT chk_kizuna_accounts_daily_limit
          CHECK (mandate_daily_limit_micro IS NULL OR mandate_daily_limit_micro >= 0),
        CONSTRAINT chk_kizuna_accounts_monthly_limit
          CHECK (mandate_monthly_limit_micro IS NULL OR mandate_monthly_limit_micro >= 0),
        CONSTRAINT chk_kizuna_accounts_human_limit
          CHECK (mandate_human_approval_micro IS NULL OR mandate_human_approval_micro >= 0)
      );

      CREATE TABLE IF NOT EXISTS kizuna_underwrite_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        payer_wallet TEXT NOT NULL,
        repay_wallet TEXT NOT NULL,
        request_nonce TEXT NOT NULL,
        network TEXT NOT NULL,
        requested_micro NUMERIC(30, 0) NOT NULL,
        approved BOOLEAN NOT NULL,
        approved_micro NUMERIC(30, 0) NOT NULL,
        available_micro NUMERIC(30, 0) NOT NULL,
        outstanding_micro NUMERIC(30, 0) NOT NULL,
        score_raw INT NOT NULL,
        reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        tier TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_decisions_requested CHECK (requested_micro >= 0),
        CONSTRAINT chk_kizuna_decisions_approved_micro CHECK (approved_micro >= 0),
        CONSTRAINT chk_kizuna_decisions_available_micro CHECK (available_micro >= 0),
        CONSTRAINT chk_kizuna_decisions_outstanding_micro CHECK (outstanding_micro >= 0),
        CONSTRAINT uq_kizuna_decision_nonce UNIQUE (payer_wallet, request_nonce)
      );

      CREATE TABLE IF NOT EXISTS kizuna_credit_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        decision_id UUID NOT NULL REFERENCES kizuna_underwrite_decisions(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        payer_wallet TEXT NOT NULL,
        request_nonce TEXT NOT NULL,
        network TEXT NOT NULL,
        amount_micro NUMERIC(30, 0) NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        expires_at TIMESTAMPTZ NOT NULL,
        settlement_id UUID REFERENCES settlements(id),
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_reservations_amount CHECK (amount_micro >= 0),
        CONSTRAINT chk_kizuna_reservations_status
          CHECK (status IN ('reserved', 'consumed', 'released', 'expired')),
        CONSTRAINT uq_kizuna_reservation_nonce UNIQUE (payer_wallet, request_nonce)
      );

      CREATE TABLE IF NOT EXISTS kizuna_debts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        payer_wallet TEXT NOT NULL,
        repay_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        settlement_id UUID NOT NULL UNIQUE REFERENCES settlements(id) ON DELETE CASCADE,
        decision_id UUID REFERENCES kizuna_underwrite_decisions(id),
        reservation_id UUID REFERENCES kizuna_credit_reservations(id),
        principal_micro NUMERIC(30, 0) NOT NULL,
        outstanding_micro NUMERIC(30, 0) NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        CONSTRAINT chk_kizuna_debts_principal CHECK (principal_micro >= 0),
        CONSTRAINT chk_kizuna_debts_outstanding CHECK (outstanding_micro >= 0),
        CONSTRAINT chk_kizuna_debts_status CHECK (status IN ('open', 'closed', 'written_off'))
      );

      CREATE TABLE IF NOT EXISTS kizuna_repayments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        debt_id UUID REFERENCES kizuna_debts(id),
        reference_id TEXT NOT NULL,
        source TEXT NOT NULL,
        amount_micro NUMERIC(30, 0) NOT NULL,
        applied_micro NUMERIC(30, 0) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_repayments_amount CHECK (amount_micro >= 0),
        CONSTRAINT chk_kizuna_repayments_applied CHECK (applied_micro >= 0),
        CONSTRAINT chk_kizuna_repayments_source CHECK (source IN ('credits')),
        CONSTRAINT uq_kizuna_repayment_reference UNIQUE (agent_id, reference_id)
      );

      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_agent ON kizuna_accounts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_status ON kizuna_accounts(status);
      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_created_at ON kizuna_accounts(created_at);

      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_agent ON kizuna_underwrite_decisions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_nonce ON kizuna_underwrite_decisions(request_nonce);
      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_created_at ON kizuna_underwrite_decisions(created_at);

      CREATE INDEX IF NOT EXISTS idx_kizuna_reservations_agent ON kizuna_credit_reservations(agent_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_reservations_nonce ON kizuna_credit_reservations(request_nonce);
      CREATE INDEX IF NOT EXISTS idx_kizuna_reservations_status ON kizuna_credit_reservations(status);
      CREATE INDEX IF NOT EXISTS idx_kizuna_reservations_created_at ON kizuna_credit_reservations(created_at);

      CREATE INDEX IF NOT EXISTS idx_kizuna_debts_agent ON kizuna_debts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_debts_status ON kizuna_debts(status);
      CREATE INDEX IF NOT EXISTS idx_kizuna_debts_created_at ON kizuna_debts(created_at);

      CREATE INDEX IF NOT EXISTS idx_kizuna_repayments_agent ON kizuna_repayments(agent_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_repayments_created_at ON kizuna_repayments(created_at);
    `,
  },
  {
    name: '012_kizuna_lanes_fastpath',
    sql: `
      ALTER TABLE kizuna_underwrite_decisions
        ADD COLUMN IF NOT EXISTS lane TEXT NOT NULL DEFAULT 'enterprise',
        ADD COLUMN IF NOT EXISTS pool_id TEXT NOT NULL DEFAULT 'enterprise-main',
        ADD COLUMN IF NOT EXISTS policy_pack_id TEXT,
        ADD COLUMN IF NOT EXISTS risk_band TEXT,
        ADD COLUMN IF NOT EXISTS ltv_bps INT,
        ADD COLUMN IF NOT EXISTS health_factor NUMERIC(20, 6),
        ADD COLUMN IF NOT EXISTS decision_envelope_hash TEXT;

      ALTER TABLE kizuna_credit_reservations
        ADD COLUMN IF NOT EXISTS lane TEXT NOT NULL DEFAULT 'enterprise',
        ADD COLUMN IF NOT EXISTS pool_id TEXT NOT NULL DEFAULT 'enterprise-main';

      ALTER TABLE kizuna_debts
        ADD COLUMN IF NOT EXISTS lane TEXT NOT NULL DEFAULT 'enterprise',
        ADD COLUMN IF NOT EXISTS pool_id TEXT NOT NULL DEFAULT 'enterprise-main',
        ADD COLUMN IF NOT EXISTS decision_envelope_hash TEXT;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_decisions_lane') THEN
          ALTER TABLE kizuna_underwrite_decisions
            ADD CONSTRAINT chk_kizuna_decisions_lane CHECK (lane IN ('enterprise', 'crypto-fast'));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_decisions_ltv') THEN
          ALTER TABLE kizuna_underwrite_decisions
            ADD CONSTRAINT chk_kizuna_decisions_ltv CHECK (ltv_bps IS NULL OR (ltv_bps >= 0 AND ltv_bps <= 10000));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_decisions_health_factor') THEN
          ALTER TABLE kizuna_underwrite_decisions
            ADD CONSTRAINT chk_kizuna_decisions_health_factor CHECK (health_factor IS NULL OR health_factor >= 0);
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_reservations_lane') THEN
          ALTER TABLE kizuna_credit_reservations
            ADD CONSTRAINT chk_kizuna_reservations_lane CHECK (lane IN ('enterprise', 'crypto-fast'));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_debts_lane') THEN
          ALTER TABLE kizuna_debts
            ADD CONSTRAINT chk_kizuna_debts_lane CHECK (lane IN ('enterprise', 'crypto-fast'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_lane_pool
        ON kizuna_underwrite_decisions(lane, pool_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_reservations_lane_pool_status
        ON kizuna_credit_reservations(lane, pool_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_debts_lane_pool_status
        ON kizuna_debts(lane, pool_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS kizuna_collateral_assets (
        asset_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        chain TEXT NOT NULL,
        haircut_bps INT NOT NULL DEFAULT 0,
        volatility_buffer_bps INT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_collateral_asset_haircut CHECK (haircut_bps >= 0 AND haircut_bps <= 10000),
        CONSTRAINT chk_kizuna_collateral_asset_volatility CHECK (volatility_buffer_bps >= 0 AND volatility_buffer_bps <= 10000),
        CONSTRAINT chk_kizuna_collateral_asset_status CHECK (status IN ('active', 'inactive'))
      );

      CREATE TABLE IF NOT EXISTS kizuna_fastpath_pools (
        pool_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        ltv_cap_bps INT NOT NULL,
        reserve_ratio_bps INT NOT NULL DEFAULT 10000,
        min_health_factor NUMERIC(20, 6) NOT NULL DEFAULT 1.10,
        max_single_micro NUMERIC(30, 0) NOT NULL DEFAULT 5000000,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_pool_status CHECK (status IN ('active', 'paused', 'frozen')),
        CONSTRAINT chk_kizuna_pool_ltv CHECK (ltv_cap_bps >= 0 AND ltv_cap_bps <= 10000),
        CONSTRAINT chk_kizuna_pool_reserve_ratio CHECK (reserve_ratio_bps >= 0 AND reserve_ratio_bps <= 10000),
        CONSTRAINT chk_kizuna_pool_min_health CHECK (min_health_factor > 0),
        CONSTRAINT chk_kizuna_pool_max_single CHECK (max_single_micro >= 0)
      );

      CREATE TABLE IF NOT EXISTS kizuna_pool_reserves (
        pool_id TEXT PRIMARY KEY,
        lane TEXT NOT NULL,
        reserved_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        outstanding_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        collateral_value_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_pool_reserve_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_pool_reserved CHECK (reserved_micro >= 0),
        CONSTRAINT chk_kizuna_pool_outstanding CHECK (outstanding_micro >= 0),
        CONSTRAINT chk_kizuna_pool_collateral CHECK (collateral_value_micro >= 0)
      );

      CREATE TABLE IF NOT EXISTS kizuna_collateral_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        pool_id TEXT NOT NULL,
        collateral_account TEXT NOT NULL,
        asset_id TEXT NOT NULL REFERENCES kizuna_collateral_assets(asset_id),
        deposited_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        withdrawn_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        locked_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_collateral_deposited CHECK (deposited_micro >= 0),
        CONSTRAINT chk_kizuna_collateral_withdrawn CHECK (withdrawn_micro >= 0),
        CONSTRAINT chk_kizuna_collateral_locked CHECK (locked_micro >= 0),
        CONSTRAINT chk_kizuna_collateral_status CHECK (status IN ('active', 'frozen', 'closed')),
        CONSTRAINT uq_kizuna_collateral_position UNIQUE (agent_id, pool_id, collateral_account, asset_id)
      );

      CREATE TABLE IF NOT EXISTS kizuna_health_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        collateral_value_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        debt_outstanding_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        ltv_bps INT NOT NULL DEFAULT 0,
        health_factor NUMERIC(20, 6) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'facilitator',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_health_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_health_collateral CHECK (collateral_value_micro >= 0),
        CONSTRAINT chk_kizuna_health_debt CHECK (debt_outstanding_micro >= 0),
        CONSTRAINT chk_kizuna_health_ltv CHECK (ltv_bps >= 0 AND ltv_bps <= 10000),
        CONSTRAINT chk_kizuna_health_factor CHECK (health_factor >= 0)
      );

      CREATE TABLE IF NOT EXISTS kizuna_risk_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        CONSTRAINT chk_kizuna_risk_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_risk_action CHECK (action IN ('freeze', 'throttle', 'unfreeze')),
        CONSTRAINT chk_kizuna_risk_status CHECK (status IN ('active', 'resolved'))
      );

      CREATE TABLE IF NOT EXISTS kizuna_collateral_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        pool_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        collateral_account TEXT NOT NULL,
        asset_id TEXT NOT NULL REFERENCES kizuna_collateral_assets(asset_id),
        reference_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        amount_micro NUMERIC(30, 0) NOT NULL,
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_collateral_event_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_collateral_event_type CHECK (event_type IN ('deposit', 'withdraw')),
        CONSTRAINT chk_kizuna_collateral_event_amount CHECK (amount_micro >= 0),
        CONSTRAINT uq_kizuna_collateral_event_reference UNIQUE (agent_id, reference_id)
      );

      CREATE INDEX IF NOT EXISTS idx_kizuna_collateral_positions_agent_pool
        ON kizuna_collateral_positions(agent_id, pool_id, status);
      CREATE INDEX IF NOT EXISTS idx_kizuna_health_agent_pool_created
        ON kizuna_health_snapshots(agent_id, pool_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_risk_actions_agent_status
        ON kizuna_risk_actions(agent_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_collateral_events_agent_created
        ON kizuna_collateral_events(agent_id, created_at DESC);

      INSERT INTO kizuna_collateral_assets (asset_id, symbol, chain, haircut_bps, volatility_buffer_bps, status)
      VALUES ('usdc', 'USDC', 'multi', 0, 0, 'active')
      ON CONFLICT (asset_id) DO NOTHING;

      INSERT INTO kizuna_fastpath_pools (pool_id, status, ltv_cap_bps, reserve_ratio_bps, min_health_factor, max_single_micro)
      VALUES ('fastpath-main', 'active', 6000, 10000, 1.5, 2000000)
      ON CONFLICT (pool_id) DO NOTHING;

      INSERT INTO kizuna_pool_reserves (pool_id, lane, reserved_micro, outstanding_micro, collateral_value_micro)
      VALUES
        ('enterprise-main', 'enterprise', 0, 0, 0),
        ('fastpath-main', 'crypto-fast', 0, 0, 0)
      ON CONFLICT (pool_id) DO NOTHING;
    `,
  },
  {
    name: '013_kizuna_secured_only_defaults',
    sql: `
      INSERT INTO kizuna_collateral_assets (asset_id, symbol, chain, haircut_bps, volatility_buffer_bps, status)
      VALUES ('usdc', 'USDC', 'multi', 0, 0, 'active')
      ON CONFLICT (asset_id) DO UPDATE
      SET symbol = 'USDC',
          chain = 'multi',
          haircut_bps = 0,
          volatility_buffer_bps = 0,
          status = 'active',
          updated_at = NOW();

      UPDATE kizuna_collateral_assets
      SET status = 'inactive',
          updated_at = NOW()
      WHERE asset_id <> 'usdc';

      INSERT INTO kizuna_fastpath_pools (
        pool_id,
        status,
        ltv_cap_bps,
        reserve_ratio_bps,
        min_health_factor,
        max_single_micro
      )
      VALUES ('fastpath-main', 'active', 6000, 10000, 1.5, 2000000)
      ON CONFLICT (pool_id) DO UPDATE
      SET status = 'active',
          ltv_cap_bps = 6000,
          reserve_ratio_bps = 10000,
          min_health_factor = 1.5,
          max_single_micro = 2000000,
          updated_at = NOW();

      INSERT INTO kizuna_pool_reserves (pool_id, lane, reserved_micro, outstanding_micro, collateral_value_micro)
      VALUES
        ('enterprise-main', 'enterprise', 0, 0, 0),
        ('fastpath-main', 'crypto-fast', 0, 0, 0)
      ON CONFLICT (pool_id) DO NOTHING;
    `,
  },
  {
    name: '014_kizuna_billable_events',
    sql: `
      CREATE TABLE IF NOT EXISTS kizuna_billable_settlement_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id UUID NOT NULL REFERENCES kizuna_credit_reservations(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        debt_id UUID NOT NULL REFERENCES kizuna_debts(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        payer_wallet TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        amount_micro NUMERIC(30, 0) NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_billable_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_billable_amount CHECK (amount_micro >= 0),
        CONSTRAINT uq_kizuna_billable_reservation_settlement UNIQUE (reservation_id, settlement_id),
        CONSTRAINT uq_kizuna_billable_idempotency_key UNIQUE (idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_kizuna_billable_emitted_at
        ON kizuna_billable_settlement_events(emitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_billable_lane_pool_emitted
        ON kizuna_billable_settlement_events(lane, pool_id, emitted_at DESC);
    `,
  },
  {
    name: '015_kizuna_enterprise_prefund',
    sql: `
      ALTER TABLE kizuna_credit_reservations
        ADD COLUMN IF NOT EXISTS funding_mode TEXT NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS locked_micro NUMERIC(30, 0) NOT NULL DEFAULT 0;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_reservations_funding_mode') THEN
          ALTER TABLE kizuna_credit_reservations
            ADD CONSTRAINT chk_kizuna_reservations_funding_mode
            CHECK (funding_mode IN ('none', 'prefunded', 'collateralized'));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_reservations_locked_micro') THEN
          ALTER TABLE kizuna_credit_reservations
            ADD CONSTRAINT chk_kizuna_reservations_locked_micro
            CHECK (locked_micro >= 0);
        END IF;
      END $$;

      UPDATE kizuna_credit_reservations
      SET funding_mode = CASE
        WHEN lane = 'crypto-fast' THEN 'collateralized'
        ELSE 'none'
      END
      WHERE funding_mode = 'none';

      CREATE TABLE IF NOT EXISTS kizuna_enterprise_balances (
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        pool_id TEXT NOT NULL,
        available_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        reserved_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        spent_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (agent_id, pool_id),
        CONSTRAINT chk_kizuna_enterprise_available CHECK (available_micro >= 0),
        CONSTRAINT chk_kizuna_enterprise_reserved CHECK (reserved_micro >= 0),
        CONSTRAINT chk_kizuna_enterprise_spent CHECK (spent_micro >= 0)
      );

      CREATE TABLE IF NOT EXISTS kizuna_funding_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        amount_micro NUMERIC(30, 0) NOT NULL,
        tx_hash TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_funding_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_kizuna_funding_event_type CHECK (event_type IN ('deposit', 'withdraw')),
        CONSTRAINT chk_kizuna_funding_amount CHECK (amount_micro >= 0),
        CONSTRAINT uq_kizuna_funding_reference UNIQUE (agent_id, pool_id, reference_id)
      );

      CREATE INDEX IF NOT EXISTS idx_kizuna_enterprise_balances_pool
        ON kizuna_enterprise_balances(pool_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_funding_events_agent_created
        ON kizuna_funding_events(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kizuna_funding_events_pool_created
        ON kizuna_funding_events(pool_id, created_at DESC);

      ALTER TABLE kizuna_billable_settlement_events
        ALTER COLUMN debt_id DROP NOT NULL;
    `,
  },
  {
    name: '016_kizuna_registry_identity',
    sql: `
      ALTER TABLE kizuna_accounts
        ADD COLUMN IF NOT EXISTS registry_global_id TEXT,
        ADD COLUMN IF NOT EXISTS registry_name TEXT,
        ADD COLUMN IF NOT EXISTS registry_description TEXT,
        ADD COLUMN IF NOT EXISTS registry_image_uri TEXT,
        ADD COLUMN IF NOT EXISTS registry_owner_wallet TEXT,
        ADD COLUMN IF NOT EXISTS registry_operational_wallet TEXT,
        ADD COLUMN IF NOT EXISTS registry_agent_uri TEXT,
        ADD COLUMN IF NOT EXISTS registry_active BOOLEAN,
        ADD COLUMN IF NOT EXISTS registry_services JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS registry_supported_trust JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS registry_feedback_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS registry_sync_source TEXT,
        ADD COLUMN IF NOT EXISTS registry_synced_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_registry_global_id
        ON kizuna_accounts(registry_global_id);
      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_registry_sync_source
        ON kizuna_accounts(registry_sync_source);
      CREATE INDEX IF NOT EXISTS idx_kizuna_accounts_registry_synced_at
        ON kizuna_accounts(registry_synced_at DESC);
    `,
  },
  {
    name: '017_fairscale_trust_event_outbox',
    sql: `
      CREATE TABLE IF NOT EXISTS kizuna_fairscale_event_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        entity_id TEXT NOT NULL REFERENCES kizuna_accounts(agent_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempt_count INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        leased_until TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        last_http_status INT,
        last_error TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kizuna_fairscale_event_type CHECK (
          event_type IN (
            'settlement_confirmed',
            'repayment_received',
            'collateral_deposited',
            'collateral_withdrawn'
          )
        ),
        CONSTRAINT uq_kizuna_fairscale_event_id UNIQUE (event_id),
        CONSTRAINT uq_kizuna_fairscale_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT chk_kizuna_fairscale_attempt_count CHECK (attempt_count >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_kizuna_fairscale_outbox_pending
        ON kizuna_fairscale_event_outbox(next_attempt_at ASC, created_at ASC)
        WHERE delivered_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_kizuna_fairscale_outbox_entity
        ON kizuna_fairscale_event_outbox(entity_id, created_at DESC);
    `,
  },
  {
    name: '018_kizuna_kernel_v2_metadata',
    sql: `
      ALTER TABLE kizuna_underwrite_decisions
        ADD COLUMN IF NOT EXISTS policy_pack_version TEXT,
        ADD COLUMN IF NOT EXISTS risk_action TEXT,
        ADD COLUMN IF NOT EXISTS request_hash TEXT,
        ADD COLUMN IF NOT EXISTS signing_kid TEXT,
        ADD COLUMN IF NOT EXISTS envelope_version TEXT;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_decisions_risk_action') THEN
          ALTER TABLE kizuna_underwrite_decisions
            ADD CONSTRAINT chk_kizuna_decisions_risk_action
            CHECK (risk_action IS NULL OR risk_action IN ('none', 'freeze', 'throttle', 'unfreeze'));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kizuna_decisions_envelope_version') THEN
          ALTER TABLE kizuna_underwrite_decisions
            ADD CONSTRAINT chk_kizuna_decisions_envelope_version
            CHECK (envelope_version IS NULL OR envelope_version IN ('kizuna-envelope-v1', 'kizuna-envelope-v2'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_request_hash
        ON kizuna_underwrite_decisions(request_hash);
      CREATE INDEX IF NOT EXISTS idx_kizuna_decisions_signing_kid
        ON kizuna_underwrite_decisions(signing_kid, created_at DESC);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of MIGRATIONS) {
    const existing = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [migration.name]);
    if (existing.rows.length > 0) continue;

    console.log(`[migrate] applying ${migration.name}`);
    await pool.query(migration.sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
    console.log(`[migrate] applied ${migration.name}`);
  }
}

if (require.main === module) {
  dotenv.config();
  runMigrations()
    .then(() => {
      console.log('[migrate] done');
      return closePool();
    })
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
