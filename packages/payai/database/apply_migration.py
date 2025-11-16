#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Apply database migration
Run specific migration file against production database
"""

import os
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.postgres_manager import get_db

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def apply_migration(migration_file: str):
    """
    Apply a specific migration file to the database

    Args:
        migration_file: Name of migration file (e.g., '002_create_source_health_view.sql')
    """
    migrations_dir = Path(__file__).parent / 'migrations'
    migration_path = migrations_dir / migration_file

    if not migration_path.exists():
        logger.error(f"Migration file not found: {migration_path}")
        return False

    logger.info(f"Applying migration: {migration_file}")
    logger.info(f"Path: {migration_path}")

    # Read migration SQL
    with open(migration_path, 'r') as f:
        migration_sql = f.read()

    logger.info(f"Migration SQL ({len(migration_sql)} bytes):")
    print("-" * 80)
    print(migration_sql)
    print("-" * 80)

    # Confirm before applying
    if input("\nApply this migration? (yes/no): ").lower() != 'yes':
        logger.info("Migration cancelled by user")
        return False

    # Apply migration
    try:
        db = get_db()

        logger.info("Connecting to database...")

        with db.get_connection() as conn:
            with conn.cursor() as cursor:
                logger.info("Executing migration...")
                cursor.execute(migration_sql)
                conn.commit()
                logger.info("✅ Migration applied successfully")
                return True

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False


def list_migrations():
    """List all available migrations"""
    migrations_dir = Path(__file__).parent / 'migrations'

    if not migrations_dir.exists():
        logger.error(f"Migrations directory not found: {migrations_dir}")
        return

    migrations = sorted(migrations_dir.glob('*.sql'))

    print("\n" + "=" * 80)
    print("AVAILABLE MIGRATIONS")
    print("=" * 80)

    if not migrations:
        print("No migration files found")
        return

    for migration in migrations:
        print(f"  • {migration.name}")

    print("=" * 80 + "\n")


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("KAMIYO Database Migration Tool")
    print("=" * 80 + "\n")

    # Check for DATABASE_URL
    if not os.getenv('DATABASE_URL'):
        logger.error("DATABASE_URL environment variable not set")
        print("\nPlease set DATABASE_URL to your production database connection string:")
        print("export DATABASE_URL='postgresql://user:password@host:port/database'")
        sys.exit(1)

    # Show database connection info (masked)
    db_url = os.getenv('DATABASE_URL')
    if '@' in db_url:
        # Mask credentials
        parts = db_url.split('@')
        host_part = parts[1]
        logger.info(f"Database: {host_part}")

    # List available migrations
    list_migrations()

    # Get migration file from command line or prompt
    if len(sys.argv) > 1:
        migration_file = sys.argv[1]
    else:
        migration_file = input("Enter migration file name (e.g., 002_create_source_health_view.sql): ").strip()

    if not migration_file:
        logger.error("No migration file specified")
        sys.exit(1)

    # Apply migration
    success = apply_migration(migration_file)

    if success:
        print("\n✅ Migration completed successfully\n")
        sys.exit(0)
    else:
        print("\n❌ Migration failed\n")
        sys.exit(1)
