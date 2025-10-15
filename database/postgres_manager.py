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
from pathlib import Path
from functools import wraps
import inspect
import psycopg2
from psycopg2 import pool, extras, OperationalError
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Import connection monitor
try:
    from .connection_monitor import get_monitor
    MONITORING_ENABLED = True
except ImportError:
    MONITORING_ENABLED = False
    logger.warning("Connection monitoring not available")

logger = logging.getLogger(__name__)


def use_read_replica(func):
    """
    Decorator to automatically use read replica for read-only queries
    Applies readonly=True if not explicitly set in method call
    """
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        # Get function signature
        sig = inspect.signature(func)

        # Check if function has 'readonly' parameter and it's not set
        if 'readonly' in sig.parameters:
            # Check if readonly is not already in kwargs
            if 'readonly' not in kwargs:
                # Inject readonly=True for automatic read replica usage
                kwargs['readonly'] = True
                logger.debug(f"Auto-selecting read replica for {func.__name__}")

        return func(self, *args, **kwargs)

    return wrapper


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

        # Initialize connection monitor
        self.monitor = get_monitor() if MONITORING_ENABLED else None

        # Initialize schema if needed
        self._initialize_schema()

    def _initialize_schema(self):
        """
        Initialize database schema from SQL file if tables don't exist.
        Idempotent - safe to run multiple times.
        """
        schema_path = Path(__file__).parent / 'migrations' / '001_initial_schema.sql'

        if not schema_path.exists():
            logger.warning(f"Schema file not found: {schema_path}")
            return

        conn = None
        try:
            # Get connection directly from pool to avoid recursion
            conn = self.pool.getconn()
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()

            try:
                # Check if main table exists
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = 'public'
                        AND table_name = 'exploits'
                    )
                """)
                table_exists = cursor.fetchone()[0]

                if table_exists:
                    logger.debug("Database schema already initialized")
                    return

                # Read and execute schema
                with open(schema_path, 'r') as f:
                    schema_sql = f.read()

                logger.info("Initializing database schema from 001_initial_schema.sql")

                cursor.execute(schema_sql)
                logger.info("Database schema initialized successfully")

            finally:
                cursor.close()

        except Exception as e:
            logger.error(f"Schema initialization failed: {e}")
            # Don't raise - allow application to start even if schema init fails
            # This allows for manual schema setup if needed

        finally:
            if conn:
                self.pool.putconn(conn)

    @contextmanager
    def get_connection(self, readonly: bool = False, timeout: int = 30):
        """
        Get database connection from pool with automatic cleanup and timeout

        Args:
            readonly: Use read replica if available
            timeout: Maximum seconds to wait for connection (default: 30)

        Yields:
            Database connection

        Raises:
            TimeoutError: If connection cannot be acquired within timeout
        """
        # Use read replica for readonly queries if available
        if readonly and self.read_pool:
            target_pool = self.read_pool
        else:
            target_pool = self.pool

        connection = None
        acquisition_start = time.time()
        success = False

        try:
            # Attempt to get connection with timeout
            while time.time() - acquisition_start < timeout:
                try:
                    connection = target_pool.getconn()
                    success = True
                    break
                except pool.PoolError:
                    elapsed = time.time() - acquisition_start
                    if elapsed >= timeout:
                        logger.error(f"Connection pool exhausted - timeout after {timeout}s")
                        raise TimeoutError(
                            f"Failed to acquire database connection after {timeout}s. "
                            "Pool may be exhausted or database may be unresponsive."
                        )
                    # Brief sleep before retry
                    time.sleep(0.1)

            if connection is None:
                raise TimeoutError(f"Failed to acquire connection after {timeout}s")

            # Record successful acquisition
            if self.monitor:
                acquisition_duration = (time.time() - acquisition_start) * 1000
                self.monitor.record_acquisition(acquisition_duration, success=True)

            yield connection

        except (TimeoutError, pool.PoolError) as e:
            # Record failed acquisition
            if self.monitor:
                acquisition_duration = (time.time() - acquisition_start) * 1000
                self.monitor.record_acquisition(acquisition_duration, success=False)
            raise

        finally:
            if connection:
                target_pool.putconn(connection)

    @contextmanager
    def get_cursor(self, readonly: bool = False, dict_cursor: bool = True, timeout: int = None):
        """
        Get database cursor with automatic commit/rollback and query timeout

        Args:
            readonly: Use read replica if available
            dict_cursor: Return rows as dictionaries
            timeout: Query timeout in seconds (default: 30s from env var DB_QUERY_TIMEOUT)

        Yields:
            Database cursor
        """
        # Get timeout from parameter, environment, or default
        query_timeout = timeout or int(os.getenv('DB_QUERY_TIMEOUT', '30'))

        with self.get_connection(readonly=readonly) as conn:
            cursor_factory = extras.RealDictCursor if dict_cursor else None
            cursor = conn.cursor(cursor_factory=cursor_factory)

            try:
                # Set statement timeout for this connection
                cursor.execute(f"SET statement_timeout = '{query_timeout}s'")

                yield cursor

                if not readonly:
                    conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Transaction failed: {e}")
                raise
            finally:
                # Reset timeout to default before returning connection to pool
                try:
                    cursor.execute("RESET statement_timeout")
                except Exception:
                    pass
                cursor.close()

    def execute_with_retry(self,
                          query: str,
                          params: tuple = None,
                          readonly: bool = False,
                          max_retries: int = 3,
                          timeout: int = None) -> List[Dict]:
        """
        Execute query with automatic retry on failure

        Args:
            query: SQL query
            params: Query parameters
            readonly: Use read replica
            max_retries: Maximum retry attempts
            timeout: Query timeout in seconds (default: 30s)

        Returns:
            Query results as list of dictionaries
        """
        query_start = time.time()
        error = None

        for attempt in range(max_retries):
            try:
                with self.get_cursor(readonly=readonly, timeout=timeout) as cursor:
                    cursor.execute(query, params)

                    # Return results for SELECT queries
                    if cursor.description:
                        results = cursor.fetchall()
                    else:
                        results = []

                    # Record successful query execution
                    if self.monitor:
                        duration_ms = (time.time() - query_start) * 1000
                        self.monitor.record_query_execution(query, duration_ms)

                    return results

            except OperationalError as e:
                error = e
                error_str = str(e).lower()

                # Don't retry on timeout errors (intentional limits)
                if 'timeout' in error_str or 'statement timeout' in error_str:
                    logger.error(f"Query timeout after {timeout or 30}s: {query[:100]}...")
                    if self.monitor:
                        duration_ms = (time.time() - query_start) * 1000
                        self.monitor.record_query_execution(query, duration_ms, error=e)
                    raise

                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.warning(f"Query failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Query failed after {max_retries} attempts: {e}")

                    # Record failed query
                    if self.monitor:
                        duration_ms = (time.time() - query_start) * 1000
                        self.monitor.record_query_execution(query, duration_ms, error=e)

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

    @use_read_replica
    def get_recent_exploits(self,
                           limit: int = 100,
                           offset: int = 0,
                           chain: str = None,
                           min_amount: float = None,
                           readonly: bool = True) -> List[Dict]:
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

        return self.execute_with_retry(query, tuple(params), readonly=readonly)

    @use_read_replica
    def get_exploit_by_tx_hash(self, tx_hash: str, readonly: bool = True) -> Optional[Dict]:
        """Get single exploit by transaction hash"""

        query = "SELECT * FROM exploits WHERE tx_hash = %s"
        results = self.execute_with_retry(query, (tx_hash,), readonly=readonly)
        return results[0] if results else None

    @use_read_replica
    def get_total_exploits(self, readonly: bool = True) -> int:
        """Get total exploit count"""

        query = "SELECT COUNT(*) as count FROM exploits"
        result = self.execute_with_retry(query, readonly=readonly)
        return result[0]['count'] if result else 0

    @use_read_replica
    def get_chains(self, readonly: bool = True) -> List[str]:
        """Get list of all chains"""

        query = "SELECT DISTINCT chain FROM exploits ORDER BY chain"
        results = self.execute_with_retry(query, readonly=readonly)
        return [row['chain'] for row in results]

    @use_read_replica
    def get_exploits_by_chain(self, chain: str, readonly: bool = True) -> List[Dict]:
        """Get all exploits for specific chain"""

        query = "SELECT * FROM exploits WHERE chain = %s ORDER BY timestamp DESC"
        return self.execute_with_retry(query, (chain,), readonly=readonly)

    @use_read_replica
    def get_stats_24h(self, readonly: bool = True) -> Dict:
        """Get statistics for last 24 hours"""

        query = "SELECT * FROM v_stats_24h"
        result = self.execute_with_retry(query, readonly=readonly)
        return dict(result[0]) if result else {}

    @use_read_replica
    def get_stats_custom(self, days: int = 7, readonly: bool = True) -> Dict:
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

        result = self.execute_with_retry(query, (days,), readonly=readonly)
        return dict(result[0]) if result else {}

    @use_read_replica
    def get_source_health(self, readonly: bool = True) -> List[Dict]:
        """Get health status of all sources"""

        try:
            query = "SELECT * FROM v_source_health ORDER BY success_rate DESC"
            return self.execute_with_retry(query, readonly=readonly)
        except Exception as e:
            error_str = str(e).lower()
            # If view doesn't exist, fall back to direct query
            if 'does not exist' in error_str and 'v_source_health' in error_str:
                logger.warning("View v_source_health does not exist, using fallback query")
                fallback_query = """
                    SELECT
                        name,
                        last_fetch,
                        fetch_count,
                        error_count,
                        ROUND((1.0 * (fetch_count - error_count) / NULLIF(fetch_count, 0)) * 100, 2) as success_rate,
                        is_active
                    FROM sources
                    WHERE fetch_count > 0
                    ORDER BY success_rate DESC
                """
                try:
                    return self.execute_with_retry(fallback_query, readonly=readonly)
                except Exception as fallback_error:
                    logger.error(f"Fallback query failed: {fallback_error}")
                    return []
            else:
                logger.error(f"Failed to get source health: {e}")
                return []

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

    def get_pool_metrics(self) -> Dict[str, Any]:
        """
        Get connection pool metrics and health status

        Returns:
            Dictionary with pool metrics and warnings
        """
        if not self.monitor:
            return {
                "monitoring_enabled": False,
                "message": "Connection monitoring not available"
            }

        # Capture current pool snapshot
        # Note: psycopg2 pool doesn't expose current size easily
        # We use configured values as approximation
        try:
            # Attempt to determine pool utilization
            # This is approximate since psycopg2 doesn't expose internals
            snapshot = self.monitor.capture_pool_snapshot(
                pool_size=self.pool.maxconn,
                available=self.pool.minconn,  # Approximate
                waiting=0  # Not easily detectable
            )

            health = self.monitor.get_health_status()
            slow_queries = self.monitor.get_slow_queries(limit=5)

            return {
                "monitoring_enabled": True,
                "health_status": health,
                "slow_queries": slow_queries,
                "pool_config": {
                    "min_connections": self.pool.minconn,
                    "max_connections": self.pool.maxconn
                },
                "leak_warnings": self.monitor.detect_connection_leaks()
            }

        except Exception as e:
            logger.error(f"Failed to get pool metrics: {e}")
            return {
                "monitoring_enabled": True,
                "error": str(e)
            }

    def get_query_performance(self, limit: int = 10) -> List[Dict]:
        """
        Get query performance metrics

        Args:
            limit: Maximum number of queries to return

        Returns:
            List of query performance data
        """
        if not self.monitor:
            return []

        return self.monitor.get_slow_queries(limit=limit)

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
