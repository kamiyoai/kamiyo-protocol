-- Rollback Migration: Remove ERC-8004 tables
-- Date: 2025-01-13
-- Description: Safely rollback ERC-8004 agent identity system

-- Drop scheduled jobs (if pg_cron is enabled)
-- SELECT cron.unschedule('refresh-erc8004-stats');

-- Drop triggers first
DROP TRIGGER IF EXISTS update_agent_activity_on_payment ON erc8004_agent_payments;
DROP TRIGGER IF EXISTS update_agent_activity_on_reputation ON erc8004_reputation;
DROP TRIGGER IF EXISTS update_erc8004_validations_updated_at ON erc8004_validations;
DROP TRIGGER IF EXISTS update_erc8004_agent_metadata_updated_at ON erc8004_agent_metadata;
DROP TRIGGER IF EXISTS update_erc8004_agents_updated_at ON erc8004_agents;

-- Drop functions
DROP FUNCTION IF EXISTS refresh_erc8004_stats();
DROP FUNCTION IF EXISTS update_agent_activity();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Remove foreign key from x402_payments
ALTER TABLE IF EXISTS x402_payments DROP CONSTRAINT IF EXISTS fk_x402_payments_agent;
DROP INDEX IF EXISTS idx_x402_payments_agent;
ALTER TABLE IF EXISTS x402_payments DROP COLUMN IF EXISTS agent_id;

-- Drop views (order matters)
DROP VIEW IF EXISTS v_erc8004_agent_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_erc8004_agent_payment_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_erc8004_agent_reputation CASCADE;

-- Drop tables (reverse order of creation)
DROP TABLE IF EXISTS erc8004_agent_payments CASCADE;
DROP TABLE IF EXISTS erc8004_validations CASCADE;
DROP TABLE IF EXISTS erc8004_reputation CASCADE;
DROP TABLE IF EXISTS erc8004_agent_metadata CASCADE;
DROP TABLE IF EXISTS erc8004_agents CASCADE;

-- Note: Extensions are not dropped as they may be used elsewhere
-- If you need to drop them:
-- DROP EXTENSION IF EXISTS pg_trgm;
-- DROP EXTENSION IF EXISTS "uuid-ossp";
