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

        # ID mapping for foreign key updates: {table: {old_id: new_id}}
        self.id_mappings = {}

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
        """Migrate exploits table with ID mapping for foreign keys"""

        # Fetch from SQLite
        sqlite_cursor = self.sqlite_conn.cursor()
        sqlite_cursor.execute("SELECT * FROM exploits ORDER BY id")
        rows = sqlite_cursor.fetchall()

        if not rows:
            logger.info("   No exploits to migrate")
            return 0

        # Insert into PostgreSQL one by one to capture new IDs
        postgres_cursor = self.postgres_conn.cursor()
        id_mapping = {}
        migrated_count = 0

        insert_query = """
            INSERT INTO exploits
            (tx_hash, chain, protocol, amount_usd, timestamp, source,
             source_url, category, description, recovery_status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tx_hash) DO NOTHING
            RETURNING id
        """

        for row in rows:
            old_id = row['id']
            values = (
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
            )

            try:
                postgres_cursor.execute(insert_query, values)
                result = postgres_cursor.fetchone()

                if result:
                    new_id = result[0]
                    id_mapping[old_id] = new_id
                    migrated_count += 1
                    logger.debug(f"   Mapped exploit ID {old_id} -> {new_id}")
                else:
                    # Conflict - get existing ID
                    postgres_cursor.execute(
                        "SELECT id FROM exploits WHERE tx_hash = %s",
                        (row['tx_hash'],)
                    )
                    existing = postgres_cursor.fetchone()
                    if existing:
                        id_mapping[old_id] = existing[0]
                        logger.debug(f"   Duplicate exploit, mapped ID {old_id} -> {existing[0]}")

            except Exception as e:
                logger.error(f"   Failed to migrate exploit {old_id}: {e}")
                continue

        self.postgres_conn.commit()

        # Store mapping for foreign key updates
        self.id_mappings['exploits'] = id_mapping
        logger.info(f"   Created ID mapping for {len(id_mapping)} exploits")

        postgres_cursor.close()
        return migrated_count

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
        """Migrate alerts_sent table with foreign key mapping"""

        try:
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute("SELECT * FROM alerts_sent ORDER BY id")
            rows = sqlite_cursor.fetchall()

            if not rows:
                logger.info("   No alerts to migrate")
                return 0

            # Get exploit ID mapping
            exploit_mapping = self.id_mappings.get('exploits', {})
            if not exploit_mapping:
                logger.warning("   No exploit ID mapping available, skipping alerts")
                return 0

            postgres_cursor = self.postgres_conn.cursor()
            migrated_count = 0
            skipped_count = 0

            insert_query = """
                INSERT INTO alerts_sent
                (exploit_id, channel, recipient, sent_at)
                VALUES (%s, %s, %s, %s)
            """

            for row in rows:
                old_exploit_id = row['exploit_id']

                # Map old exploit ID to new exploit ID
                new_exploit_id = exploit_mapping.get(old_exploit_id)

                if not new_exploit_id:
                    logger.warning(f"   Skipping alert: exploit ID {old_exploit_id} not found in mapping")
                    skipped_count += 1
                    continue

                values = (
                    new_exploit_id,
                    row['channel'],
                    row['recipient'],
                    row['sent_at'] or datetime.now()
                )

                try:
                    postgres_cursor.execute(insert_query, values)
                    migrated_count += 1
                except Exception as e:
                    logger.error(f"   Failed to migrate alert: {e}")
                    continue

            self.postgres_conn.commit()
            postgres_cursor.close()

            if skipped_count > 0:
                logger.warning(f"   Skipped {skipped_count} alerts due to missing exploit mappings")

            return migrated_count

        except sqlite3.OperationalError:
            logger.info("   alerts_sent table doesn't exist, skipping")
            return 0

    def migrate_users(self) -> int:
        """Migrate users table with ID mapping for foreign keys"""

        try:
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute("SELECT * FROM users ORDER BY id")
            rows = sqlite_cursor.fetchall()

            if not rows:
                logger.info("   No users to migrate")
                return 0

            postgres_cursor = self.postgres_conn.cursor()
            id_mapping = {}
            migrated_count = 0

            insert_query = """
                INSERT INTO users
                (email, api_key, tier, created_at, last_request, request_count, password_hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (email) DO NOTHING
                RETURNING id
            """

            for row in rows:
                old_id = row['id']
                # Use placeholder password hash if not exists
                password_hash = row.get('password_hash', '$2b$12$placeholder_hash_needs_reset')

                values = (
                    row['email'],
                    row['api_key'],
                    row['tier'],
                    row['created_at'] or datetime.now(),
                    row.get('last_request'),
                    row.get('request_count', 0),
                    password_hash
                )

                try:
                    postgres_cursor.execute(insert_query, values)
                    result = postgres_cursor.fetchone()

                    if result:
                        new_id = result[0]
                        id_mapping[old_id] = new_id
                        migrated_count += 1
                        logger.debug(f"   Mapped user ID {old_id} -> {new_id}")
                    else:
                        # Conflict - get existing ID
                        postgres_cursor.execute(
                            "SELECT id FROM users WHERE email = %s",
                            (row['email'],)
                        )
                        existing = postgres_cursor.fetchone()
                        if existing:
                            id_mapping[old_id] = existing[0]
                            logger.debug(f"   Duplicate user, mapped ID {old_id} -> {existing[0]}")

                except Exception as e:
                    logger.error(f"   Failed to migrate user {old_id}: {e}")
                    continue

            self.postgres_conn.commit()

            # Store mapping for foreign key updates
            self.id_mappings['users'] = id_mapping
            logger.info(f"   Created ID mapping for {len(id_mapping)} users")

            postgres_cursor.close()
            return migrated_count

        except (sqlite3.OperationalError, KeyError) as e:
            logger.info(f"   users table doesn't exist or format mismatch, skipping: {e}")
            return 0

    def validate_migration(self):
        """
        Comprehensive validation of migration integrity
        Checks: row counts, data integrity, foreign keys, unique constraints
        """

        sqlite_cursor = self.sqlite_conn.cursor()
        postgres_cursor = self.postgres_conn.cursor()

        validation_passed = True

        logger.info("   Running comprehensive validation...")

        # 1. Row count validation
        logger.info("\n   1. Validating row counts...")
        tables_to_check = ['exploits', 'sources']

        for table in tables_to_check:
            try:
                sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table}")
                sqlite_count = sqlite_cursor.fetchone()[0]

                postgres_cursor.execute(f"SELECT COUNT(*) FROM {table}")
                postgres_count = postgres_cursor.fetchone()[0]

                logger.info(f"      {table}: SQLite={sqlite_count}, PostgreSQL={postgres_count}")

                if sqlite_count != postgres_count:
                    logger.warning(f"      ⚠️  {table}: Count mismatch detected")
                    validation_passed = False
                else:
                    logger.info(f"      ✅ {table}: Counts match")

            except Exception as e:
                logger.warning(f"      Could not validate {table}: {e}")

        # 2. Sample data validation (checksums)
        logger.info("\n   2. Validating sample data integrity...")
        try:
            sqlite_cursor.execute("""
                SELECT tx_hash, chain, protocol, amount_usd
                FROM exploits
                ORDER BY RANDOM()
                LIMIT 100
            """)
            samples = sqlite_cursor.fetchall()

            mismatches = 0
            for row in samples:
                tx_hash, chain, protocol, amount_usd = row

                postgres_cursor.execute("""
                    SELECT chain, protocol, amount_usd
                    FROM exploits
                    WHERE tx_hash = %s
                """, (tx_hash,))
                pg_row = postgres_cursor.fetchone()

                if not pg_row:
                    logger.error(f"      ❌ Missing exploit: {tx_hash}")
                    mismatches += 1
                    validation_passed = False
                elif (pg_row[0] != chain or
                      pg_row[1] != protocol or
                      abs(float(pg_row[2] or 0) - float(amount_usd or 0)) > 0.01):
                    logger.error(f"      ❌ Data mismatch for {tx_hash}")
                    mismatches += 1
                    validation_passed = False

            if mismatches == 0:
                logger.info(f"      ✅ All {len(samples)} samples validated successfully")
            else:
                logger.error(f"      ❌ Found {mismatches} data mismatches")

        except Exception as e:
            logger.error(f"      Sample validation failed: {e}")
            validation_passed = False

        # 3. Foreign key validation
        logger.info("\n   3. Validating foreign key integrity...")
        try:
            # Check alerts_sent -> exploits
            postgres_cursor.execute("""
                SELECT COUNT(*) FROM alerts_sent a
                WHERE NOT EXISTS (
                    SELECT 1 FROM exploits e WHERE e.id = a.exploit_id
                )
            """)
            orphaned_alerts = postgres_cursor.fetchone()[0]

            if orphaned_alerts > 0:
                logger.error(f"      ❌ Found {orphaned_alerts} orphaned alerts")
                validation_passed = False
            else:
                logger.info("      ✅ All alert foreign keys valid")

            # Check alert_preferences -> users
            postgres_cursor.execute("""
                SELECT COUNT(*) FROM alert_preferences ap
                WHERE NOT EXISTS (
                    SELECT 1 FROM users u WHERE u.id = ap.user_id
                )
            """)
            orphaned_prefs = postgres_cursor.fetchone()[0]

            if orphaned_prefs > 0:
                logger.error(f"      ❌ Found {orphaned_prefs} orphaned alert preferences")
                validation_passed = False
            else:
                logger.info("      ✅ All alert preference foreign keys valid")

            # Check payments -> users
            postgres_cursor.execute("""
                SELECT COUNT(*) FROM payments p
                WHERE NOT EXISTS (
                    SELECT 1 FROM users u WHERE u.id = p.user_id
                )
            """)
            orphaned_payments = postgres_cursor.fetchone()[0]

            if orphaned_payments > 0:
                logger.error(f"      ❌ Found {orphaned_payments} orphaned payments")
                validation_passed = False
            else:
                logger.info("      ✅ All payment foreign keys valid")

        except Exception as e:
            logger.warning(f"      Foreign key validation error: {e}")

        # 4. Unique constraint validation
        logger.info("\n   4. Validating unique constraints...")
        try:
            # Check tx_hash uniqueness
            postgres_cursor.execute("""
                SELECT tx_hash, COUNT(*)
                FROM exploits
                GROUP BY tx_hash
                HAVING COUNT(*) > 1
            """)
            duplicate_txs = postgres_cursor.fetchall()

            if duplicate_txs:
                logger.error(f"      ❌ Found {len(duplicate_txs)} duplicate tx_hashes")
                validation_passed = False
            else:
                logger.info("      ✅ All tx_hashes are unique")

            # Check email uniqueness
            postgres_cursor.execute("""
                SELECT email, COUNT(*)
                FROM users
                GROUP BY email
                HAVING COUNT(*) > 1
            """)
            duplicate_emails = postgres_cursor.fetchall()

            if duplicate_emails:
                logger.error(f"      ❌ Found {len(duplicate_emails)} duplicate emails")
                validation_passed = False
            else:
                logger.info("      ✅ All user emails are unique")

        except Exception as e:
            logger.warning(f"      Unique constraint validation error: {e}")

        # 5. ID mapping validation
        logger.info("\n   5. Validating ID mappings...")
        for table, mapping in self.id_mappings.items():
            if mapping:
                logger.info(f"      {table}: {len(mapping)} IDs mapped")
            else:
                logger.warning(f"      {table}: No ID mapping (may be intentional)")

        postgres_cursor.close()

        # Final result
        logger.info("\n   " + "="*50)
        if validation_passed:
            logger.info("   ✅ VALIDATION PASSED - All checks successful")
        else:
            logger.error("   ❌ VALIDATION FAILED - Review errors above")
            raise Exception("Migration validation failed - data integrity issues detected")
        logger.info("   " + "="*50)

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
