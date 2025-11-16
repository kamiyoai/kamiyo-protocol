-- Migration: Fix sources table schema
-- Adds tracking columns needed by aggregator orchestrator

-- Add missing columns if they don't exist
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS last_fetch TIMESTAMP,
    ADD COLUMN IF NOT EXISTS fetch_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;

-- Rename 'active' to 'is_active' if needed
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='sources' AND column_name='active') THEN
        ALTER TABLE sources RENAME COLUMN active TO is_active;
    END IF;
END $$;

-- Add is_active if it doesn't exist
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sources_is_active ON sources(is_active);
CREATE INDEX IF NOT EXISTS idx_sources_last_fetch ON sources(last_fetch DESC);

-- Create or replace view for source health monitoring
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
ORDER BY success_rate DESC;

-- Update existing sources to have default values
UPDATE sources
SET
    fetch_count = COALESCE(fetch_count, 0),
    error_count = COALESCE(error_count, 0),
    is_active = COALESCE(is_active, true)
WHERE fetch_count IS NULL OR error_count IS NULL OR is_active IS NULL;
