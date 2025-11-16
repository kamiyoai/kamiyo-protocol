-- Migration: Create v_source_health view
-- Purpose: Add source health monitoring view for aggregator health tracking
-- Date: 2025-10-15

-- Create or replace the source health view
CREATE OR REPLACE VIEW v_source_health AS
SELECT
    name,
    last_fetch,
    fetch_count,
    error_count,
    ROUND((1.0 * (fetch_count - error_count) / NULLIF(fetch_count, 0)) * 100, 2) as success_rate,
    is_active
FROM sources
WHERE fetch_count > 0;

-- Grant access to read-only users
GRANT SELECT ON v_source_health TO PUBLIC;

-- Verify view was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name = 'v_source_health'
    ) THEN
        RAISE NOTICE 'View v_source_health created successfully';
    ELSE
        RAISE EXCEPTION 'Failed to create v_source_health view';
    END IF;
END $$;
