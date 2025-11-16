#!/usr/bin/env python3
"""
Initialize Kamiyo PostgreSQL database on Render
"""
import psycopg2
from psycopg2 import sql

# Database connection string
DATABASE_URL = "postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai"

# SQL initialization script
INIT_SQL = """
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
"""

def main():
    print("🔌 Connecting to PostgreSQL database...")

    try:
        # Connect to database
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        cursor = conn.cursor()

        print("✅ Connected successfully!")
        print("📝 Executing initialization SQL...")

        # Execute SQL script
        cursor.execute(INIT_SQL)

        print("✅ Database initialized successfully!")

        # Verify tables were created
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)

        tables = cursor.fetchall()
        print(f"\n📊 Created tables:")
        for table in tables:
            print(f"   - {table[0]}")

        # Count initial data
        cursor.execute("SELECT COUNT(*) FROM chains;")
        chain_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM sources;")
        source_count = cursor.fetchone()[0]

        print(f"\n📈 Initial data:")
        print(f"   - {chain_count} chains")
        print(f"   - {source_count} sources")

        cursor.close()
        conn.close()

        print("\n🎉 Database ready for production!")

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())
