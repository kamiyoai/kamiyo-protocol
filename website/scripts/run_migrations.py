#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Database Migration Runner
Runs all SQL migrations in order
"""

import os
import sys
import psycopg2
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Colors
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'


def get_database_url():
    """Get database URL from environment"""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)
    return db_url


def parse_postgres_url(url):
    """Parse PostgreSQL URL into connection parameters"""
    # postgresql://user:password@host:port/database
    if not url.startswith('postgresql://'):
        logger.error(f"Invalid PostgreSQL URL: {url}")
        sys.exit(1)

    url = url.replace('postgresql://', '')
    if '@' in url:
        auth, host_db = url.split('@')
        user, password = auth.split(':', 1)
    else:
        logger.error("No authentication in DATABASE_URL")
        sys.exit(1)

    host_port, database = host_db.split('/')
    if ':' in host_port:
        host, port = host_port.split(':')
    else:
        host = host_port
        port = '5432'

    return {
        'user': user,
        'password': password,
        'host': host,
        'port': port,
        'database': database
    }


def create_migrations_table(conn):
    """Create migrations tracking table if it doesn't exist"""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        logger.info("Migrations table ready")


def get_applied_migrations(conn):
    """Get list of already applied migrations"""
    with conn.cursor() as cur:
        cur.execute("SELECT migration_name FROM schema_migrations ORDER BY id;")
        return [row[0] for row in cur.fetchall()]


def get_pending_migrations(migrations_dir, applied):
    """Get list of pending migrations"""
    all_migrations = sorted([
        f.name for f in Path(migrations_dir).glob('*.sql')
        if f.is_file()
    ])

    pending = [m for m in all_migrations if m not in applied]
    return pending


def run_migration(conn, migration_path, migration_name):
    """Run a single migration"""
    logger.info(f"{YELLOW}Running:{NC} {migration_name}")

    try:
        with open(migration_path, 'r') as f:
            sql = f.read()

        with conn.cursor() as cur:
            # Execute migration SQL
            cur.execute(sql)

            # Record migration
            cur.execute(
                "INSERT INTO schema_migrations (migration_name) VALUES (%s);",
                (migration_name,)
            )

            conn.commit()

        logger.info(f"{GREEN}✓ Success:{NC} {migration_name}")
        return True

    except Exception as e:
        conn.rollback()
        logger.error(f"{RED}✗ Failed:{NC} {migration_name}")
        logger.error(f"Error: {e}")
        return False


def main():
    print("="*60)
    print("KAMIYO DATABASE MIGRATION RUNNER")
    print("="*60)
    print()

    # Get database connection
    db_url = get_database_url()
    logger.info(f"Database: {db_url.split('@')[1] if '@' in db_url else 'unknown'}")

    try:
        # Connect to database
        if db_url.startswith('postgresql://'):
            conn_params = parse_postgres_url(db_url)
            conn = psycopg2.connect(**conn_params)
        else:
            logger.error("Only PostgreSQL supported for migrations")
            sys.exit(1)

        logger.info(f"{GREEN}✓ Connected to database{NC}")

        # Create migrations table
        create_migrations_table(conn)

        # Get migrations
        migrations_dir = Path(__file__).parent.parent / 'database' / 'migrations'
        if not migrations_dir.exists():
            logger.error(f"Migrations directory not found: {migrations_dir}")
            sys.exit(1)

        applied = get_applied_migrations(conn)
        pending = get_pending_migrations(migrations_dir, applied)

        logger.info(f"\nApplied migrations: {len(applied)}")
        logger.info(f"Pending migrations: {len(pending)}\n")

        if not pending:
            logger.info(f"{GREEN}✓ All migrations already applied{NC}")
            sys.exit(0)

        # Run pending migrations
        print("Pending migrations:")
        for migration in pending:
            print(f"  • {migration}")
        print()

        # Confirm
        if '--auto' not in sys.argv:
            confirm = input("Run these migrations? (y/n): ")
            if confirm.lower() != 'y':
                logger.info("Migration cancelled")
                sys.exit(0)

        # Run each migration
        success_count = 0
        for migration in pending:
            migration_path = migrations_dir / migration
            if run_migration(conn, migration_path, migration):
                success_count += 1
            else:
                logger.error(f"\n{RED}Migration failed. Stopping.{NC}")
                break

        # Summary
        print()
        print("="*60)
        print(f"Migrations applied: {success_count}/{len(pending)}")
        if success_count == len(pending):
            print(f"{GREEN}✓ All migrations successful{NC}")
        print("="*60)

        conn.close()

        # Exit code
        sys.exit(0 if success_count == len(pending) else 1)

    except Exception as e:
        logger.error(f"{RED}Database connection failed: {e}{NC}")
        sys.exit(1)


if __name__ == "__main__":
    main()
