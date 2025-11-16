-- ERC-8004 Performance Optimization Migration
-- Adds indexes and optimizations for production workloads

-- Covering index for active agents by chain
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_active_covering
ON erc8004_agents (status, chain, owner_address, created_at DESC)
WHERE status = 'active';

-- Index for reputation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_reputation_agent_created
ON erc8004_reputation (agent_uuid, created_at DESC)
WHERE is_revoked = FALSE;

-- Index for payment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agent_payments_agent
ON erc8004_agent_payments (agent_uuid, created_at DESC)
WHERE status = 'completed';

-- Index for metadata lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agent_metadata_agent
ON erc8004_agent_metadata (agent_uuid, key);

-- Optimize materialized view refresh function
CREATE OR REPLACE FUNCTION refresh_erc8004_stats()
RETURNS void AS $$
BEGIN
    -- Only refresh if stale (> 5 minutes)
    IF (
        SELECT COALESCE(
            EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at))),
            0
        )
        FROM mv_erc8004_agent_reputation
    ) > 300 THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_reputation;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_payment_stats;
        RAISE NOTICE 'ERC-8004 materialized views refreshed';
    ELSE
        RAISE NOTICE 'ERC-8004 materialized views are fresh, skipping refresh';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Scheduled refresh trigger (call from cron or application)
CREATE OR REPLACE FUNCTION schedule_erc8004_mv_refresh()
RETURNS void AS $$
BEGIN
    PERFORM refresh_erc8004_stats();
END;
$$ LANGUAGE plpgsql;

-- Add index on materialized views for faster queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_agent_reputation_trust
ON mv_erc8004_agent_reputation (trust_level, reputation_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_agent_stats_trust
ON mv_erc8004_agent_stats (trust_level, reputation_score DESC, status);

-- Analyze tables for query planner
ANALYZE erc8004_agents;
ANALYZE erc8004_reputation;
ANALYZE erc8004_agent_payments;
ANALYZE erc8004_agent_metadata;
ANALYZE mv_erc8004_agent_reputation;
ANALYZE mv_erc8004_agent_stats;

-- Query performance improvements
-- Create partial indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_base_active
ON erc8004_agents (created_at DESC)
WHERE chain = 'base' AND status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_owner
ON erc8004_agents (LOWER(owner_address), status);

-- Add comments
COMMENT ON INDEX idx_erc8004_agents_active_covering IS 'Covering index for active agent queries with common filters';
COMMENT ON INDEX idx_erc8004_reputation_agent_created IS 'Index for reputation timeline queries';
COMMENT ON INDEX idx_erc8004_agent_payments_agent IS 'Index for agent payment history';
COMMENT ON FUNCTION refresh_erc8004_stats() IS 'Smart materialized view refresh - only refreshes if stale';
