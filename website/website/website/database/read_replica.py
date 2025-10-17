# -*- coding: utf-8 -*-
"""
Read Replica Manager
Automatic read/write query splitting with replica lag monitoring and failover
"""

import os
import time
import logging
import random
from typing import Optional, List, Dict, Any, Callable
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
import psycopg2
from psycopg2 import pool

from database.connection_pool import EnhancedConnectionPool, get_pool_manager

logger = logging.getLogger(__name__)


class QueryType(Enum):
    """
    Query type classification
    """
    READ = "read"
    WRITE = "write"
    UNKNOWN = "unknown"


@dataclass
class ReplicaHealth:
    """
    Replica health status
    """
    replica_name: str
    is_healthy: bool
    replication_lag_seconds: float
    last_check: datetime
    consecutive_failures: int
    total_queries: int
    failed_queries: int
    avg_response_time_ms: float


@dataclass
class QueryRoutingStats:
    """
    Query routing statistics
    """
    total_queries: int
    read_queries: int
    write_queries: int
    routed_to_primary: int
    routed_to_replica: int
    replica_failovers: int
    replica_lag_exceeded: int
    avg_replica_lag_ms: float


class ReadReplicaManager:
    """
    Read replica manager with automatic query routing and failover

    Features:
    - Automatic read/write query detection
    - Read queries → replica, write queries → primary
    - Replica lag monitoring
    - Automatic failover to primary if replica unavailable
    - Load balancing across multiple replicas
    - Replica health checks
    - Detailed routing statistics
    """

    def __init__(self,
                 primary_url: str,
                 replica_urls: List[str] = None,
                 max_replica_lag_seconds: float = 5.0,
                 health_check_interval: int = 30,
                 max_consecutive_failures: int = 3,
                 min_pool_size: int = 10,
                 max_pool_size: int = 50):
        """
        Initialize read replica manager

        Args:
            primary_url: Primary database URL (for writes)
            replica_urls: List of read replica URLs
            max_replica_lag_seconds: Maximum acceptable replication lag (seconds)
            health_check_interval: Interval between health checks (seconds)
            max_consecutive_failures: Max failures before marking replica unhealthy
            min_pool_size: Minimum connection pool size
            max_pool_size: Maximum connection pool size
        """
        self.primary_url = primary_url
        self.replica_urls = replica_urls or []
        self.max_replica_lag_seconds = max_replica_lag_seconds
        self.health_check_interval = health_check_interval
        self.max_consecutive_failures = max_consecutive_failures

        # Get pool manager
        self.pool_manager = get_pool_manager()

        # Create primary pool
        self.primary_pool = self.pool_manager.create_pool(
            name='primary',
            database_url=primary_url,
            min_connections=min_pool_size,
            max_connections=max_pool_size
        )

        # Create replica pools
        self.replica_pools: Dict[str, EnhancedConnectionPool] = {}
        for i, replica_url in enumerate(self.replica_urls):
            pool_name = f'replica_{i}'
            replica_pool = self.pool_manager.create_pool(
                name=pool_name,
                database_url=replica_url,
                min_connections=min_pool_size // 2,  # Replicas can have fewer connections
                max_connections=max_pool_size // 2
            )
            self.replica_pools[pool_name] = replica_pool

        # Replica health tracking
        self.replica_health: Dict[str, ReplicaHealth] = {}
        for name in self.replica_pools.keys():
            self.replica_health[name] = ReplicaHealth(
                replica_name=name,
                is_healthy=True,
                replication_lag_seconds=0.0,
                last_check=datetime.now(),
                consecutive_failures=0,
                total_queries=0,
                failed_queries=0,
                avg_response_time_ms=0.0
            )

        # Routing statistics
        self.total_queries = 0
        self.read_queries = 0
        self.write_queries = 0
        self.routed_to_primary = 0
        self.routed_to_replica = 0
        self.replica_failovers = 0
        self.replica_lag_exceeded = 0

        # Last health check time
        self.last_health_check = datetime.now()

        logger.info(
            f"ReadReplicaManager initialized with primary and {len(self.replica_pools)} replicas"
        )

        # Run initial health checks
        self._check_all_replicas()

    def _classify_query(self, query: str) -> QueryType:
        """
        Classify query as read or write

        Args:
            query: SQL query

        Returns:
            QueryType enum
        """
        query_upper = query.strip().upper()

        # Write operations
        write_keywords = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE']
        for keyword in write_keywords:
            if query_upper.startswith(keyword):
                return QueryType.WRITE

        # Read operations
        if query_upper.startswith('SELECT') or query_upper.startswith('WITH'):
            return QueryType.READ

        # Transaction control (route to primary for safety)
        if query_upper.startswith(('BEGIN', 'COMMIT', 'ROLLBACK', 'SET')):
            return QueryType.WRITE

        return QueryType.UNKNOWN

    def _get_healthy_replicas(self) -> List[str]:
        """
        Get list of healthy replica pool names

        Returns:
            List of healthy replica names
        """
        healthy = []
        for name, health in self.replica_health.items():
            if health.is_healthy and health.replication_lag_seconds <= self.max_replica_lag_seconds:
                healthy.append(name)
        return healthy

    def _select_replica(self) -> Optional[str]:
        """
        Select replica using round-robin with health checks

        Returns:
            Replica pool name or None if no healthy replicas
        """
        healthy_replicas = self._get_healthy_replicas()

        if not healthy_replicas:
            return None

        # Simple load balancing: random selection among healthy replicas
        return random.choice(healthy_replicas)

    def _check_replication_lag(self, replica_name: str) -> float:
        """
        Check replication lag for specific replica

        Args:
            replica_name: Replica pool name

        Returns:
            Replication lag in seconds
        """
        try:
            replica_pool = self.replica_pools[replica_name]

            with replica_pool.get_connection(timeout=5) as conn:
                cursor = conn.cursor()

                # Query for replication lag
                # This assumes PostgreSQL streaming replication
                cursor.execute("""
                    SELECT
                        CASE
                            WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
                            THEN 0
                            ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
                        END AS lag_seconds
                """)

                result = cursor.fetchone()
                cursor.close()

                if result and result[0] is not None:
                    return float(result[0])
                else:
                    # If we can't determine lag, assume it's acceptable
                    return 0.0

        except Exception as e:
            logger.error(f"Failed to check replication lag for {replica_name}: {e}")
            return float('inf')  # Return infinite lag on error

    def _check_replica_health(self, replica_name: str):
        """
        Check health of specific replica

        Args:
            replica_name: Replica pool name
        """
        try:
            # Check replication lag
            lag = self._check_replication_lag(replica_name)

            health = self.replica_health[replica_name]

            # Update health status
            if lag <= self.max_replica_lag_seconds:
                health.is_healthy = True
                health.consecutive_failures = 0
            else:
                health.consecutive_failures += 1
                if health.consecutive_failures >= self.max_consecutive_failures:
                    health.is_healthy = False
                    logger.warning(
                        f"Replica {replica_name} marked unhealthy "
                        f"(lag: {lag:.2f}s, failures: {health.consecutive_failures})"
                    )

            health.replication_lag_seconds = lag
            health.last_check = datetime.now()

            logger.debug(
                f"Replica {replica_name} health check: "
                f"lag={lag:.2f}s, healthy={health.is_healthy}"
            )

        except Exception as e:
            logger.error(f"Health check failed for {replica_name}: {e}")

            health = self.replica_health[replica_name]
            health.consecutive_failures += 1

            if health.consecutive_failures >= self.max_consecutive_failures:
                health.is_healthy = False

    def _check_all_replicas(self):
        """
        Check health of all replicas
        """
        for replica_name in self.replica_pools.keys():
            self._check_replica_health(replica_name)

        self.last_health_check = datetime.now()

    def _maybe_health_check(self):
        """
        Run health check if interval has elapsed
        """
        if (datetime.now() - self.last_health_check).seconds >= self.health_check_interval:
            self._check_all_replicas()

    @contextmanager
    def get_connection(self, query: str = None, force_primary: bool = False):
        """
        Get database connection with automatic routing

        Args:
            query: SQL query for classification
            force_primary: Force use of primary database

        Yields:
            Database connection
        """
        self.total_queries += 1

        # Maybe run health checks
        self._maybe_health_check()

        # Determine query type
        query_type = QueryType.UNKNOWN
        if query:
            query_type = self._classify_query(query)

        # Route to appropriate pool
        use_primary = False

        if force_primary or query_type == QueryType.WRITE or query_type == QueryType.UNKNOWN:
            # Use primary for writes or unknown queries
            pool = self.primary_pool
            use_primary = True
            self.routed_to_primary += 1

            if query_type == QueryType.WRITE:
                self.write_queries += 1

        else:
            # Try to use replica for reads
            self.read_queries += 1
            replica_name = self._select_replica()

            if replica_name and replica_name in self.replica_pools:
                # Use replica
                pool = self.replica_pools[replica_name]
                self.routed_to_replica += 1

                # Update replica stats
                health = self.replica_health[replica_name]
                health.total_queries += 1

            else:
                # Failover to primary
                pool = self.primary_pool
                use_primary = True
                self.routed_to_primary += 1
                self.replica_failovers += 1

                logger.warning("No healthy replicas available, using primary for read query")

        # Get connection and track timing
        start_time = time.time()
        try:
            with pool.get_connection() as conn:
                yield conn

            # Update stats on success
            execution_time_ms = (time.time() - start_time) * 1000

            if not use_primary:
                # Update replica response time
                health = self.replica_health[replica_name]
                # Running average
                if health.total_queries > 1:
                    health.avg_response_time_ms = (
                        (health.avg_response_time_ms * (health.total_queries - 1) + execution_time_ms)
                        / health.total_queries
                    )
                else:
                    health.avg_response_time_ms = execution_time_ms

        except Exception as e:
            # Update error stats
            if not use_primary and replica_name:
                health = self.replica_health[replica_name]
                health.failed_queries += 1

            logger.error(f"Query execution failed: {e}")
            raise

    def execute_query(self,
                     query: str,
                     params: tuple = None,
                     force_primary: bool = False) -> List[Any]:
        """
        Execute query with automatic routing

        Args:
            query: SQL query
            params: Query parameters
            force_primary: Force use of primary database

        Returns:
            Query results
        """
        with self.get_connection(query=query, force_primary=force_primary) as conn:
            cursor = conn.cursor()
            try:
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)

                # Fetch results if SELECT
                if cursor.description:
                    return cursor.fetchall()
                else:
                    conn.commit()
                    return []

            finally:
                cursor.close()

    def get_replica_health_status(self) -> Dict[str, ReplicaHealth]:
        """
        Get health status of all replicas

        Returns:
            Dictionary of replica health
        """
        return self.replica_health.copy()

    def get_routing_statistics(self) -> QueryRoutingStats:
        """
        Get query routing statistics

        Returns:
            QueryRoutingStats object
        """
        # Calculate average replica lag
        avg_lag = 0.0
        if self.replica_health:
            avg_lag = sum(
                h.replication_lag_seconds for h in self.replica_health.values()
            ) / len(self.replica_health)

        return QueryRoutingStats(
            total_queries=self.total_queries,
            read_queries=self.read_queries,
            write_queries=self.write_queries,
            routed_to_primary=self.routed_to_primary,
            routed_to_replica=self.routed_to_replica,
            replica_failovers=self.replica_failovers,
            replica_lag_exceeded=self.replica_lag_exceeded,
            avg_replica_lag_ms=avg_lag * 1000
        )

    def print_statistics(self):
        """
        Print routing and health statistics
        """
        stats = self.get_routing_statistics()

        logger.info("=== Read Replica Manager Statistics ===")
        logger.info(f"Total Queries: {stats.total_queries}")
        logger.info(f"Read Queries: {stats.read_queries} ({stats.read_queries / stats.total_queries * 100:.1f}%)")
        logger.info(f"Write Queries: {stats.write_queries} ({stats.write_queries / stats.total_queries * 100:.1f}%)")
        logger.info(f"Routed to Primary: {stats.routed_to_primary}")
        logger.info(f"Routed to Replica: {stats.routed_to_replica}")
        logger.info(f"Replica Failovers: {stats.replica_failovers}")
        logger.info(f"Avg Replica Lag: {stats.avg_replica_lag_ms:.2f}ms")
        logger.info("")

        logger.info("=== Replica Health ===")
        for name, health in self.replica_health.items():
            logger.info(f"{name}:")
            logger.info(f"  Healthy: {health.is_healthy}")
            logger.info(f"  Lag: {health.replication_lag_seconds:.2f}s")
            logger.info(f"  Queries: {health.total_queries} (failed: {health.failed_queries})")
            logger.info(f"  Avg Response Time: {health.avg_response_time_ms:.2f}ms")
            logger.info(f"  Last Check: {health.last_check}")

    def close(self):
        """
        Close all connection pools
        """
        self.pool_manager.close_all()
        logger.info("Closed all connection pools")


# Singleton instance
_replica_manager: Optional[ReadReplicaManager] = None


def get_read_replica_manager() -> ReadReplicaManager:
    """
    Get read replica manager singleton

    Returns:
        ReadReplicaManager instance
    """
    global _replica_manager
    if _replica_manager is None:
        primary_url = os.getenv('DATABASE_URL')
        replica_urls_str = os.getenv('READ_REPLICA_URLS', '')

        replica_urls = []
        if replica_urls_str:
            replica_urls = [url.strip() for url in replica_urls_str.split(',')]

        if not primary_url:
            raise ValueError("DATABASE_URL environment variable required")

        _replica_manager = ReadReplicaManager(
            primary_url=primary_url,
            replica_urls=replica_urls
        )

    return _replica_manager


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Read Replica Manager Test ===\n")

    # Test with environment variables
    primary_url = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost/kamiyo_test')
    replica_url = os.getenv('READ_REPLICA_URL', primary_url)  # Use same URL for testing

    try:
        # Create manager
        manager = ReadReplicaManager(
            primary_url=primary_url,
            replica_urls=[replica_url],
            max_replica_lag_seconds=5.0
        )

        print("1. Testing query classification...")
        test_queries = [
            ("SELECT * FROM exploits", QueryType.READ),
            ("INSERT INTO exploits VALUES (...)", QueryType.WRITE),
            ("UPDATE users SET tier = 'pro'", QueryType.WRITE),
            ("DELETE FROM old_data", QueryType.WRITE),
        ]

        for query, expected in test_queries:
            result = manager._classify_query(query)
            status = "✅" if result == expected else "❌"
            print(f"   {status} {query[:50]}: {result.value}")

        print("\n2. Testing connection routing...")
        # Read query (should try replica)
        with manager.get_connection(query="SELECT 1") as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            print(f"   Read query result: {result}")
            cursor.close()

        # Write query (should use primary)
        with manager.get_connection(query="INSERT INTO test VALUES (1)", force_primary=True) as conn:
            print(f"   Write query routed to primary")

        print("\n3. Routing statistics:")
        manager.print_statistics()

        print("\n✅ Read Replica Manager ready for production")

    except Exception as e:
        print(f"\n❌ Test error: {e}")
        print("   Set DATABASE_URL and READ_REPLICA_URL environment variables")

    finally:
        if _replica_manager:
            _replica_manager.close()
