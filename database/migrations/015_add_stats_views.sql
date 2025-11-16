-- Add missing stats views for production
-- These were in 001_initial_schema.sql but not in init_postgres.sql

-- Add v_stats_24h view for 24-hour statistics
CREATE OR REPLACE VIEW v_stats_24h AS
SELECT
    COUNT(*) as total_exploits,
    COALESCE(SUM(amount_usd), 0) as total_loss_usd,
    COUNT(DISTINCT chain) as chains_affected,
    COUNT(DISTINCT protocol) as protocols_affected
FROM exploits
WHERE date >= CURRENT_TIMESTAMP - INTERVAL '1 day';

-- Add v_recent_exploits view for recent exploits
CREATE OR REPLACE VIEW v_recent_exploits AS
SELECT
    e.id,
    e.tx_hash,
    e.chain,
    e.protocol,
    e.amount_usd,
    e.date as timestamp,
    e.source,
    e.source_url,
    e.exploit_type as category,
    e.description,
    NULL as recovery_status
FROM exploits e
ORDER BY e.date DESC
LIMIT 100;

-- Add v_source_health view if sources table has the right columns
-- This view will fail gracefully if the columns don't exist
DO $$
BEGIN
    -- Check if sources table has required columns
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'sources'
        AND column_name = 'fetch_count'
    ) THEN
        EXECUTE '
            CREATE OR REPLACE VIEW v_source_health AS
            SELECT
                name,
                last_fetch,
                fetch_count,
                error_count,
                ROUND((1.0 * (fetch_count - error_count) / NULLIF(fetch_count, 0)) * 100, 2) as success_rate,
                is_active
            FROM sources
            WHERE fetch_count > 0
        ';
    END IF;
END $$;
