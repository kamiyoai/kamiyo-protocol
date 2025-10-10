-- =====================================================
-- Migration 005: Performance Indexes and Query Optimization
-- Created: 2025-10-07 (Day 13)
-- Description: Comprehensive indexes for production performance optimization
-- =====================================================

-- =====================================================
-- EXPLOITS TABLE INDEXES
-- =====================================================

-- Composite index for chain + severity filtering with time sorting
-- Optimizes: GET /exploits?chain=ethereum&severity=critical
CREATE INDEX IF NOT EXISTS idx_exploits_chain_severity_created
    ON exploits(chain, severity, created_at DESC)
    WHERE severity IS NOT NULL;

COMMENT ON INDEX idx_exploits_chain_severity_created IS 'Optimizes chain + severity filtering with time sorting';

-- Composite index for source tracking and publishing date
-- Optimizes: Source-based queries with date filtering
CREATE INDEX IF NOT EXISTS idx_exploits_source_published
    ON exploits(source_id, published_at DESC)
    WHERE source_id IS NOT NULL;

COMMENT ON INDEX idx_exploits_source_published IS 'Optimizes source-based queries with date filtering';

-- Partial index for high-value exploits (> $1M)
-- Optimizes: Queries filtering for major exploits
CREATE INDEX IF NOT EXISTS idx_exploits_high_value
    ON exploits(amount_usd DESC, created_at DESC)
    WHERE amount_usd > 1000000;

COMMENT ON INDEX idx_exploits_high_value IS 'Partial index for exploits over $1M';

-- Partial index for recent exploits (last 30 days)
-- Optimizes: Dashboard queries for recent activity
CREATE INDEX IF NOT EXISTS idx_exploits_recent
    ON exploits(created_at DESC, chain, amount_usd)
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days';

COMMENT ON INDEX idx_exploits_recent IS 'Partial index for exploits in last 30 days';

-- GIN index for JSONB metadata searches
-- Optimizes: Queries searching within metadata JSONB column
CREATE INDEX IF NOT EXISTS idx_exploits_metadata_gin
    ON exploits USING GIN(metadata)
    WHERE metadata IS NOT NULL;

COMMENT ON INDEX idx_exploits_metadata_gin IS 'GIN index for fast JSONB metadata searches';

-- Full-text search index for exploit descriptions
-- Optimizes: Full-text search on description and protocol
CREATE INDEX IF NOT EXISTS idx_exploits_fulltext
    ON exploits USING GIN(to_tsvector('english',
        COALESCE(description, '') || ' ' ||
        COALESCE(protocol, '') || ' ' ||
        COALESCE(category, '')
    ));

COMMENT ON INDEX idx_exploits_fulltext IS 'Full-text search index for descriptions and protocols';

-- Covering index for exploit listing (includes commonly fetched columns)
-- Optimizes: SELECT queries that don't need all columns
CREATE INDEX IF NOT EXISTS idx_exploits_covering
    ON exploits(created_at DESC, id, chain, protocol, amount_usd, severity)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_exploits_covering IS 'Covering index for common exploit listing queries';

-- =====================================================
-- SUBSCRIPTIONS TABLE INDEXES
-- =====================================================

-- Composite index for active user subscriptions lookup
-- Optimizes: SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_period
    ON subscriptions(user_id, status, current_period_end)
    WHERE status IN ('active', 'trialing');

COMMENT ON INDEX idx_subscriptions_user_status_period IS 'Optimizes active subscription lookups';

-- Partial index for expiring subscriptions (next 7 days)
-- Optimizes: Billing reminder queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiring_soon
    ON subscriptions(current_period_end, user_id, tier)
    WHERE status = 'active'
    AND cancel_at_period_end = FALSE
    AND current_period_end <= CURRENT_TIMESTAMP + INTERVAL '7 days';

COMMENT ON INDEX idx_subscriptions_expiring_soon IS 'Partial index for subscriptions expiring within 7 days';

-- Index for cancelled subscriptions (churn analysis)
-- Optimizes: Churn analysis queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancelled
    ON subscriptions(cancelled_at DESC, tier, user_id)
    WHERE cancelled_at IS NOT NULL;

COMMENT ON INDEX idx_subscriptions_cancelled IS 'Index for cancelled subscriptions and churn analysis';

-- Index for Stripe webhook processing
-- Optimizes: Finding subscriptions by Stripe ID
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_lookup
    ON subscriptions(stripe_subscription_id, stripe_customer_id);

COMMENT ON INDEX idx_subscriptions_stripe_lookup IS 'Fast Stripe subscription lookups';

-- =====================================================
-- USAGE_HISTORY TABLE INDEXES (if not partitioned)
-- =====================================================

-- Composite index for user usage tracking
-- Optimizes: Rate limiting checks and usage analytics
CREATE INDEX IF NOT EXISTS idx_usage_user_timestamp
    ON usage_history(user_id, timestamp DESC)
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

COMMENT ON INDEX idx_usage_user_timestamp IS 'Optimizes user usage tracking for last 24 hours';

-- Index for endpoint performance analysis
-- Optimizes: Per-endpoint performance queries
CREATE INDEX IF NOT EXISTS idx_usage_endpoint_stats
    ON usage_history(endpoint, timestamp DESC, response_time_ms)
    WHERE status_code < 500;

COMMENT ON INDEX idx_usage_endpoint_stats IS 'Optimizes endpoint performance analysis';

-- Partial index for failed requests
-- Optimizes: Error tracking and debugging
CREATE INDEX IF NOT EXISTS idx_usage_errors
    ON usage_history(timestamp DESC, user_id, endpoint, status_code)
    WHERE status_code >= 400;

COMMENT ON INDEX idx_usage_errors IS 'Partial index for failed requests (4xx, 5xx)';

-- =====================================================
-- WEBHOOK_EVENTS TABLE INDEXES
-- =====================================================

-- Composite index for webhook event processing
-- Optimizes: SELECT * FROM webhook_events WHERE event_type = ? AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_status_created
    ON webhook_events(event_type, status, created_at)
    WHERE status IN ('pending', 'processing');

COMMENT ON INDEX idx_webhook_events_type_status_created IS 'Optimizes webhook event queue processing';

-- Index for retry logic and failed event tracking
-- Optimizes: Finding failed events for retry
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
    ON webhook_events(retry_count, next_retry_at)
    WHERE status = 'failed' AND retry_count < 3;

COMMENT ON INDEX idx_webhook_events_retry IS 'Optimizes webhook retry queue';

-- Index for event delivery tracking
-- Optimizes: Webhook delivery analytics
CREATE INDEX IF NOT EXISTS idx_webhook_events_delivered
    ON webhook_events(delivered_at DESC, event_type)
    WHERE status = 'delivered';

COMMENT ON INDEX idx_webhook_events_delivered IS 'Index for successful webhook deliveries';

-- =====================================================
-- CUSTOMERS TABLE INDEXES (Stripe Integration)
-- =====================================================

-- Composite index for customer lookup
-- Optimizes: Finding customers by user_id or Stripe ID
CREATE INDEX IF NOT EXISTS idx_customers_user_stripe
    ON customers(user_id, stripe_customer_id);

COMMENT ON INDEX idx_customers_user_stripe IS 'Fast customer lookups by user or Stripe ID';

-- Index for customer email searches
-- Optimizes: Customer support queries
CREATE INDEX IF NOT EXISTS idx_customers_email_lower
    ON customers(LOWER(email));

COMMENT ON INDEX idx_customers_email_lower IS 'Case-insensitive email search';

-- =====================================================
-- PAYMENTS_HISTORY TABLE INDEXES
-- =====================================================

-- Composite index for customer payment history
-- Optimizes: SELECT * FROM payments_history WHERE customer_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_payments_customer_created
    ON payments_history(customer_id, created_at DESC);

COMMENT ON INDEX idx_payments_customer_created IS 'Optimizes customer payment history queries';

-- Index for successful payments (revenue analytics)
-- Optimizes: Revenue calculation queries
CREATE INDEX IF NOT EXISTS idx_payments_succeeded
    ON payments_history(created_at DESC, amount, currency)
    WHERE status = 'succeeded';

COMMENT ON INDEX idx_payments_succeeded IS 'Partial index for successful payments';

-- Index for failed payments (monitoring)
-- Optimizes: Failed payment tracking
CREATE INDEX IF NOT EXISTS idx_payments_failed
    ON payments_history(created_at DESC, customer_id, subscription_id)
    WHERE status IN ('failed', 'requires_payment_method');

COMMENT ON INDEX idx_payments_failed IS 'Partial index for failed payments';

-- =====================================================
-- SUBSCRIPTION_EVENTS TABLE INDEXES
-- =====================================================

-- Composite index for user event history
-- Optimizes: Audit trail queries per user
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_created
    ON subscription_events(user_id, created_at DESC);

COMMENT ON INDEX idx_subscription_events_user_created IS 'Optimizes user subscription event history';

-- Index for event type analysis
-- Optimizes: Analytics on subscription events (upgrades, cancellations, etc.)
CREATE INDEX IF NOT EXISTS idx_subscription_events_type_created
    ON subscription_events(event_type, created_at DESC);

COMMENT ON INDEX idx_subscription_events_type_created IS 'Optimizes event type analysis';

-- GIN index for metadata searches in events
-- Optimizes: Searching within event metadata
CREATE INDEX IF NOT EXISTS idx_subscription_events_metadata
    ON subscription_events USING GIN(metadata)
    WHERE metadata IS NOT NULL;

COMMENT ON INDEX idx_subscription_events_metadata IS 'GIN index for event metadata searches';

-- =====================================================
-- API_KEYS TABLE INDEXES
-- =====================================================

-- Composite index for active API key lookups
-- Optimizes: API key authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active
    ON api_keys(key_hash, is_active)
    WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

COMMENT ON INDEX idx_api_keys_hash_active IS 'Fast active API key authentication';

-- Index for user key management
-- Optimizes: Listing user's API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_created
    ON api_keys(user_id, created_at DESC)
    WHERE is_active = TRUE;

COMMENT ON INDEX idx_api_keys_user_created IS 'Optimizes user API key listing';

-- =====================================================
-- SOURCES TABLE INDEXES
-- =====================================================

-- Index for active source monitoring
-- Optimizes: Source health check queries
CREATE INDEX IF NOT EXISTS idx_sources_active_lastfetch
    ON sources(is_active, last_fetch DESC)
    WHERE is_active = TRUE;

COMMENT ON INDEX idx_sources_active_lastfetch IS 'Optimizes active source monitoring';

-- =====================================================
-- MATERIALIZED VIEWS FOR EXPENSIVE AGGREGATIONS
-- =====================================================

-- Materialized view for exploit statistics (refresh every 5 minutes)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_exploit_stats_hourly AS
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    chain,
    COUNT(*) as exploit_count,
    SUM(amount_usd) as total_amount_usd,
    AVG(amount_usd) as avg_amount_usd,
    MAX(amount_usd) as max_amount_usd,
    COUNT(DISTINCT protocol) as unique_protocols
FROM exploits
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), chain;

CREATE UNIQUE INDEX idx_mv_exploit_stats_hour_chain
    ON mv_exploit_stats_hourly(hour, chain);

COMMENT ON MATERIALIZED VIEW mv_exploit_stats_hourly IS 'Hourly exploit statistics (refresh every 5 min)';

-- Materialized view for subscription revenue analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_subscription_revenue_daily AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    tier,
    COUNT(*) as subscription_count,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
    COUNT(DISTINCT user_id) as unique_users
FROM user_subscriptions
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', created_at), tier;

CREATE UNIQUE INDEX idx_mv_subscription_revenue_day_tier
    ON mv_subscription_revenue_daily(day, tier);

COMMENT ON MATERIALIZED VIEW mv_subscription_revenue_daily IS 'Daily subscription revenue metrics';

-- Materialized view for API usage statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_api_usage_daily AS
SELECT
    DATE_TRUNC('day', timestamp) as day,
    tier,
    endpoint,
    COUNT(*) as request_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    COUNT(*) FILTER (WHERE status_code < 400) as success_count,
    COUNT(*) FILTER (WHERE status_code >= 400) as error_count
FROM usage_history
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp), tier, endpoint;

CREATE UNIQUE INDEX idx_mv_api_usage_day_tier_endpoint
    ON mv_api_usage_daily(day, tier, endpoint);

COMMENT ON MATERIALIZED VIEW mv_api_usage_daily IS 'Daily API usage statistics per tier and endpoint';

-- =====================================================
-- INDEX MAINTENANCE FUNCTIONS
-- =====================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_exploit_stats_hourly;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_subscription_revenue_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_api_usage_daily;

    RAISE NOTICE 'Materialized views refreshed successfully';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_materialized_views IS 'Refresh all materialized views (run every 5 minutes)';

-- Function to rebuild all indexes
CREATE OR REPLACE FUNCTION reindex_all_tables()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('REINDEX TABLE %I.%I', table_record.schemaname, table_record.tablename);
        RAISE NOTICE 'Reindexed table: %.%', table_record.schemaname, table_record.tablename;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reindex_all_tables IS 'Rebuild all indexes (run during maintenance window)';

-- Function to analyze table statistics
CREATE OR REPLACE FUNCTION analyze_all_tables()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ANALYZE %I.%I', table_record.schemaname, table_record.tablename);
        RAISE NOTICE 'Analyzed table: %.%', table_record.schemaname, table_record.tablename;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analyze_all_tables IS 'Update table statistics for query planner';

-- Function to get index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    idx_scan BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT,
    size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::TEXT,
        s.tablename::TEXT,
        s.indexrelname::TEXT,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        ROUND(pg_relation_size(s.indexrelid)::NUMERIC / (1024 * 1024), 2) as size_mb
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.schemaname = 'public'
    ORDER BY s.idx_scan ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_index_usage_stats IS 'Get index usage statistics for optimization';

-- Function to find unused indexes
CREATE OR REPLACE FUNCTION find_unused_indexes()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    index_size_mb NUMERIC,
    idx_scan BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::TEXT,
        s.tablename::TEXT,
        s.indexrelname::TEXT,
        ROUND(pg_relation_size(s.indexrelid)::NUMERIC / (1024 * 1024), 2) as index_size_mb,
        s.idx_scan
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.schemaname = 'public'
    AND s.idx_scan = 0
    AND s.indexrelname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(s.indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_unused_indexes IS 'Find indexes that are never used (candidates for removal)';

-- Function to get table bloat information
CREATE OR REPLACE FUNCTION get_table_bloat()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    actual_size_mb NUMERIC,
    estimated_bloat_mb NUMERIC,
    bloat_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        schemaname::TEXT,
        tablename::TEXT,
        ROUND(pg_total_relation_size(schemaname||'.'||tablename)::NUMERIC / (1024 * 1024), 2) as actual_size_mb,
        ROUND(pg_total_relation_size(schemaname||'.'||tablename)::NUMERIC * 0.2 / (1024 * 1024), 2) as estimated_bloat_mb,
        ROUND(20.0, 2) as bloat_percentage
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_table_bloat IS 'Estimate table bloat (simplified calculation)';

-- =====================================================
-- VACUUM AND ANALYZE SCHEDULING
-- =====================================================

-- Function to perform maintenance on all tables
CREATE OR REPLACE FUNCTION maintenance_vacuum_analyze()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        -- VACUUM ANALYZE each table
        EXECUTE format('VACUUM ANALYZE %I.%I', table_record.schemaname, table_record.tablename);
        RAISE NOTICE 'VACUUM ANALYZE completed for: %.%', table_record.schemaname, table_record.tablename;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION maintenance_vacuum_analyze IS 'Run VACUUM ANALYZE on all tables';

-- =====================================================
-- QUERY EXECUTION TIME TRACKING
-- =====================================================

-- Table to log slow queries (populated by pg_stat_statements extension)
CREATE TABLE IF NOT EXISTS slow_query_log (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    query_hash TEXT,
    execution_time_ms NUMERIC,
    calls INTEGER DEFAULT 1,
    rows_returned BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_slow_query_log_hash ON slow_query_log(query_hash);
CREATE INDEX idx_slow_query_log_time ON slow_query_log(execution_time_ms DESC);
CREATE INDEX idx_slow_query_log_created ON slow_query_log(created_at DESC);

COMMENT ON TABLE slow_query_log IS 'Log of slow queries for analysis';

-- =====================================================
-- MIGRATION COMPLETION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 005: Performance Indexes COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Created Indexes:';
    RAISE NOTICE '  - Exploits: 7 new indexes (composite, partial, GIN, full-text)';
    RAISE NOTICE '  - Subscriptions: 4 new indexes';
    RAISE NOTICE '  - Usage History: 3 new indexes';
    RAISE NOTICE '  - Webhook Events: 3 new indexes';
    RAISE NOTICE '  - Customers: 2 new indexes';
    RAISE NOTICE '  - Payments: 3 new indexes';
    RAISE NOTICE '  - API Keys: 2 new indexes';
    RAISE NOTICE '  - Other tables: Additional indexes';
    RAISE NOTICE '';
    RAISE NOTICE 'Created Materialized Views:';
    RAISE NOTICE '  - mv_exploit_stats_hourly';
    RAISE NOTICE '  - mv_subscription_revenue_daily';
    RAISE NOTICE '  - mv_api_usage_daily';
    RAISE NOTICE '';
    RAISE NOTICE 'Created Functions:';
    RAISE NOTICE '  - refresh_materialized_views()';
    RAISE NOTICE '  - reindex_all_tables()';
    RAISE NOTICE '  - analyze_all_tables()';
    RAISE NOTICE '  - get_index_usage_stats()';
    RAISE NOTICE '  - find_unused_indexes()';
    RAISE NOTICE '  - get_table_bloat()';
    RAISE NOTICE '  - maintenance_vacuum_analyze()';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Schedule refresh_materialized_views() every 5 minutes';
    RAISE NOTICE '  2. Schedule maintenance_vacuum_analyze() nightly';
    RAISE NOTICE '  3. Run get_index_usage_stats() weekly to monitor index usage';
    RAISE NOTICE '  4. Check find_unused_indexes() monthly for cleanup';
    RAISE NOTICE '';
END $$;
