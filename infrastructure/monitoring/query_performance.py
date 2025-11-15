# -*- coding: utf-8 -*-
"""
Query Performance Monitoring
Tracks query execution times, database connection pool metrics, and provides Prometheus metrics
"""

import os
import time
import logging
from typing import Dict, List, Any, Optional
from functools import wraps
from datetime import datetime, timedelta
from collections import defaultdict, deque
import threading

# Prometheus metrics
from monitoring.prometheus_metrics import (
    db_query_duration_seconds,
    db_connections_active,
    db_connections_idle,
    registry
)
from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)


# Additional query-specific metrics
query_execution_count = Counter(
    'kamiyo_query_execution_total',
    'Total number of query executions',
    ['query_type', 'table', 'status'],
    registry=registry
)

query_slow_count = Counter(
    'kamiyo_query_slow_total',
    'Total number of slow queries',
    ['query_type', 'table'],
    registry=registry
)

query_errors = Counter(
    'kamiyo_query_errors_total',
    'Total number of query errors',
    ['query_type', 'table', 'error_type'],
    registry=registry
)

query_response_time = Histogram(
    'kamiyo_query_response_time_seconds',
    'Query response time distribution',
    ['query_type', 'table'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=registry
)

database_connection_pool_size = Gauge(
    'kamiyo_db_connection_pool_size',
    'Current database connection pool size',
    ['pool_name'],
    registry=registry
)

database_connection_wait_time = Histogram(
    'kamiyo_db_connection_wait_time_seconds',
    'Time waiting for database connection',
    ['pool_name'],
    buckets=[0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
    registry=registry
)


class QueryPerformanceMonitor:
    """
    Query performance monitoring system

    Features:
    - Query execution time tracking
    - Slow query logging (>100ms threshold)
    - Database connection pool monitoring
    - Query count per endpoint
    - Database load metrics
    - Prometheus metrics integration
    - Real-time performance dashboards
    """

    def __init__(self,
                 slow_query_threshold_ms: float = 100.0,
                 enable_detailed_logging: bool = True,
                 max_history_size: int = 10000):
        """
        Initialize query performance monitor

        Args:
            slow_query_threshold_ms: Threshold for slow query logging
            enable_detailed_logging: Enable detailed query logging
            max_history_size: Maximum number of queries to keep in history
        """
        self.slow_query_threshold_ms = slow_query_threshold_ms
        self.enable_detailed_logging = enable_detailed_logging
        self.max_history_size = max_history_size

        # Query tracking
        self.query_history = deque(maxlen=max_history_size)
        self.query_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'count': 0,
            'total_time_ms': 0.0,
            'min_time_ms': float('inf'),
            'max_time_ms': 0.0,
            'errors': 0
        })

        # Endpoint tracking
        self.endpoint_queries: Dict[str, int] = defaultdict(int)

        # Connection pool tracking
        self.pool_stats: Dict[str, Dict[str, Any]] = {}

        # Thread safety
        self._lock = threading.RLock()

        # Start time
        self.start_time = time.time()

        logger.info(
            f"QueryPerformanceMonitor initialized "
            f"(slow_threshold: {slow_query_threshold_ms}ms)"
        )

    def _extract_query_type(self, query: str) -> str:
        """
        Extract query type from SQL query

        Args:
            query: SQL query

        Returns:
            Query type (SELECT, INSERT, UPDATE, DELETE, etc.)
        """
        query_upper = query.strip().upper()
        for keyword in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP']:
            if query_upper.startswith(keyword):
                return keyword
        return 'OTHER'

    def _extract_table_name(self, query: str) -> str:
        """
        Extract primary table name from SQL query

        Args:
            query: SQL query

        Returns:
            Table name or 'unknown'
        """
        import re

        query_upper = query.upper()

        # Try FROM clause
        from_match = re.search(r'\bFROM\s+(\w+)', query_upper)
        if from_match:
            return from_match.group(1).lower()

        # Try INSERT/UPDATE/DELETE
        for keyword in ['INSERT INTO', 'UPDATE', 'DELETE FROM']:
            if keyword in query_upper:
                table_match = re.search(rf'\b{keyword}\s+(\w+)', query_upper)
                if table_match:
                    return table_match.group(1).lower()

        return 'unknown'

    def track_query(self,
                   query: str,
                   execution_time_ms: float,
                   endpoint: str = None,
                   success: bool = True,
                   error_type: str = None):
        """
        Track query execution

        Args:
            query: SQL query
            execution_time_ms: Execution time in milliseconds
            endpoint: API endpoint that triggered the query
            success: Whether query succeeded
            error_type: Type of error if failed
        """
        query_type = self._extract_query_type(query)
        table_name = self._extract_table_name(query)

        with self._lock:
            # Update query statistics
            stats = self.query_stats[query]
            stats['count'] += 1
            stats['total_time_ms'] += execution_time_ms
            stats['min_time_ms'] = min(stats['min_time_ms'], execution_time_ms)
            stats['max_time_ms'] = max(stats['max_time_ms'], execution_time_ms)

            if not success:
                stats['errors'] += 1

            # Add to history
            self.query_history.append({
                'query': query[:500],  # Truncate long queries
                'query_type': query_type,
                'table': table_name,
                'execution_time_ms': execution_time_ms,
                'endpoint': endpoint,
                'success': success,
                'error_type': error_type,
                'timestamp': datetime.now()
            })

            # Track endpoint queries
            if endpoint:
                self.endpoint_queries[endpoint] += 1

        # Update Prometheus metrics
        status = 'success' if success else 'error'
        query_execution_count.labels(
            query_type=query_type,
            table=table_name,
            status=status
        ).inc()

        query_response_time.labels(
            query_type=query_type,
            table=table_name
        ).observe(execution_time_ms / 1000.0)

        # Track slow queries
        if execution_time_ms >= self.slow_query_threshold_ms:
            query_slow_count.labels(
                query_type=query_type,
                table=table_name
            ).inc()

            if self.enable_detailed_logging:
                logger.warning(
                    f"Slow query ({execution_time_ms:.2f}ms): "
                    f"{query_type} on {table_name} - {query[:100]}..."
                )

        # Track errors
        if not success and error_type:
            query_errors.labels(
                query_type=query_type,
                table=table_name,
                error_type=error_type
            ).inc()

    def track_connection_pool(self,
                             pool_name: str,
                             active_connections: int,
                             idle_connections: int,
                             pool_size: int):
        """
        Track connection pool statistics

        Args:
            pool_name: Name of connection pool
            active_connections: Number of active connections
            idle_connections: Number of idle connections
            pool_size: Total pool size
        """
        with self._lock:
            self.pool_stats[pool_name] = {
                'active': active_connections,
                'idle': idle_connections,
                'size': pool_size,
                'timestamp': datetime.now()
            }

        # Update Prometheus metrics
        db_connections_active.set(active_connections)
        db_connections_idle.set(idle_connections)
        database_connection_pool_size.labels(pool_name=pool_name).set(pool_size)

    def get_slow_queries(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get slowest queries from history

        Args:
            limit: Maximum number of queries to return

        Returns:
            List of slow queries
        """
        with self._lock:
            sorted_queries = sorted(
                self.query_history,
                key=lambda x: x['execution_time_ms'],
                reverse=True
            )
            return list(sorted_queries[:limit])

    def get_query_statistics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get aggregated query statistics

        Returns:
            Dictionary of query statistics
        """
        with self._lock:
            stats = {}
            for query, data in self.query_stats.items():
                avg_time = data['total_time_ms'] / data['count'] if data['count'] > 0 else 0
                stats[query[:100]] = {
                    'count': data['count'],
                    'avg_time_ms': round(avg_time, 2),
                    'min_time_ms': round(data['min_time_ms'], 2),
                    'max_time_ms': round(data['max_time_ms'], 2),
                    'total_time_ms': round(data['total_time_ms'], 2),
                    'errors': data['errors']
                }
            return stats

    def get_endpoint_statistics(self) -> Dict[str, int]:
        """
        Get query count per endpoint

        Returns:
            Dictionary of endpoint query counts
        """
        with self._lock:
            return dict(self.endpoint_queries)

    def get_pool_statistics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get connection pool statistics

        Returns:
            Dictionary of pool statistics
        """
        with self._lock:
            return dict(self.pool_stats)

    def get_database_load_metrics(self) -> Dict[str, Any]:
        """
        Get database load metrics

        Returns:
            Dictionary of load metrics
        """
        with self._lock:
            total_queries = len(self.query_history)
            total_time = sum(q['execution_time_ms'] for q in self.query_history)
            uptime_seconds = time.time() - self.start_time

            slow_queries = sum(
                1 for q in self.query_history
                if q['execution_time_ms'] >= self.slow_query_threshold_ms
            )

            failed_queries = sum(
                1 for q in self.query_history
                if not q['success']
            )

            return {
                'total_queries': total_queries,
                'slow_queries': slow_queries,
                'failed_queries': failed_queries,
                'total_execution_time_ms': round(total_time, 2),
                'avg_execution_time_ms': round(total_time / total_queries, 2) if total_queries > 0 else 0,
                'queries_per_second': round(total_queries / uptime_seconds, 2) if uptime_seconds > 0 else 0,
                'uptime_seconds': round(uptime_seconds, 2)
            }

    def print_statistics(self):
        """
        Print performance statistics to log
        """
        load_metrics = self.get_database_load_metrics()

        logger.info("=== Query Performance Statistics ===")
        logger.info(f"Total Queries: {load_metrics['total_queries']}")
        logger.info(f"Slow Queries: {load_metrics['slow_queries']}")
        logger.info(f"Failed Queries: {load_metrics['failed_queries']}")
        logger.info(f"Avg Execution Time: {load_metrics['avg_execution_time_ms']:.2f}ms")
        logger.info(f"Queries/Second: {load_metrics['queries_per_second']:.2f}")
        logger.info(f"Uptime: {load_metrics['uptime_seconds']:.2f}s")
        logger.info("")

        # Top slow queries
        slow_queries = self.get_slow_queries(5)
        if slow_queries:
            logger.info("Top 5 Slow Queries:")
            for i, query in enumerate(slow_queries, 1):
                logger.info(
                    f"  {i}. {query['execution_time_ms']:.2f}ms - "
                    f"{query['query_type']} on {query['table']}"
                )
        logger.info("")

        # Connection pool stats
        pool_stats = self.get_pool_statistics()
        if pool_stats:
            logger.info("Connection Pool Statistics:")
            for pool_name, stats in pool_stats.items():
                logger.info(
                    f"  {pool_name}: "
                    f"Active={stats['active']}, "
                    f"Idle={stats['idle']}, "
                    f"Size={stats['size']}"
                )


# Decorator for automatic query tracking
def track_query_performance(endpoint: str = None):
    """
    Decorator to automatically track query performance

    Args:
        endpoint: API endpoint name

    Returns:
        Decorator function
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            success = True
            error_type = None

            try:
                result = func(*args, **kwargs)
                return result

            except Exception as e:
                success = False
                error_type = type(e).__name__
                raise

            finally:
                execution_time_ms = (time.time() - start_time) * 1000

                # Track query (assumes function has query parameter or returns query info)
                monitor = get_query_monitor()
                query = kwargs.get('query', 'UNKNOWN')

                monitor.track_query(
                    query=query,
                    execution_time_ms=execution_time_ms,
                    endpoint=endpoint,
                    success=success,
                    error_type=error_type
                )

        return wrapper
    return decorator


# Singleton instance
_monitor_instance: Optional[QueryPerformanceMonitor] = None


def get_query_monitor() -> QueryPerformanceMonitor:
    """
    Get query performance monitor singleton

    Returns:
        QueryPerformanceMonitor instance
    """
    global _monitor_instance
    if _monitor_instance is None:
        _monitor_instance = QueryPerformanceMonitor()
    return _monitor_instance


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Query Performance Monitor Test ===\n")

    # Create monitor
    monitor = QueryPerformanceMonitor(slow_query_threshold_ms=50.0)

    print("1. Simulating query executions...")
    test_queries = [
        ("SELECT * FROM exploits WHERE chain = 'ethereum'", 25.5, True),
        ("SELECT * FROM users WHERE id = 123", 15.2, True),
        ("INSERT INTO exploits VALUES (...)", 45.0, True),
        ("SELECT * FROM exploits ORDER BY timestamp DESC LIMIT 1000", 125.5, True),  # Slow
        ("UPDATE subscriptions SET status = 'active'", 35.0, True),
        ("SELECT * FROM invalid_table", 10.0, False),  # Error
    ]

    for query, exec_time, success in test_queries:
        error_type = None if success else 'OperationalError'
        monitor.track_query(
            query=query,
            execution_time_ms=exec_time,
            endpoint='/api/exploits',
            success=success,
            error_type=error_type
        )

    print("\n2. Query statistics:")
    monitor.print_statistics()

    print("\n3. Database load metrics:")
    load = monitor.get_database_load_metrics()
    for key, value in load.items():
        print(f"   {key}: {value}")

    print("\n✅ Query Performance Monitor ready for production")
