"""
Database Connection Pooling Configuration
Production-grade connection pool management with asyncpg
"""

import os
from typing import Optional
import asyncpg
import logging

logger = logging.getLogger(__name__)


class DatabasePool:
    """
    Production database connection pool

    Features:
    - Connection pooling with min/max limits
    - Health checks and automatic reconnection
    - Query timeout enforcement
    - Connection lifecycle management
    - Metrics tracking
    """

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.config = self._load_config()

    def _load_config(self) -> dict:
        """
        Load pool configuration from environment

        Environment variables:
        - DATABASE_URL: PostgreSQL connection string
        - DB_POOL_MIN_SIZE: Minimum pool size (default: 5)
        - DB_POOL_MAX_SIZE: Maximum pool size (default: 20)
        - DB_MAX_QUERIES: Max queries per connection (default: 50000)
        - DB_MAX_INACTIVE_TIME: Max idle time in seconds (default: 300)
        - DB_TIMEOUT: Connection timeout in seconds (default: 10)
        - DB_COMMAND_TIMEOUT: Query timeout in seconds (default: 30)
        """
        return {
            'dsn': os.getenv('DATABASE_URL'),
            'min_size': int(os.getenv('DB_POOL_MIN_SIZE', '5')),
            'max_size': int(os.getenv('DB_POOL_MAX_SIZE', '20')),
            'max_queries': int(os.getenv('DB_MAX_QUERIES', '50000')),
            'max_inactive_connection_lifetime': float(os.getenv('DB_MAX_INACTIVE_TIME', '300')),
            'timeout': float(os.getenv('DB_TIMEOUT', '10')),
            'command_timeout': float(os.getenv('DB_COMMAND_TIMEOUT', '30')),
            'server_settings': {
                'application_name': 'kamiyo_erc8004',
                'jit': 'off',  # Disable JIT for predictable performance
            }
        }

    async def initialize(self):
        """
        Initialize connection pool

        Call this on application startup.
        """
        if self.pool is not None:
            logger.warning("Pool already initialized")
            return

        try:
            self.pool = await asyncpg.create_pool(**self.config)
            logger.info(f"Database pool initialized: min={self.config['min_size']}, max={self.config['max_size']}")

            # Verify connectivity
            async with self.pool.acquire() as conn:
                version = await conn.fetchval('SELECT version()')
                logger.info(f"Connected to PostgreSQL: {version}")

        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise

    async def close(self):
        """
        Close connection pool

        Call this on application shutdown.
        """
        if self.pool is None:
            return

        try:
            await self.pool.close()
            logger.info("Database pool closed")
        except Exception as e:
            logger.error(f"Error closing database pool: {e}")

    async def get_connection(self):
        """
        Acquire connection from pool

        Usage:
            async with pool.get_connection() as conn:
                await conn.execute("SELECT ...")
        """
        if self.pool is None:
            raise RuntimeError("Database pool not initialized")

        return self.pool.acquire()

    async def execute(self, query: str, *args, timeout: Optional[float] = None):
        """
        Execute query with automatic connection management

        Args:
            query: SQL query string
            args: Query parameters
            timeout: Optional timeout override

        Returns:
            Query result
        """
        timeout = timeout or self.config['command_timeout']

        async with self.pool.acquire(timeout=timeout) as conn:
            return await conn.execute(query, *args, timeout=timeout)

    async def fetch_one(self, query: str, *args, timeout: Optional[float] = None):
        """Fetch single row"""
        timeout = timeout or self.config['command_timeout']

        async with self.pool.acquire(timeout=timeout) as conn:
            return await conn.fetchrow(query, *args, timeout=timeout)

    async def fetch_all(self, query: str, *args, timeout: Optional[float] = None):
        """Fetch all rows"""
        timeout = timeout or self.config['command_timeout']

        async with self.pool.acquire(timeout=timeout) as conn:
            return await conn.fetch(query, *args, timeout=timeout)

    async def fetch_val(self, query: str, *args, timeout: Optional[float] = None):
        """Fetch single value"""
        timeout = timeout or self.config['command_timeout']

        async with self.pool.acquire(timeout=timeout) as conn:
            return await conn.fetchval(query, *args, timeout=timeout)

    async def get_pool_stats(self) -> dict:
        """
        Get pool statistics for monitoring

        Returns:
            Dict with pool metrics
        """
        if self.pool is None:
            return {}

        return {
            'size': self.pool.get_size(),
            'free': self.pool.get_idle_size(),
            'in_use': self.pool.get_size() - self.pool.get_idle_size(),
            'min_size': self.config['min_size'],
            'max_size': self.config['max_size'],
            'utilization': (self.pool.get_size() - self.pool.get_idle_size()) / self.config['max_size']
        }

    async def health_check(self) -> bool:
        """
        Health check for the database connection

        Returns:
            True if healthy, False otherwise
        """
        try:
            async with self.pool.acquire(timeout=5) as conn:
                await conn.execute('SELECT 1', timeout=5)
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False


# Global pool instance
_pool: Optional[DatabasePool] = None


async def get_pool() -> DatabasePool:
    """
    Get global database pool instance

    Initializes pool on first call.
    """
    global _pool

    if _pool is None:
        _pool = DatabasePool()
        await _pool.initialize()

    return _pool


async def close_pool():
    """Close global pool on shutdown"""
    global _pool

    if _pool is not None:
        await _pool.close()
        _pool = None


# FastAPI integration
async def get_db():
    """
    FastAPI dependency for database access

    Returns the actual asyncpg.Pool for connection management.

    Usage:
        @router.get("/agents")
        async def get_agents(db = Depends(get_db)):
            async with db.acquire() as conn:
                result = await conn.fetch("SELECT * FROM agents")
    """
    db_pool = await get_pool()
    return db_pool.pool  # Return the actual asyncpg.Pool, not the wrapper


# Context manager for transactions
class DatabaseTransaction:
    """
    Transaction context manager with connection pool

    Usage:
        async with DatabaseTransaction() as tx:
            await tx.execute("INSERT ...")
            await tx.execute("UPDATE ...")
            # Auto-commit on success, rollback on error
    """

    def __init__(self, pool: DatabasePool, isolation: str = 'READ COMMITTED'):
        self.pool = pool
        self.isolation = isolation
        self.conn = None
        self.transaction = None

    async def __aenter__(self):
        self.conn = await self.pool.pool.acquire()
        self.transaction = self.conn.transaction(isolation=self.isolation)
        await self.transaction.start()
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            await self.transaction.rollback()
            logger.error(f"Transaction rolled back due to {exc_type.__name__}: {exc_val}")
        else:
            await self.transaction.commit()

        await self.pool.pool.release(self.conn)


# Monitoring integration
async def collect_pool_metrics():
    """
    Collect pool metrics for Prometheus

    Call periodically to update metrics.
    """
    from prometheus_client import Gauge

    pool_size = Gauge('database_pool_size', 'Current database pool size')
    pool_free = Gauge('database_pool_free', 'Free connections in pool')
    pool_utilization = Gauge('database_pool_utilization', 'Pool utilization ratio')

    pool = await get_pool()
    stats = await pool.get_pool_stats()

    pool_size.set(stats.get('size', 0))
    pool_free.set(stats.get('free', 0))
    pool_utilization.set(stats.get('utilization', 0))


# Example configuration for production

# Recommended settings in .env:
"""
# PostgreSQL Connection
DATABASE_URL=postgresql://user:pass@localhost/kamiyo

# Connection Pool (for API with 10 workers)
DB_POOL_MIN_SIZE=10           # Min connections (1 per worker + spares)
DB_POOL_MAX_SIZE=30           # Max connections (3 per worker)
DB_MAX_QUERIES=50000          # Recycle after 50k queries
DB_MAX_INACTIVE_TIME=300      # Close idle connections after 5 minutes
DB_TIMEOUT=10                 # Connection timeout
DB_COMMAND_TIMEOUT=30         # Query timeout

# For higher traffic, scale up:
# DB_POOL_MIN_SIZE=20
# DB_POOL_MAX_SIZE=100
"""

# PostgreSQL configuration (postgresql.conf):
"""
max_connections = 200            # Total allowed connections
shared_buffers = 256MB           # Cache size
effective_cache_size = 1GB       # OS cache estimate
work_mem = 16MB                  # Per-query memory
maintenance_work_mem = 128MB     # Maintenance operations
max_wal_size = 2GB              # Write-ahead log size

# Connection limits per user
ALTER ROLE kamiyo_user CONNECTION LIMIT 100;

# Statement timeout
ALTER DATABASE kamiyo SET statement_timeout = '30s';
"""
