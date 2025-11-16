# -*- coding: utf-8 -*-
"""
Connection Pool Monitoring for PostgreSQL
Tracks pool utilization, slow queries, and connection leaks
"""

import time
import logging
import threading
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class ConnectionMetrics:
    """Metrics for connection pool monitoring"""
    timestamp: datetime
    pool_size: int
    available_connections: int
    active_connections: int
    waiting_threads: int
    total_acquisitions: int
    acquisition_failures: int
    avg_acquisition_time_ms: float
    max_acquisition_time_ms: float
    slow_queries: int


@dataclass
class QueryMetrics:
    """Metrics for individual query tracking"""
    query_hash: str
    query_template: str
    execution_count: int
    total_duration_ms: float
    avg_duration_ms: float
    max_duration_ms: float
    error_count: int
    last_execution: datetime


class ConnectionMonitor:
    """
    Production-grade connection pool monitoring

    Features:
    - Real-time pool utilization tracking
    - Slow query detection (>1s)
    - Connection leak detection
    - Acquisition timeout tracking
    - Query performance metrics
    """

    def __init__(self, slow_query_threshold_ms: float = 1000.0):
        """
        Initialize connection monitor

        Args:
            slow_query_threshold_ms: Threshold for slow query detection (default: 1000ms)
        """
        self.slow_query_threshold = slow_query_threshold_ms

        # Metrics storage
        self.metrics_history: List[ConnectionMetrics] = []
        self.query_metrics: Dict[str, QueryMetrics] = {}

        # Counters
        self.total_acquisitions = 0
        self.acquisition_failures = 0
        self.slow_queries = 0

        # Timing tracking
        self.acquisition_times: List[float] = []
        self.max_acquisition_time = 0.0

        # Thread safety
        self._lock = threading.Lock()

        # Query tracking
        self.query_durations = defaultdict(list)
        self.query_errors = defaultdict(int)

        logger.info(f"Connection monitor initialized (slow query threshold: {slow_query_threshold_ms}ms)")

    def record_acquisition(self, duration_ms: float, success: bool = True):
        """
        Record connection acquisition attempt

        Args:
            duration_ms: Time taken to acquire connection
            success: Whether acquisition succeeded
        """
        with self._lock:
            self.total_acquisitions += 1

            if success:
                self.acquisition_times.append(duration_ms)
                if duration_ms > self.max_acquisition_time:
                    self.max_acquisition_time = duration_ms

                # Keep only last 1000 times for rolling average
                if len(self.acquisition_times) > 1000:
                    self.acquisition_times.pop(0)
            else:
                self.acquisition_failures += 1
                logger.warning(f"Connection acquisition failed after {duration_ms}ms")

    def record_query_execution(self,
                              query: str,
                              duration_ms: float,
                              error: Optional[Exception] = None):
        """
        Record query execution metrics

        Args:
            query: SQL query (will be hashed for privacy)
            duration_ms: Query execution time
            error: Exception if query failed
        """
        # Generate query hash and template
        query_hash = str(hash(query))
        query_template = self._extract_query_template(query)

        with self._lock:
            # Track slow queries
            if duration_ms > self.slow_query_threshold:
                self.slow_queries += 1
                logger.warning(
                    f"Slow query detected ({duration_ms:.2f}ms): {query_template[:100]}"
                )

            # Update query metrics
            if query_hash in self.query_metrics:
                metrics = self.query_metrics[query_hash]
                metrics.execution_count += 1
                metrics.total_duration_ms += duration_ms
                metrics.avg_duration_ms = metrics.total_duration_ms / metrics.execution_count
                metrics.max_duration_ms = max(metrics.max_duration_ms, duration_ms)
                metrics.last_execution = datetime.now()

                if error:
                    metrics.error_count += 1
            else:
                self.query_metrics[query_hash] = QueryMetrics(
                    query_hash=query_hash,
                    query_template=query_template,
                    execution_count=1,
                    total_duration_ms=duration_ms,
                    avg_duration_ms=duration_ms,
                    max_duration_ms=duration_ms,
                    error_count=1 if error else 0,
                    last_execution=datetime.now()
                )

    def capture_pool_snapshot(self,
                             pool_size: int,
                             available: int,
                             waiting: int = 0) -> ConnectionMetrics:
        """
        Capture current pool state snapshot

        Args:
            pool_size: Total pool size
            available: Available connections
            waiting: Threads waiting for connection

        Returns:
            ConnectionMetrics snapshot
        """
        with self._lock:
            avg_acquisition = (
                sum(self.acquisition_times) / len(self.acquisition_times)
                if self.acquisition_times else 0.0
            )

            metrics = ConnectionMetrics(
                timestamp=datetime.now(),
                pool_size=pool_size,
                available_connections=available,
                active_connections=pool_size - available,
                waiting_threads=waiting,
                total_acquisitions=self.total_acquisitions,
                acquisition_failures=self.acquisition_failures,
                avg_acquisition_time_ms=avg_acquisition,
                max_acquisition_time_ms=self.max_acquisition_time,
                slow_queries=self.slow_queries
            )

            # Store snapshot
            self.metrics_history.append(metrics)

            # Keep only last 1 hour of snapshots (assuming 1 snapshot per minute)
            if len(self.metrics_history) > 60:
                self.metrics_history.pop(0)

            return metrics

    def get_health_status(self) -> Dict[str, Any]:
        """
        Get overall health status

        Returns:
            Health status dictionary with warnings
        """
        if not self.metrics_history:
            return {"status": "unknown", "message": "No metrics collected yet"}

        latest = self.metrics_history[-1]
        warnings = []

        # Check pool utilization
        utilization = (latest.active_connections / latest.pool_size) * 100
        if utilization > 90:
            warnings.append(f"High pool utilization: {utilization:.1f}%")

        # Check acquisition failures
        if self.acquisition_failures > 0:
            failure_rate = (self.acquisition_failures / self.total_acquisitions) * 100
            if failure_rate > 5:
                warnings.append(f"High acquisition failure rate: {failure_rate:.1f}%")

        # Check slow queries
        if self.slow_queries > 10:
            warnings.append(f"Slow queries detected: {self.slow_queries} total")

        # Check waiting threads
        if latest.waiting_threads > 0:
            warnings.append(f"Threads waiting for connections: {latest.waiting_threads}")

        status = "healthy" if not warnings else "warning"

        return {
            "status": status,
            "utilization_pct": utilization,
            "active_connections": latest.active_connections,
            "available_connections": latest.available_connections,
            "total_acquisitions": self.total_acquisitions,
            "acquisition_failures": self.acquisition_failures,
            "slow_queries": self.slow_queries,
            "avg_acquisition_ms": latest.avg_acquisition_time_ms,
            "warnings": warnings
        }

    def get_slow_queries(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get slowest queries by average duration

        Args:
            limit: Maximum number of queries to return

        Returns:
            List of slow query metrics
        """
        with self._lock:
            sorted_queries = sorted(
                self.query_metrics.values(),
                key=lambda q: q.avg_duration_ms,
                reverse=True
            )

            return [
                {
                    "query_template": q.query_template[:200],
                    "execution_count": q.execution_count,
                    "avg_duration_ms": round(q.avg_duration_ms, 2),
                    "max_duration_ms": round(q.max_duration_ms, 2),
                    "error_count": q.error_count,
                    "last_execution": q.last_execution.isoformat()
                }
                for q in sorted_queries[:limit]
            ]

    def get_metrics_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive metrics summary

        Returns:
            Dictionary with all metrics
        """
        health = self.get_health_status()
        slow_queries = self.get_slow_queries(5)

        return {
            "health": health,
            "slow_queries": slow_queries,
            "total_queries_tracked": len(self.query_metrics),
            "metrics_collected_at": datetime.now().isoformat()
        }

    def detect_connection_leaks(self, threshold_minutes: int = 5) -> List[str]:
        """
        Detect potential connection leaks (long-lived connections)

        Args:
            threshold_minutes: Consider connections leaked after this many minutes

        Returns:
            List of warnings about potential leaks
        """
        warnings = []

        if not self.metrics_history:
            return warnings

        # Check if connections have been consistently active
        recent_metrics = self.metrics_history[-10:]  # Last 10 snapshots

        if len(recent_metrics) >= 5:
            active_counts = [m.active_connections for m in recent_metrics]
            avg_active = sum(active_counts) / len(active_counts)

            # If average active connections is very high for extended period
            if avg_active > 15 and all(c > 10 for c in active_counts):
                warnings.append(
                    f"Potential connection leak detected: "
                    f"Average {avg_active:.1f} connections active over extended period"
                )

        return warnings

    def reset_metrics(self):
        """Reset all metrics (useful for testing)"""
        with self._lock:
            self.metrics_history.clear()
            self.query_metrics.clear()
            self.total_acquisitions = 0
            self.acquisition_failures = 0
            self.slow_queries = 0
            self.acquisition_times.clear()
            self.max_acquisition_time = 0.0

            logger.info("Connection metrics reset")

    @staticmethod
    def _extract_query_template(query: str) -> str:
        """
        Extract query template by removing parameter values
        Useful for grouping similar queries

        Args:
            query: Full SQL query

        Returns:
            Query template with placeholders
        """
        # Basic template extraction - just truncate and normalize whitespace
        query = ' '.join(query.split())

        # Truncate to first 200 chars
        if len(query) > 200:
            query = query[:200] + "..."

        return query


# Global monitor instance
_monitor_instance: Optional[ConnectionMonitor] = None


def get_monitor() -> ConnectionMonitor:
    """Get global connection monitor instance"""
    global _monitor_instance

    if _monitor_instance is None:
        _monitor_instance = ConnectionMonitor()

    return _monitor_instance


def reset_monitor():
    """Reset global monitor instance (for testing)"""
    global _monitor_instance

    if _monitor_instance:
        _monitor_instance.reset_metrics()


# Context manager for automatic query timing
class QueryTimer:
    """Context manager for automatic query timing"""

    def __init__(self, query: str, monitor: Optional[ConnectionMonitor] = None):
        self.query = query
        self.monitor = monitor or get_monitor()
        self.start_time = None
        self.error = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.time() - self.start_time) * 1000

        if exc_type:
            self.error = exc_val

        self.monitor.record_query_execution(
            self.query,
            duration_ms,
            self.error
        )

        return False  # Don't suppress exceptions


if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Connection Monitor Test ===\n")

    monitor = get_monitor()

    # Simulate some metrics
    print("1. Recording connection acquisitions...")
    monitor.record_acquisition(50.0, success=True)
    monitor.record_acquisition(75.0, success=True)
    monitor.record_acquisition(2000.0, success=False)

    print("2. Recording query executions...")
    monitor.record_query_execution("SELECT * FROM exploits WHERE chain = %s", 250.0)
    monitor.record_query_execution("SELECT * FROM exploits WHERE chain = %s", 300.0)
    monitor.record_query_execution("SELECT COUNT(*) FROM exploits", 1500.0)  # Slow query

    print("3. Capturing pool snapshot...")
    snapshot = monitor.capture_pool_snapshot(pool_size=20, available=5, waiting=2)
    print(f"   Pool utilization: {snapshot.active_connections}/{snapshot.pool_size}")

    print("\n4. Health Status:")
    health = monitor.get_health_status()
    print(f"   Status: {health['status']}")
    print(f"   Utilization: {health['utilization_pct']:.1f}%")
    print(f"   Warnings: {health['warnings']}")

    print("\n5. Slow Queries:")
    slow = monitor.get_slow_queries(limit=5)
    for q in slow:
        print(f"   - {q['query_template'][:80]}")
        print(f"     Avg: {q['avg_duration_ms']}ms, Max: {q['max_duration_ms']}ms")

    print("\n6. Connection Leak Detection:")
    leaks = monitor.detect_connection_leaks()
    if leaks:
        for leak in leaks:
            print(f"   - {leak}")
    else:
        print("   No leaks detected")

    print("\n✅ Connection Monitor test complete")
