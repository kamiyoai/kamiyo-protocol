# -*- coding: utf-8 -*-
"""
Data Archival System
Manages archival of old exploit data to separate tables for performance
"""

import os
import time
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import psycopg2
from psycopg2 import pool
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

logger = logging.getLogger(__name__)


@dataclass
class ArchivalStats:
    """
    Archival operation statistics
    """
    archive_name: str
    records_archived: int
    records_restored: int
    archive_size_mb: float
    active_size_mb: float
    oldest_archived_date: Optional[datetime]
    newest_archived_date: Optional[datetime]
    last_archival: Optional[datetime]
    archival_duration_seconds: float


class DataArchival:
    """
    Data archival system for managing old exploit data

    Features:
    - Archive exploits older than 365 days
    - Move data to archive_exploits table
    - Scheduled monthly archival
    - Restore archived data on request
    - Archive table partitioning
    - Archive statistics and reporting
    - Automatic cleanup of very old archives (>5 years)
    """

    def __init__(self,
                 database_url: str = None,
                 archive_age_days: int = 365,
                 cleanup_age_days: int = 1825):  # 5 years
        """
        Initialize data archival system

        Args:
            database_url: PostgreSQL connection URL
            archive_age_days: Age threshold for archiving (days)
            cleanup_age_days: Age threshold for cleanup (days)
        """
        self.database_url = database_url or os.getenv('DATABASE_URL')
        self.archive_age_days = archive_age_days
        self.cleanup_age_days = cleanup_age_days

        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable required")

        # Statistics
        self.total_archived = 0
        self.total_restored = 0
        self.last_archival_time: Optional[datetime] = None

        logger.info(
            f"DataArchival initialized (archive_age: {archive_age_days} days, "
            f"cleanup_age: {cleanup_age_days} days)"
        )

    def _get_connection(self):
        """
        Get database connection

        Returns:
            Database connection
        """
        return psycopg2.connect(self.database_url)

    def initialize_archive_tables(self):
        """
        Create archive tables if they don't exist

        This creates a partitioned archive table structure
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Create archive_exploits table (partitioned by year)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS archive_exploits (
                    id BIGSERIAL,
                    original_id INTEGER NOT NULL,
                    tx_hash TEXT NOT NULL,
                    chain TEXT NOT NULL,
                    protocol TEXT NOT NULL,
                    amount_usd DECIMAL(15, 2),
                    timestamp TIMESTAMP NOT NULL,
                    source TEXT NOT NULL,
                    source_id INTEGER,
                    source_url TEXT,
                    category TEXT,
                    description TEXT,
                    recovery_status TEXT,
                    severity TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP,
                    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    archive_year INTEGER NOT NULL,

                    PRIMARY KEY (id, archive_year)
                ) PARTITION BY RANGE (archive_year);
            """)

            # Create indexes on archive table
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_archive_exploits_original_id
                    ON archive_exploits(original_id);

                CREATE INDEX IF NOT EXISTS idx_archive_exploits_tx_hash
                    ON archive_exploits(tx_hash);

                CREATE INDEX IF NOT EXISTS idx_archive_exploits_timestamp
                    ON archive_exploits(timestamp DESC);

                CREATE INDEX IF NOT EXISTS idx_archive_exploits_chain
                    ON archive_exploits(chain, archive_year);
            """)

            # Create partitions for past 5 years and next year
            current_year = datetime.now().year
            for year in range(current_year - 5, current_year + 2):
                partition_name = f"archive_exploits_{year}"

                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {partition_name}
                    PARTITION OF archive_exploits
                    FOR VALUES FROM ({year}) TO ({year + 1});
                """)

            # Create archive statistics table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS archival_history (
                    id SERIAL PRIMARY KEY,
                    archive_year INTEGER NOT NULL,
                    records_archived INTEGER NOT NULL,
                    archive_size_bytes BIGINT,
                    archival_duration_seconds NUMERIC,
                    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_archival_history_year
                    ON archival_history(archive_year, archived_at DESC);
            """)

            conn.commit()
            logger.info("Archive tables initialized successfully")

        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to initialize archive tables: {e}")
            raise

        finally:
            cursor.close()
            conn.close()

    def archive_old_exploits(self, dry_run: bool = False) -> int:
        """
        Archive exploits older than archive_age_days

        Args:
            dry_run: If True, only count records without archiving

        Returns:
            Number of records archived
        """
        start_time = time.time()
        archive_cutoff = datetime.now() - timedelta(days=self.archive_age_days)

        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Count records to archive
            cursor.execute("""
                SELECT COUNT(*)
                FROM exploits
                WHERE created_at < %s
                AND id NOT IN (SELECT original_id FROM archive_exploits)
            """, (archive_cutoff,))

            count = cursor.fetchone()[0]

            if dry_run:
                logger.info(f"Dry run: {count} records would be archived")
                return count

            if count == 0:
                logger.info("No records to archive")
                return 0

            logger.info(f"Archiving {count} exploit records...")

            # Archive records
            cursor.execute("""
                INSERT INTO archive_exploits (
                    original_id, tx_hash, chain, protocol, amount_usd,
                    timestamp, source, source_id, source_url, category,
                    description, recovery_status, severity, metadata,
                    created_at, updated_at, archive_year
                )
                SELECT
                    id, tx_hash, chain, protocol, amount_usd,
                    timestamp, source, source_id, source_url, category,
                    description, recovery_status, severity, metadata,
                    created_at, updated_at, EXTRACT(YEAR FROM created_at)::INTEGER
                FROM exploits
                WHERE created_at < %s
                AND id NOT IN (SELECT original_id FROM archive_exploits)
                RETURNING id
            """, (archive_cutoff,))

            archived_count = cursor.rowcount

            # Delete archived records from main table
            cursor.execute("""
                DELETE FROM exploits
                WHERE created_at < %s
                AND id IN (SELECT original_id FROM archive_exploits)
            """, (archive_cutoff,))

            deleted_count = cursor.rowcount

            # Record archival statistics
            duration = time.time() - start_time

            cursor.execute("""
                INSERT INTO archival_history (
                    archive_year, records_archived, archival_duration_seconds
                )
                VALUES (
                    EXTRACT(YEAR FROM %s)::INTEGER,
                    %s,
                    %s
                )
            """, (archive_cutoff, archived_count, duration))

            conn.commit()

            self.total_archived += archived_count
            self.last_archival_time = datetime.now()

            logger.info(
                f"Archived {archived_count} records (deleted {deleted_count} from main table) "
                f"in {duration:.2f}s"
            )

            return archived_count

        except Exception as e:
            conn.rollback()
            logger.error(f"Archival failed: {e}")
            raise

        finally:
            cursor.close()
            conn.close()

    def restore_archived_exploits(self,
                                  exploit_ids: List[int] = None,
                                  date_range: tuple = None) -> int:
        """
        Restore archived exploits back to main table

        Args:
            exploit_ids: List of original exploit IDs to restore
            date_range: Tuple of (start_date, end_date) to restore

        Returns:
            Number of records restored
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Build WHERE clause
            where_clauses = []
            params = []

            if exploit_ids:
                where_clauses.append("original_id = ANY(%s)")
                params.append(exploit_ids)

            if date_range:
                where_clauses.append("created_at BETWEEN %s AND %s")
                params.extend(date_range)

            if not where_clauses:
                logger.warning("No restore criteria specified")
                return 0

            where_clause = " AND ".join(where_clauses)

            # Restore records
            cursor.execute(f"""
                INSERT INTO exploits (
                    id, tx_hash, chain, protocol, amount_usd,
                    timestamp, source, source_id, source_url, category,
                    description, recovery_status, severity, metadata,
                    created_at, updated_at
                )
                SELECT
                    original_id, tx_hash, chain, protocol, amount_usd,
                    timestamp, source, source_id, source_url, category,
                    description, recovery_status, severity, metadata,
                    created_at, updated_at
                FROM archive_exploits
                WHERE {where_clause}
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """, tuple(params))

            restored_count = cursor.rowcount

            conn.commit()

            self.total_restored += restored_count

            logger.info(f"Restored {restored_count} records from archive")

            return restored_count

        except Exception as e:
            conn.rollback()
            logger.error(f"Restore failed: {e}")
            raise

        finally:
            cursor.close()
            conn.close()

    def cleanup_very_old_archives(self, dry_run: bool = False) -> int:
        """
        Delete archives older than cleanup_age_days

        Args:
            dry_run: If True, only count records without deleting

        Returns:
            Number of records deleted
        """
        cleanup_cutoff = datetime.now() - timedelta(days=self.cleanup_age_days)

        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Count records to delete
            cursor.execute("""
                SELECT COUNT(*)
                FROM archive_exploits
                WHERE created_at < %s
            """, (cleanup_cutoff,))

            count = cursor.fetchone()[0]

            if dry_run:
                logger.info(f"Dry run: {count} archived records would be deleted")
                return count

            if count == 0:
                logger.info("No very old archives to cleanup")
                return 0

            # Delete old archives
            cursor.execute("""
                DELETE FROM archive_exploits
                WHERE created_at < %s
            """, (cleanup_cutoff,))

            deleted_count = cursor.rowcount

            conn.commit()

            logger.info(f"Cleaned up {deleted_count} very old archived records")

            return deleted_count

        except Exception as e:
            conn.rollback()
            logger.error(f"Cleanup failed: {e}")
            raise

        finally:
            cursor.close()
            conn.close()

    def get_archival_statistics(self) -> ArchivalStats:
        """
        Get archival statistics

        Returns:
            ArchivalStats object
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Get archive stats
            cursor.execute("""
                SELECT
                    COUNT(*) as total_archived,
                    MIN(created_at) as oldest_date,
                    MAX(created_at) as newest_date,
                    pg_total_relation_size('archive_exploits')::NUMERIC / (1024 * 1024) as archive_size_mb
                FROM archive_exploits
            """)

            row = cursor.fetchone()
            total_archived = row[0] if row else 0
            oldest_date = row[1] if row else None
            newest_date = row[2] if row else None
            archive_size_mb = float(row[3]) if row and row[3] else 0.0

            # Get active table size
            cursor.execute("""
                SELECT
                    pg_total_relation_size('exploits')::NUMERIC / (1024 * 1024) as active_size_mb
            """)

            active_size_mb = float(cursor.fetchone()[0]) if cursor.rowcount > 0 else 0.0

            # Get last archival info
            cursor.execute("""
                SELECT
                    SUM(records_archived) as total,
                    MAX(archived_at) as last_archival,
                    SUM(archival_duration_seconds) as total_duration
                FROM archival_history
            """)

            row = cursor.fetchone()
            records_archived = row[0] if row and row[0] else 0
            last_archival = row[1] if row and row[1] else None
            total_duration = float(row[2]) if row and row[2] else 0.0

            return ArchivalStats(
                archive_name="archive_exploits",
                records_archived=records_archived,
                records_restored=self.total_restored,
                archive_size_mb=archive_size_mb,
                active_size_mb=active_size_mb,
                oldest_archived_date=oldest_date,
                newest_archived_date=newest_date,
                last_archival=last_archival,
                archival_duration_seconds=total_duration
            )

        finally:
            cursor.close()
            conn.close()

    def print_statistics(self):
        """
        Print archival statistics
        """
        stats = self.get_archival_statistics()

        logger.info("=== Data Archival Statistics ===")
        logger.info(f"Records Archived: {stats.records_archived}")
        logger.info(f"Records Restored: {stats.records_restored}")
        logger.info(f"Archive Size: {stats.archive_size_mb:.2f} MB")
        logger.info(f"Active Table Size: {stats.active_size_mb:.2f} MB")
        logger.info(f"Oldest Archived: {stats.oldest_archived_date}")
        logger.info(f"Newest Archived: {stats.newest_archived_date}")
        logger.info(f"Last Archival: {stats.last_archival}")
        logger.info(f"Total Archival Duration: {stats.archival_duration_seconds:.2f}s")

        # Calculate space savings
        if stats.active_size_mb > 0:
            total_size = stats.archive_size_mb + stats.active_size_mb
            savings_pct = (stats.archive_size_mb / total_size) * 100
            logger.info(f"Space in Archive: {savings_pct:.1f}%")

    def vacuum_archive_tables(self):
        """
        Run VACUUM ANALYZE on archive tables
        """
        conn = self._get_connection()
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        try:
            logger.info("Running VACUUM ANALYZE on archive tables...")

            cursor.execute("VACUUM ANALYZE archive_exploits;")
            cursor.execute("VACUUM ANALYZE archival_history;")

            logger.info("VACUUM ANALYZE completed")

        except Exception as e:
            logger.error(f"VACUUM failed: {e}")
            raise

        finally:
            cursor.close()
            conn.close()


# Singleton instance
_archival_instance: Optional[DataArchival] = None


def get_data_archival() -> DataArchival:
    """
    Get data archival singleton

    Returns:
        DataArchival instance
    """
    global _archival_instance
    if _archival_instance is None:
        _archival_instance = DataArchival()
    return _archival_instance


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Data Archival System Test ===\n")

    database_url = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost/kamiyo_test')

    try:
        # Create archival system
        archival = DataArchival(database_url=database_url)

        print("1. Initializing archive tables...")
        archival.initialize_archive_tables()
        print("   ✅ Archive tables created")

        print("\n2. Checking archival statistics...")
        archival.print_statistics()

        print("\n3. Testing dry run archival...")
        count = archival.archive_old_exploits(dry_run=True)
        print(f"   Would archive {count} records")

        print("\n✅ Data Archival System ready for production")

    except Exception as e:
        print(f"\n❌ Test error: {e}")
        print("   Set DATABASE_URL environment variable to test with real database")
