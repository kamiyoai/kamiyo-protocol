# -*- coding: utf-8 -*-
"""
Cache Metrics for Kamiyo
Comprehensive cache performance tracking and monitoring
"""

import time
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from functools import wraps

from prometheus_client import Counter, Histogram, Gauge, Summary
from prometheus_client import CollectorRegistry

logger = logging.getLogger(__name__)


class CacheMetricsCollector:
    """
    Collects and tracks cache metrics for Prometheus
    """

    def __init__(self, registry: Optional[CollectorRegistry] = None):
        self.registry = registry

        # ==========================================
        # CACHE OPERATION METRICS
        # ==========================================

        # Cache hits/misses
        self.cache_hits = Counter(
            'kamiyo_cache_hits_total',
            'Total number of cache hits',
            ['cache_level', 'key_pattern'],
            registry=registry
        )

        self.cache_misses = Counter(
            'kamiyo_cache_misses_total',
            'Total number of cache misses',
            ['key_pattern'],
            registry=registry
        )

        # Cache operations
        self.cache_operations = Counter(
            'kamiyo_cache_operations_total',
            'Total cache operations',
            ['operation', 'status'],  # operation: get, set, delete; status: success, error
            registry=registry
        )

        # Operation latency
        self.cache_operation_latency = Histogram(
            'kamiyo_cache_operation_latency_seconds',
            'Cache operation latency',
            ['operation', 'cache_level'],
            buckets=[0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
            registry=registry
        )

        # ==========================================
        # CACHE SIZE METRICS
        # ==========================================

        # Cache size
        self.cache_size = Gauge(
            'kamiyo_cache_size_items',
            'Number of items in cache',
            ['cache_level'],
            registry=registry
        )

        # Memory usage
        self.cache_memory_bytes = Gauge(
            'kamiyo_cache_memory_bytes',
            'Cache memory usage in bytes',
            ['cache_level'],
            registry=registry
        )

        # ==========================================
        # CACHE PERFORMANCE METRICS
        # ==========================================

        # Hit rate
        self.cache_hit_rate = Gauge(
            'kamiyo_cache_hit_rate',
            'Cache hit rate (0-1)',
            ['key_pattern'],
            registry=registry
        )

        # Eviction count
        self.cache_evictions = Counter(
            'kamiyo_cache_evictions_total',
            'Total number of cache evictions',
            ['cache_level', 'reason'],  # reason: size, ttl, manual
            registry=registry
        )

        # ==========================================
        # INVALIDATION METRICS
        # ==========================================

        # Invalidations
        self.cache_invalidations = Counter(
            'kamiyo_cache_invalidations_total',
            'Total cache invalidations',
            ['event_type', 'pattern'],
            registry=registry
        )

        # Keys invalidated
        self.cache_keys_invalidated = Counter(
            'kamiyo_cache_keys_invalidated_total',
            'Total keys invalidated',
            registry=registry
        )

        # ==========================================
        # WARMING METRICS
        # ==========================================

        # Warming operations
        self.cache_warmings = Counter(
            'kamiyo_cache_warmings_total',
            'Total cache warming operations',
            ['warming_type', 'status'],  # type: startup, scheduled, predictive
            registry=registry
        )

        # Warming latency
        self.cache_warming_latency = Histogram(
            'kamiyo_cache_warming_latency_seconds',
            'Cache warming latency',
            ['warming_type'],
            buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0],
            registry=registry
        )

        # ==========================================
        # CONNECTION METRICS
        # ==========================================

        # Redis connections
        self.redis_connections = Gauge(
            'kamiyo_redis_connections',
            'Number of Redis connections',
            ['state'],  # state: active, idle
            registry=registry
        )

        # Connection errors
        self.redis_errors = Counter(
            'kamiyo_redis_errors_total',
            'Total Redis errors',
            ['error_type'],
            registry=registry
        )

        # ==========================================
        # PERFORMANCE COMPARISON METRICS
        # ==========================================

        # Query time with cache
        self.query_time_cached = Summary(
            'kamiyo_query_time_cached_seconds',
            'Query execution time with cache',
            ['endpoint'],
            registry=registry
        )

        # Query time without cache
        self.query_time_uncached = Summary(
            'kamiyo_query_time_uncached_seconds',
            'Query execution time without cache',
            ['endpoint'],
            registry=registry
        )

        # ==========================================
        # INTERNAL TRACKING
        # ==========================================

        # Track hits/misses per pattern
        self._pattern_hits: Dict[str, int] = {}
        self._pattern_misses: Dict[str, int] = {}
        self._pattern_last_update: Dict[str, datetime] = {}

    def record_hit(self, cache_level: str = 'redis', key_pattern: str = 'unknown', latency: float = 0.0):
        """
        Record cache hit

        Args:
            cache_level: L1 (memory) or L2 (redis)
            key_pattern: Cache key pattern
            latency: Operation latency in seconds
        """
        self.cache_hits.labels(
            cache_level=cache_level,
            key_pattern=key_pattern
        ).inc()

        if latency > 0:
            self.cache_operation_latency.labels(
                operation='get',
                cache_level=cache_level
            ).observe(latency)

        self.cache_operations.labels(
            operation='get',
            status='hit'
        ).inc()

        # Update pattern tracking
        self._pattern_hits[key_pattern] = self._pattern_hits.get(key_pattern, 0) + 1
        self._update_hit_rate(key_pattern)

    def record_miss(self, key_pattern: str = 'unknown', latency: float = 0.0):
        """
        Record cache miss

        Args:
            key_pattern: Cache key pattern
            latency: Operation latency in seconds
        """
        self.cache_misses.labels(
            key_pattern=key_pattern
        ).inc()

        if latency > 0:
            self.cache_operation_latency.labels(
                operation='get',
                cache_level='none'
            ).observe(latency)

        self.cache_operations.labels(
            operation='get',
            status='miss'
        ).inc()

        # Update pattern tracking
        self._pattern_misses[key_pattern] = self._pattern_misses.get(key_pattern, 0) + 1
        self._update_hit_rate(key_pattern)

    def record_set(self, cache_level: str = 'redis', latency: float = 0.0, success: bool = True):
        """
        Record cache set operation

        Args:
            cache_level: Cache level
            latency: Operation latency
            success: Whether operation succeeded
        """
        status = 'success' if success else 'error'

        self.cache_operations.labels(
            operation='set',
            status=status
        ).inc()

        if latency > 0:
            self.cache_operation_latency.labels(
                operation='set',
                cache_level=cache_level
            ).observe(latency)

    def record_delete(self, cache_level: str = 'redis', latency: float = 0.0, success: bool = True):
        """
        Record cache delete operation

        Args:
            cache_level: Cache level
            latency: Operation latency
            success: Whether operation succeeded
        """
        status = 'success' if success else 'error'

        self.cache_operations.labels(
            operation='delete',
            status=status
        ).inc()

        if latency > 0:
            self.cache_operation_latency.labels(
                operation='delete',
                cache_level=cache_level
            ).observe(latency)

    def record_eviction(self, cache_level: str = 'redis', reason: str = 'ttl'):
        """
        Record cache eviction

        Args:
            cache_level: Cache level
            reason: Eviction reason (size, ttl, manual)
        """
        self.cache_evictions.labels(
            cache_level=cache_level,
            reason=reason
        ).inc()

    def record_invalidation(self, event_type: str, pattern: str, keys_count: int):
        """
        Record cache invalidation

        Args:
            event_type: Event triggering invalidation
            pattern: Key pattern
            keys_count: Number of keys invalidated
        """
        self.cache_invalidations.labels(
            event_type=event_type,
            pattern=pattern
        ).inc()

        self.cache_keys_invalidated.inc(keys_count)

    def record_warming(self, warming_type: str, success: bool, latency: float = 0.0):
        """
        Record cache warming operation

        Args:
            warming_type: Type of warming (startup, scheduled, predictive)
            success: Whether warming succeeded
            latency: Warming latency
        """
        status = 'success' if success else 'error'

        self.cache_warmings.labels(
            warming_type=warming_type,
            status=status
        ).inc()

        if latency > 0:
            self.cache_warming_latency.labels(
                warming_type=warming_type
            ).observe(latency)

    def record_redis_error(self, error_type: str):
        """
        Record Redis error

        Args:
            error_type: Type of error
        """
        self.redis_errors.labels(
            error_type=error_type
        ).inc()

    def update_cache_size(self, cache_level: str, size: int):
        """
        Update cache size metric

        Args:
            cache_level: Cache level
            size: Number of items
        """
        self.cache_size.labels(
            cache_level=cache_level
        ).set(size)

    def update_memory_usage(self, cache_level: str, bytes_used: int):
        """
        Update memory usage metric

        Args:
            cache_level: Cache level
            bytes_used: Memory usage in bytes
        """
        self.cache_memory_bytes.labels(
            cache_level=cache_level
        ).set(bytes_used)

    def update_redis_connections(self, active: int, idle: int):
        """
        Update Redis connection metrics

        Args:
            active: Active connections
            idle: Idle connections
        """
        self.redis_connections.labels(state='active').set(active)
        self.redis_connections.labels(state='idle').set(idle)

    def _update_hit_rate(self, key_pattern: str):
        """
        Update hit rate for key pattern

        Args:
            key_pattern: Cache key pattern
        """
        hits = self._pattern_hits.get(key_pattern, 0)
        misses = self._pattern_misses.get(key_pattern, 0)
        total = hits + misses

        if total > 0:
            hit_rate = hits / total
            self.cache_hit_rate.labels(
                key_pattern=key_pattern
            ).set(hit_rate)

        self._pattern_last_update[key_pattern] = datetime.now()

    def get_pattern_stats(self, key_pattern: str) -> Dict[str, Any]:
        """
        Get statistics for key pattern

        Args:
            key_pattern: Cache key pattern

        Returns:
            Statistics dictionary
        """
        hits = self._pattern_hits.get(key_pattern, 0)
        misses = self._pattern_misses.get(key_pattern, 0)
        total = hits + misses

        return {
            'hits': hits,
            'misses': misses,
            'total_requests': total,
            'hit_rate': (hits / total) if total > 0 else 0.0,
            'last_update': self._pattern_last_update.get(key_pattern),
        }

    def get_overall_stats(self) -> Dict[str, Any]:
        """
        Get overall cache statistics

        Returns:
            Statistics dictionary
        """
        total_hits = sum(self._pattern_hits.values())
        total_misses = sum(self._pattern_misses.values())
        total_requests = total_hits + total_misses

        return {
            'total_hits': total_hits,
            'total_misses': total_misses,
            'total_requests': total_requests,
            'overall_hit_rate': (total_hits / total_requests) if total_requests > 0 else 0.0,
            'patterns_tracked': len(self._pattern_hits),
        }


# Global metrics collector
_metrics_collector: Optional[CacheMetricsCollector] = None


def get_metrics_collector(registry: Optional[CollectorRegistry] = None) -> CacheMetricsCollector:
    """Get global metrics collector"""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = CacheMetricsCollector(registry=registry)
    return _metrics_collector


# Decorator for tracking cache performance
def track_cache_performance(endpoint: str):
    """
    Decorator to track cache performance impact

    Args:
        endpoint: Endpoint name

    Example:
        @track_cache_performance('get_exploits')
        async def get_exploits():
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            metrics = get_metrics_collector()
            start_time = time.time()

            result = await func(*args, **kwargs)

            duration = time.time() - start_time

            # Determine if cached
            # This is a simplified check - in practice, check cache hit/miss in function
            if hasattr(result, '_from_cache') and result._from_cache:
                metrics.query_time_cached.labels(endpoint=endpoint).observe(duration)
            else:
                metrics.query_time_uncached.labels(endpoint=endpoint).observe(duration)

            return result

        return wrapper
    return decorator
