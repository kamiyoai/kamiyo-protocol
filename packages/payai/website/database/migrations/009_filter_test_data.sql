-- Migration: Filter out test data from views
-- Version: 1.1
-- Date: 2025-10-10
-- Purpose: Exclude test protocols and categories from all views

-- Drop existing views
DROP VIEW IF EXISTS v_recent_exploits;
DROP VIEW IF EXISTS v_stats_24h;

-- Recreate views with test data filtering
CREATE VIEW v_recent_exploits AS
SELECT
    e.id,
    e.tx_hash,
    e.chain,
    e.protocol,
    e.amount_usd,
    e.timestamp,
    e.source,
    e.source_url,
    e.category,
    e.description,
    e.recovery_status
FROM exploits e
WHERE LOWER(e.protocol) NOT LIKE '%test%'
AND LOWER(COALESCE(e.category, '')) NOT LIKE '%test%'
ORDER BY e.timestamp DESC
LIMIT 100;

CREATE VIEW v_stats_24h AS
SELECT
    COUNT(*) as total_exploits,
    SUM(amount_usd) as total_loss_usd,
    COUNT(DISTINCT chain) as chains_affected,
    COUNT(DISTINCT protocol) as protocols_affected
FROM exploits
WHERE timestamp >= datetime('now', '-1 day')
AND LOWER(protocol) NOT LIKE '%test%'
AND LOWER(COALESCE(category, '')) NOT LIKE '%test%';
