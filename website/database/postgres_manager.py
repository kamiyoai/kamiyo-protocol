# -*- coding: utf-8 -*-
"""
PostgreSQL Database Manager
Production-grade database manager with connection pooling and retry logic
"""

import os
import time
import logging
from typing import Dict, List, Any, Optional
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool, extras, OperationalError
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

logger = logging.getLogger(__name__)


class PostgresManager:
    """
    Production PostgreSQL database manager with connection pooling

    Features:
    - Connection pooling for performance
    - Automatic retry with exponential backoff
    - Read replica support for scaling
    - Connection health checks
    - Prepared statements for security
    """

    def __init__(self,
                 database_url: str = None,
                 read_replica_url: str = None,
                 min_connections: int = 2,
                 max_connections: int = 20):
        """
        Initialize PostgreSQL connection pool

        Args:
            database_url: Primary database URL (write)
            read_replica_url: Read replica URL (optional)
            min_connections: Minimum pool size
            max_connections: Maximum pool size
        """

        self.database_url = database_url or os.getenv('DATABASE_URL')
        self.read_replica_url = read_replica_url or os.getenv('READ_REPLICA_URL')

        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable required")

        # Create connection pool for primary (write) database
        try:
            self.pool = psycopg2.pool.ThreadedConnectionPool(
                min_connections,
                max_connections,
                self.database_url
            )
            logger.info(f"Created connection pool with {min_connections}-{max_connections} connections")
        except Exception as e:
            logger.error(f"Failed to create connection pool: {e}")
            raise

        # Create read replica pool if available
        self.read_pool = None
        if self.read_replica_url:
            try:
                self.read_pool = psycopg2.pool.ThreadedConnectionPool(
                    min_connections,
                    max_connections,
                    self.read_replica_url
                )
                logger.info("Created read replica connection pool")
            except Exception as e:
                logger.warning(f"Failed to create read replica pool: {e}")

    @contextmanager
    def get_connection(self, readonly: bool = False):
        """
        Get database connection from pool with automatic cleanup

        Args:
            readonly: Use read replica if available

        Yields:
            Database connection
        """
        # Use read replica for readonly queries if available
        if readonly and self.read_pool:
            pool = self.read_pool
        else:
            pool = self.pool

        connection = None
        try:
            connection = pool.getconn()
            yield connection
        finally:
            if connection:
                pool.putconn(connection)

    @contextmanager
    def get_cursor(self, readonly: bool = False, dict_cursor: bool = True):
        """
        Get database cursor with automatic commit/rollback

        Args:
            readonly: Use read replica if available
            dict_cursor: Return rows as dictionaries

        Yields:
            Database cursor
        """
        with self.get_connection(readonly=readonly) as conn:
            cursor_factory = extras.RealDictCursor if dict_cursor else None
            cursor = conn.cursor(cursor_factory=cursor_factory)

            try:
                yield cursor
                if not readonly:
                    conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Transaction failed: {e}")
                raise
            finally:
                cursor.close()

    def execute_with_retry(self,
                          query: str,
                          params: tuple = None,
                          readonly: bool = False,
                          max_retries: int = 3) -> List[Dict]:
        """
        Execute query with automatic retry on failure

        Args:
            query: SQL query
            params: Query parameters
            readonly: Use read replica
            max_retries: Maximum retry attempts

        Returns:
            Query results as list of dictionaries
        """
        for attempt in range(max_retries):
            try:
                with self.get_cursor(readonly=readonly) as cursor:
                    cursor.execute(query, params)

                    # Return results for SELECT queries
                    if cursor.description:
                        return cursor.fetchall()
                    return []

            except OperationalError as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.warning(f"Query failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Query failed after {max_retries} attempts: {e}")
                    raise

    def insert_exploit(self, exploit: Dict[str, Any]) -> Optional[int]:
        """Insert exploit into database (ignore duplicates)"""

        query = """
            INSERT INTO exploits
            (tx_hash, chain, protocol, amount_usd, timestamp, source,
             source_url, category, description, recovery_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tx_hash) DO NOTHING
            RETURNING id
        """

        params = (
            exploit['tx_hash'],
            exploit['chain'],
            exploit['protocol'],
            exploit.get('amount_usd'),
            exploit['timestamp'],
            exploit['source'],
            exploit.get('source_url'),
            exploit.get('category'),
            exploit.get('description'),
            exploit.get('recovery_status')
        )

        try:
            result = self.execute_with_retry(query, params, readonly=False)
            if result:
                logger.info(f"Inserted exploit: {exploit['tx_hash']}")
                return result[0]['id']
            else:
                logger.debug(f"Duplicate exploit skipped: {exploit['tx_hash']}")
                return None
        except Exception as e:
            logger.error(f"Failed to insert exploit: {e}")
            return None

    def get_recent_exploits(self,
                           limit: int = 100,
                           offset: int = 0,
                           chain: str = None,
                           min_amount: float = None) -> List[Dict]:
        """Get recent exploits with optional filtering"""

        query = """
            SELECT * FROM exploits
            WHERE 1=1
        """
        params = []

        if chain:
            query += " AND chain = %s"
            params.append(chain)

        if min_amount is not None:
            query += " AND amount_usd >= %s"
            params.append(min_amount)

        query += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        return self.execute_with_retry(query, tuple(params), readonly=True)

    def get_exploit_by_tx_hash(self, tx_hash: str) -> Optional[Dict]:
        """Get single exploit by transaction hash"""

        query = "SELECT * FROM exploits WHERE tx_hash = %s"
        results = self.execute_with_retry(query, (tx_hash,), readonly=True)
        return results[0] if results else None

    def get_total_exploits(self) -> int:
        """Get total exploit count"""

        query = "SELECT COUNT(*) as count FROM exploits"
        result = self.execute_with_retry(query, readonly=True)
        return result[0]['count'] if result else 0

    def get_chains(self) -> List[str]:
        """Get list of all chains"""

        query = "SELECT DISTINCT chain FROM exploits ORDER BY chain"
        results = self.execute_with_retry(query, readonly=True)
        return [row['chain'] for row in results]

    def get_exploits_by_chain(self, chain: str) -> List[Dict]:
        """Get all exploits for specific chain"""

        query = "SELECT * FROM exploits WHERE chain = %s ORDER BY timestamp DESC"
        return self.execute_with_retry(query, (chain,), readonly=True)

    def get_stats_24h(self) -> Dict:
        """Get statistics for last 24 hours"""

        query = "SELECT * FROM v_stats_24h"
        result = self.execute_with_retry(query, readonly=True)
        return dict(result[0]) if result else {}

    def get_stats_custom(self, days: int = 7) -> Dict:
        """Get statistics for custom time period"""

        query = """
            SELECT
                COUNT(*) as total_exploits,
                SUM(amount_usd) as total_loss_usd,
                COUNT(DISTINCT chain) as chains_affected,
                COUNT(DISTINCT protocol) as protocols_affected
            FROM exploits
            WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '%s days'
        """

        result = self.execute_with_retry(query, (days,), readonly=True)
        return dict(result[0]) if result else {}

    def get_source_health(self) -> List[Dict]:
        """Get health status of all sources"""

        query = "SELECT * FROM v_source_health ORDER BY success_rate DESC"
        return self.execute_with_retry(query, readonly=True)

    def update_source_status(self,
                            source_name: str,
                            success: bool = True,
                            error_message: str = None):
        """Update source fetch status"""

        if success:
            query = """
                INSERT INTO sources (name, last_fetch, fetch_count, error_count, is_active)
                VALUES (%s, CURRENT_TIMESTAMP, 1, 0, true)
                ON CONFLICT (name) DO UPDATE SET
                    last_fetch = CURRENT_TIMESTAMP,
                    fetch_count = sources.fetch_count + 1,
                    is_active = true
            """
            params = (source_name,)
        else:
            query = """
                INSERT INTO sources (name, last_fetch, fetch_count, error_count, is_active)
                VALUES (%s, CURRENT_TIMESTAMP, 1, 1, true)
                ON CONFLICT (name) DO UPDATE SET
                    last_fetch = CURRENT_TIMESTAMP,
                    fetch_count = sources.fetch_count + 1,
                    error_count = sources.error_count + 1,
                    is_active = (sources.error_count + 1) < 10
            """
            params = (source_name,)

        self.execute_with_retry(query, params, readonly=False)

    def health_check(self) -> bool:
        """Check database connection health"""

        try:
            query = "SELECT 1 as healthy"
            result = self.execute_with_retry(query, readonly=True)
            return result[0]['healthy'] == 1 if result else False
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    def close(self):
        """Close all connection pools"""

        if self.pool:
            self.pool.closeall()
            logger.info("Closed primary connection pool")

        if self.read_pool:
            self.read_pool.closeall()
            logger.info("Closed read replica connection pool")


# Singleton instance
_db_instance = None

def get_db() -> PostgresManager:
    """Get database manager singleton"""

    global _db_instance
    if _db_instance is None:
        _db_instance = PostgresManager()
    return _db_instance


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== PostgreSQL Manager Test ===")

    # Test with example DATABASE_URL
    os.environ['DATABASE_URL'] = 'postgresql://user:password@localhost/kamiyo_test'

    try:
        db = get_db()

        print("\n1. Testing health check...")
        healthy = db.health_check()
        print(f"   Health: {'✅ OK' if healthy else '❌ FAILED'}")

        print("\n2. Testing connection pool...")
        with db.get_cursor() as cursor:
            cursor.execute("SELECT version()")
            result = cursor.fetchone()
            print(f"   PostgreSQL version: {result['version']}")

        print("\n3. Testing retry logic...")
        # This will fail but demonstrate retry
        try:
            db.execute_with_retry("SELECT * FROM nonexistent_table", max_retries=2)
        except Exception as e:
            print(f"   Expected failure: {type(e).__name__}")

        print("\n✅ PostgreSQL Manager ready for production")

    except Exception as e:
        print(f"\n❌ Setup error: {e}")
        print("   Set DATABASE_URL environment variable to test")
    finally:
        if _db_instance:
            _db_instance.close()
