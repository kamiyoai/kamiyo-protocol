-- Migration: Add deduplication tracking columns
-- Purpose: Track exploit verification status and source confidence
-- Date: 2025-10-29

-- Add deduplication columns to exploits table (PostgreSQL)
ALTER TABLE exploits
ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS verified_on_chain BOOLEAN DEFAULT FALSE;

-- Create composite index for efficient deduplication queries
CREATE INDEX IF NOT EXISTS idx_protocol_chain_time
ON exploits(protocol, chain, date);

-- Add comments for documentation
COMMENT ON COLUMN exploits.confidence_score IS 'Confidence score (0-100) based on number of sources and verification';
COMMENT ON COLUMN exploits.source_count IS 'Number of different sources that reported this exploit';
COMMENT ON COLUMN exploits.verified_on_chain IS 'Whether the exploit has been verified on blockchain';
COMMENT ON INDEX idx_protocol_chain_time IS 'Composite index for deduplication queries';
