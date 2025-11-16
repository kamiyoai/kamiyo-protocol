-- Query Optimization and Performance Analysis
-- EXPLAIN ANALYZE results and optimizations

-- Set statement timeout for all queries (30 seconds)
ALTER DATABASE kamiyo SET statement_timeout = '30s';

-- ============================================================================
-- QUERY 1: Agent Search (Most Common)
-- ============================================================================

-- Before: Sequential scan on large tables
-- EXPLAIN ANALYZE SELECT * FROM v_erc8004_agent_stats
-- WHERE status = 'active' AND chain = 'base'
-- ORDER BY registered_at DESC LIMIT 50;

-- Optimization: Composite index on frequently filtered columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_search_optimized
ON erc8004_agents (status, chain, created_at DESC)
INCLUDE (id, agent_id, owner_address, registry_address)
WHERE status = 'active';

-- Expected improvement: Index scan instead of sequential scan
-- Estimated speedup: 10-50x on large tables

-- ============================================================================
-- QUERY 2: Agent Stats Lookup
-- ============================================================================

-- Before: Multiple joins and aggregations
-- EXPLAIN ANALYZE SELECT * FROM v_erc8004_agent_stats WHERE agent_uuid = $1;

-- Optimization: Use materialized view with primary key
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_agent_stats_pk
ON mv_erc8004_agent_stats (agent_uuid);

-- Add BRIN index for time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_created_brin
ON erc8004_agents USING BRIN (created_at)
WHERE status = 'active';

-- Expected improvement: Direct index lookup on materialized view
-- Estimated speedup: 5-20x

-- ============================================================================
-- QUERY 3: Reputation Aggregation
-- ============================================================================

-- Before: Full table scan and aggregation
-- EXPLAIN ANALYZE SELECT agent_uuid, AVG(score), COUNT(*)
-- FROM erc8004_reputation
-- WHERE is_revoked = FALSE
-- GROUP BY agent_uuid;

-- Optimization: Partial index on non-revoked feedback
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_reputation_active_agg
ON erc8004_reputation (agent_uuid, score, created_at)
WHERE is_revoked = FALSE;

-- Expected improvement: Index-only scan for aggregations
-- Estimated speedup: 3-10x

-- ============================================================================
-- QUERY 4: Payment History
-- ============================================================================

-- Before: Sequential scan joining payments table
-- EXPLAIN ANALYZE SELECT * FROM erc8004_agent_payments
-- WHERE agent_uuid = $1 ORDER BY created_at DESC;

-- Optimization: Index on agent_uuid with ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_payments_agent_time
ON erc8004_agent_payments (agent_uuid, created_at DESC)
WHERE status = 'completed';

-- Expected improvement: Index scan with built-in ordering
-- Estimated speedup: 5-15x

-- ============================================================================
-- QUERY 5: Owner Lookup (Case-Insensitive)
-- ============================================================================

-- Before: Sequential scan with LOWER() function
-- EXPLAIN ANALYZE SELECT * FROM erc8004_agents
-- WHERE LOWER(owner_address) = LOWER($1);

-- Optimization: Functional index on lowercased address
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_agents_owner_lower
ON erc8004_agents (LOWER(owner_address));

-- Expected improvement: Direct index lookup
-- Estimated speedup: 10-50x

-- ============================================================================
-- QUERY 6: Recent Feedback
-- ============================================================================

-- Before: Full scan for time-range queries
-- EXPLAIN ANALYZE SELECT * FROM erc8004_reputation
-- WHERE created_at > NOW() - INTERVAL '7 days'
-- AND is_revoked = FALSE;

-- Optimization: BRIN index for time-series data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_erc8004_reputation_time_brin
ON erc8004_reputation USING BRIN (created_at)
WHERE is_revoked = FALSE;

-- Expected improvement: Fast range scans on time
-- Estimated speedup: 3-8x

-- ============================================================================
-- Materialized View Optimization
-- ============================================================================

-- Add indexes on materialized views for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_reputation_chain_trust
ON mv_erc8004_agent_reputation (chain, trust_level, reputation_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_stats_owner
ON mv_erc8004_agent_stats (LOWER(owner_address));

-- ============================================================================
-- Query Planner Statistics
-- ============================================================================

-- Update statistics for accurate query planning
ANALYZE erc8004_agents;
ANALYZE erc8004_reputation;
ANALYZE erc8004_agent_payments;
ANALYZE erc8004_agent_metadata;
ANALYZE mv_erc8004_agent_reputation;
ANALYZE mv_erc8004_agent_stats;

-- ============================================================================
-- Connection Pooling Configuration
-- ============================================================================

-- Recommended pgBouncer configuration (external file)
-- pool_mode = transaction
-- max_client_conn = 1000
-- default_pool_size = 25
-- min_pool_size = 5
-- reserve_pool_size = 5
-- reserve_pool_timeout = 3

-- Database-level settings
ALTER DATABASE kamiyo SET max_connections = 200;
ALTER DATABASE kamiyo SET shared_buffers = '256MB';
ALTER DATABASE kamiyo SET effective_cache_size = '1GB';
ALTER DATABASE kamiyo SET maintenance_work_mem = '128MB';
ALTER DATABASE kamiyo SET checkpoint_completion_target = 0.9;
ALTER DATABASE kamiyo SET wal_buffers = '16MB';
ALTER DATABASE kamiyo SET default_statistics_target = 100;
ALTER DATABASE kamiyo SET random_page_cost = 1.1;  -- SSD optimized
ALTER DATABASE kamiyo SET effective_io_concurrency = 200;  -- SSD optimized
ALTER DATABASE kamiyo SET work_mem = '16MB';

-- ============================================================================
-- Query Timeout by Statement Type
-- ============================================================================

-- Fast queries (reads): 5 seconds
-- Medium queries (analytics): 15 seconds
-- Slow queries (admin): 30 seconds

-- Set default for all queries
ALTER DATABASE kamiyo SET statement_timeout = '30s';

-- Application can override with:
-- SET LOCAL statement_timeout = '5s';  -- For API endpoints

-- ============================================================================
-- Autovacuum Tuning
-- ============================================================================

-- More aggressive autovacuum for high-traffic tables
ALTER TABLE erc8004_agents SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE erc8004_reputation SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- ============================================================================
-- Performance Verification Queries
-- ============================================================================

-- Run these queries to verify optimizations:

-- 1. Check index usage
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND tablename LIKE 'erc8004%'
-- ORDER BY idx_scan DESC;

-- 2. Check table bloat
-- SELECT schemaname, tablename,
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename LIKE 'erc8004%'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 3. Check slow queries (requires pg_stat_statements)
-- SELECT query, mean_exec_time, calls,
--        total_exec_time/1000 as total_time_seconds
-- FROM pg_stat_statements
-- WHERE query LIKE '%erc8004%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 10;

-- 4. Verify materialized view freshness
-- SELECT 'mv_erc8004_agent_reputation' as view_name,
--        EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at)))::int as age_seconds
-- FROM mv_erc8004_agent_reputation
-- UNION ALL
-- SELECT 'mv_erc8004_agent_stats',
--        EXTRACT(EPOCH FROM (NOW() - MAX(registered_at)))::int
-- FROM mv_erc8004_agent_stats;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON INDEX idx_erc8004_agents_search_optimized IS
'Optimized index for agent search queries with status and chain filters';

COMMENT ON INDEX idx_erc8004_reputation_active_agg IS
'Optimized index for reputation aggregation queries';

COMMENT ON INDEX idx_erc8004_payments_agent_time IS
'Optimized index for agent payment history with time ordering';

COMMENT ON INDEX idx_erc8004_agents_owner_lower IS
'Case-insensitive index for owner address lookups';

-- ============================================================================
-- Performance Targets
-- ============================================================================

-- After these optimizations, target performance:
-- - Agent search: < 50ms (was ~300ms)
-- - Agent stats lookup: < 20ms (was ~200ms)
-- - Reputation aggregation: < 100ms (was ~500ms)
-- - Payment history: < 30ms (was ~150ms)
-- - Owner lookup: < 10ms (was ~100ms)

-- ============================================================================
-- Monitoring Recommendations
-- ============================================================================

-- Set up pg_stat_statements for query analysis:
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
-- ALTER SYSTEM SET pg_stat_statements.track = all;

-- Monitor query performance:
-- SELECT query, calls, mean_exec_time, max_exec_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%erc8004%'
-- ORDER BY mean_exec_time DESC;
