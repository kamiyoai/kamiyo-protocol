-- Kamiyo PostgreSQL Production Database Initialization
-- Run this script on your Render PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create exploits table (for FastAPI backend)
CREATE TABLE IF NOT EXISTS exploits (
    id SERIAL PRIMARY KEY,
    protocol VARCHAR(255),
    chain VARCHAR(100),
    exploit_type VARCHAR(100),
    date TIMESTAMP,
    amount_usd DECIMAL(20, 2),
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    source VARCHAR(255),
    source_url TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chains table
CREATE TABLE IF NOT EXISTS chains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sources table
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS idx_exploits_chain ON exploits(chain);
CREATE INDEX IF NOT EXISTS idx_exploits_date ON exploits(date DESC);
CREATE INDEX IF NOT EXISTS idx_exploits_protocol ON exploits(protocol);
CREATE INDEX IF NOT EXISTS idx_exploits_amount ON exploits(amount_usd DESC);

-- Insert some initial chains (optional)
INSERT INTO chains (name) VALUES
    ('Ethereum'),
    ('BSC'),
    ('Polygon'),
    ('Arbitrum'),
    ('Optimism'),
    ('Avalanche'),
    ('Solana')
ON CONFLICT (name) DO NOTHING;

-- Insert some initial sources (optional)
INSERT INTO sources (name, active) VALUES
    ('Rekt News', true),
    ('PeckShield', true),
    ('BlockSec', true),
    ('Certik', true),
    ('SlowMist', true)
ON CONFLICT (name) DO NOTHING;

-- Grant permissions (adjust username as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kamiyo;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kamiyo;

COMMENT ON TABLE exploits IS 'Blockchain exploit intelligence data';
COMMENT ON TABLE chains IS 'Supported blockchain networks';
COMMENT ON TABLE sources IS 'Data aggregation sources';
