#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SQLite to PostgreSQL Migration Script
Safely migrates all data from SQLite to PostgreSQL with validation
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import psycopg2
from psycopg2 import extras
import logging
from datetime import datetime
from typing import List, Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class DatabaseMigrator:
    """Migrates data from SQLite to PostgreSQL"""

    def __init__(self, sqlite_path: str, postgres_url: str):
        self.sqlite_path = sqlite_path
        self.postgres_url = postgres_url

        # Connect to SQLite
        self.sqlite_conn = sqlite3.connect(sqlite_path)
        self.sqlite_conn.row_factory = sqlite3.Row

        # Connect to PostgreSQL
        self.postgres_conn = psycopg2.connect(postgres_url)

        logger.info(f"Connected to SQLite: {sqlite_path}")
        logger.info(f"Connected to PostgreSQL")

    def run_migration(self):
        """Execute full migration with validation"""

        logger.info("\n" + "="*60)
        logger.info("Starting SQLite → PostgreSQL Migration")
        logger.info("="*60 + "\n")

        try:
            # Step 1: Apply schema
            logger.info("Step 1: Applying PostgreSQL schema...")
            self.apply_schema()

            # Step 2: Migrate exploits
            logger.info("\nStep 2: Migrating exploits table...")
            exploits_count = self.migrate_exploits()
            logger.info(f"✅ Migrated {exploits_count} exploits")

            # Step 3: Migrate sources
            logger.info("\nStep 3: Migrating sources table...")
            sources_count = self.migrate_sources()
            logger.info(f"✅ Migrated {sources_count} sources")

            # Step 4: Migrate alerts (if any)
            logger.info("\nStep 4: Migrating alerts_sent table...")
            alerts_count = self.migrate_alerts()
            logger.info(f"✅ Migrated {alerts_count} alerts")

            # Step 5: Migrate users (if any)
            logger.info("\nStep 5: Migrating users table...")
            users_count = self.migrate_users()
            logger.info(f"✅ Migrated {users_count} users")

            # Step 6: Validate migration
            logger.info("\nStep 6: Validating migration...")
            self.validate_migration()

            # Step 7: Update sequences
            logger.info("\nStep 7: Updating PostgreSQL sequences...")
            self.update_sequences()

            logger.info("\n" + "="*60)
            logger.info("✅ Migration completed successfully!")
            logger.info("="*60)

            self.print_summary()

        except Exception as e:
            logger.error(f"\n❌ Migration failed: {e}")
            self.postgres_conn.rollback()
            raise

        finally:
            self.sqlite_conn.close()
            self.postgres_conn.close()

    def apply_schema(self):
        """Apply PostgreSQL schema"""

        schema_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'database/migrations/001_initial_schema.sql'
        )

        with open(schema_path, 'r') as f:
            schema_sql = f.read()

        cursor = self.postgres_conn.cursor()
        cursor.execute(schema_sql)
        self.postgres_conn.commit()
        cursor.close()

        logger.info("   Schema applied successfully")

    def migrate_exploits(self) -> int:
        """Migrate exploits table"""

        # Fetch from SQLite
        sqlite_cursor = self.sqlite_conn.cursor()
        sqlite_cursor.execute("SELECT * FROM exploits")
        rows = sqlite_cursor.fetchall()

        if not rows:
            logger.info("   No exploits to migrate")
            return 0

        # Insert into PostgreSQL
        postgres_cursor = self.postgres_conn.cursor()

        insert_query = """
            INSERT INTO exploits
            (tx_hash, chain, protocol, amount_usd, timestamp, source,
             source_url, category, description, recovery_status, created_at, updated_at)
            VALUES %s
            ON CONFLICT (tx_hash) DO NOTHING
        """

        values = []
        for row in rows:
            values.append((
                row['tx_hash'],
                row['chain'],
                row['protocol'],
                row['amount_usd'],
                row['timestamp'],
                row['source'],
                row['source_url'],
                row['category'],
                row['description'],
                row['recovery_status'],
                row['created_at'] or datetime.now(),
                row['updated_at'] or datetime.now()
            ))

        # Batch insert
        extras.execute_values(postgres_cursor, insert_query, values)
        self.postgres_conn.commit()
        postgres_cursor.close()

        return len(values)

    def migrate_sources(self) -> int:
        """Migrate sources table"""

        sqlite_cursor = self.sqlite_conn.cursor()
        sqlite_cursor.execute("SELECT * FROM sources")
        rows = sqlite_cursor.fetchall()

        if not rows:
            logger.info("   No sources to migrate")
            return 0

        postgres_cursor = self.postgres_conn.cursor()

        insert_query = """
            INSERT INTO sources
            (name, url, last_fetch, fetch_count, error_count, is_active, created_at)
            VALUES %s
            ON CONFLICT (name) DO NOTHING
        """

        values = []
        for row in rows:
            values.append((
                row['name'],
                row['url'],
                row['last_fetch'],
                row['fetch_count'],
                row['error_count'],
                bool(row['is_active']),
                row['created_at'] or datetime.now()
            ))

        extras.execute_values(postgres_cursor, insert_query, values)
        self.postgres_conn.commit()
        postgres_cursor.close()

        return len(values)

    def migrate_alerts(self) -> int:
        """Migrate alerts_sent table"""

        try:
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute("SELECT * FROM alerts_sent")
            rows = sqlite_cursor.fetchall()

            if not rows:
                logger.info("   No alerts to migrate")
                return 0

            postgres_cursor = self.postgres_conn.cursor()

            insert_query = """
                INSERT INTO alerts_sent
                (exploit_id, channel, recipient, sent_at)
                VALUES %s
            """

            values = []
            for row in rows:
                values.append((
                    row['exploit_id'],
                    row['channel'],
                    row['recipient'],
                    row['sent_at'] or datetime.now()
                ))

            extras.execute_values(postgres_cursor, insert_query, values)
            self.postgres_conn.commit()
            postgres_cursor.close()

            return len(values)

        except sqlite3.OperationalError:
            logger.info("   alerts_sent table doesn't exist, skipping")
            return 0

    def migrate_users(self) -> int:
        """Migrate users table"""

        try:
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute("SELECT * FROM users")
            rows = sqlite_cursor.fetchall()

            if not rows:
                logger.info("   No users to migrate")
                return 0

            postgres_cursor = self.postgres_conn.cursor()

            insert_query = """
                INSERT INTO users
                (email, api_key, tier, created_at, last_request, request_count)
                VALUES %s
                ON CONFLICT (email) DO NOTHING
            """

            values = []
            for row in rows:
                # Note: password_hash needs to be added manually later for security
                values.append((
                    row['email'],
                    row['api_key'],
                    row['tier'],
                    row['created_at'] or datetime.now(),
                    row.get('last_request'),
                    row.get('request_count', 0)
                ))

            extras.execute_values(postgres_cursor, insert_query, values)
            self.postgres_conn.commit()
            postgres_cursor.close()

            return len(values)

        except (sqlite3.OperationalError, KeyError):
            logger.info("   users table doesn't exist or format mismatch, skipping")
            return 0

    def validate_migration(self):
        """Validate that data migrated correctly"""

        sqlite_cursor = self.sqlite_conn.cursor()
        postgres_cursor = self.postgres_conn.cursor()

        # Count exploits in both databases
        sqlite_cursor.execute("SELECT COUNT(*) FROM exploits")
        sqlite_count = sqlite_cursor.fetchone()[0]

        postgres_cursor.execute("SELECT COUNT(*) FROM exploits")
        postgres_count = postgres_cursor.fetchone()[0]

        logger.info(f"   SQLite exploits: {sqlite_count}")
        logger.info(f"   PostgreSQL exploits: {postgres_count}")

        if sqlite_count != postgres_count:
            logger.warning(f"   ⚠️  Count mismatch! Check for duplicates or errors.")
        else:
            logger.info("   ✅ Exploit counts match")

        # Validate random sample
        sqlite_cursor.execute("SELECT tx_hash, amount_usd FROM exploits LIMIT 5")
        sample = sqlite_cursor.fetchall()

        for row in sample:
            tx_hash = row[0]
            postgres_cursor.execute(
                "SELECT amount_usd FROM exploits WHERE tx_hash = %s",
                (tx_hash,)
            )
            pg_row = postgres_cursor.fetchone()

            if not pg_row:
                logger.error(f"   ❌ Missing exploit: {tx_hash}")
            else:
                logger.debug(f"   ✅ Verified: {tx_hash}")

        postgres_cursor.close()

    def update_sequences(self):
        """Update PostgreSQL sequences to continue from current max ID"""

        cursor = self.postgres_conn.cursor()

        sequences = [
            ('exploits', 'id'),
            ('sources', 'id'),
            ('users', 'id'),
            ('alerts_sent', 'id')
        ]

        for table, id_column in sequences:
            try:
                # Get max ID
                cursor.execute(f"SELECT MAX({id_column}) FROM {table}")
                max_id = cursor.fetchone()[0]

                if max_id:
                    # Update sequence
                    cursor.execute(
                        f"SELECT setval(pg_get_serial_sequence('{table}', '{id_column}'), %s)",
                        (max_id,)
                    )
                    logger.info(f"   Updated {table} sequence to {max_id}")

            except Exception as e:
                logger.warning(f"   Could not update {table} sequence: {e}")

        self.postgres_conn.commit()
        cursor.close()

    def print_summary(self):
        """Print migration summary"""

        cursor = self.postgres_conn.cursor()

        cursor.execute("""
            SELECT
                (SELECT COUNT(*) FROM exploits) as exploits,
                (SELECT COUNT(*) FROM sources) as sources,
                (SELECT COUNT(*) FROM users) as users,
                (SELECT COUNT(DISTINCT chain) FROM exploits) as chains
        """)
        stats = cursor.fetchone()

        print("\n" + "="*60)
        print("Migration Summary:")
        print("="*60)
        print(f"  Total Exploits: {stats[0]}")
        print(f"  Total Sources: {stats[1]}")
        print(f"  Total Users: {stats[2]}")
        print(f"  Chains Tracked: {stats[3]}")
        print("="*60 + "\n")

        cursor.close()


def main():
    """Main migration function"""

    # Get database paths from environment or arguments
    sqlite_path = os.getenv('SQLITE_PATH', 'data/kamiyo.db')
    postgres_url = os.getenv('DATABASE_URL')

    if not postgres_url:
        print("❌ ERROR: DATABASE_URL environment variable required")
        print("\nUsage:")
        print("  export DATABASE_URL='postgresql://user:password@localhost/kamiyo_prod'")
        print("  export SQLITE_PATH='data/kamiyo.db'  # optional")
        print("  python scripts/migrate_to_postgres.py")
        sys.exit(1)

    if not os.path.exists(sqlite_path):
        print(f"❌ ERROR: SQLite database not found: {sqlite_path}")
        sys.exit(1)

    # Confirm migration
    print("\n" + "="*60)
    print("SQLite → PostgreSQL Migration")
    print("="*60)
    print(f"\nSource (SQLite): {sqlite_path}")
    print(f"Target (PostgreSQL): {postgres_url.split('@')[1] if '@' in postgres_url else postgres_url}")
    print("\n⚠️  WARNING: This will overwrite data in PostgreSQL")
    confirm = input("\nProceed with migration? (yes/no): ")

    if confirm.lower() != 'yes':
        print("Migration cancelled")
        sys.exit(0)

    # Run migration
    migrator = DatabaseMigrator(sqlite_path, postgres_url)
    migrator.run_migration()


if __name__ == '__main__':
    main()
