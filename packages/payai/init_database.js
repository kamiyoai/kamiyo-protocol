#!/usr/bin/env node
/**
 * Initialize Kamiyo PostgreSQL database on Render
 */

const { Client } = require('pg');

// Database connection string
const DATABASE_URL = "postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai";

// SQL initialization script
const INIT_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create exploits table
CREATE TABLE IF NOT EXISTS exploits (
    id SERIAL PRIMARY KEY,
    protocol VARCHAR(255),
    chain VARCHAR(100),
    exploit_type VARCHAR(100),
    date TIMESTAMP,
    amount_usd DECIMAL(20, 2),
    tx_hash VARCHAR(255),
    source VARCHAR(255),
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

-- Insert initial chains
INSERT INTO chains (name) VALUES
    ('Ethereum'),
    ('BSC'),
    ('Polygon'),
    ('Arbitrum'),
    ('Optimism'),
    ('Avalanche'),
    ('Solana')
ON CONFLICT (name) DO NOTHING;

-- Insert initial sources
INSERT INTO sources (name, active) VALUES
    ('Rekt News', true),
    ('PeckShield', true),
    ('BlockSec', true),
    ('Certik', true),
    ('SlowMist', true)
ON CONFLICT (name) DO NOTHING;
`;

async function main() {
    console.log('🔌 Connecting to PostgreSQL database...');

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        // Connect to database
        await client.connect();
        console.log('✅ Connected successfully!');
        console.log('📝 Executing initialization SQL...');

        // Execute SQL script
        await client.query(INIT_SQL);
        console.log('✅ Database initialized successfully!');

        // Verify tables were created
        const tablesResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log('\n📊 Created tables:');
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        // Count initial data
        const chainResult = await client.query('SELECT COUNT(*) FROM chains;');
        const sourceResult = await client.query('SELECT COUNT(*) FROM sources;');

        console.log('\n📈 Initial data:');
        console.log(`   - ${chainResult.rows[0].count} chains`);
        console.log(`   - ${sourceResult.rows[0].count} sources`);

        console.log('\n🎉 Database ready for production!');

        await client.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await client.end();
        process.exit(1);
    }
}

main();
