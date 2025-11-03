# -*- coding: utf-8 -*-
"""
Unified Cache Manager for Kamiyo
Provides caching interface with Redis backend and in-memory L1 cache
"""

import asyncio
import hashlib
import json
import logging
import pickle
import time
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Set, Union
from datetime import datetime, timedelta
from decimal import Decimal

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from monitoring.prometheus_metrics import cache_operations_total

logger = logging.getLogger(__name__)


class CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for Decimal and datetime types"""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, (datetime,)):
            return obj.isoformat()
        elif isinstance(obj, timedelta):
            return obj.total_seconds()
        return super().default(obj)


class CacheStats:
    """Track cache statistics"""

    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.sets = 0
        self.deletes = 0
        self.errors = 0
        self.total_get_time = 0.0
        self.total_set_time = 0.0

    def hit(self, duration: float = 0.0):
        """Record cache hit"""
        self.hits += 1
        self.total_get_time += duration

    def miss(self, duration: float = 0.0):
        """Record cache miss"""
        self.misses += 1
        self.total_get_time += duration

    def set(self, duration: float = 0.0):
        """Record cache set"""
        self.sets += 1
        self.total_set_time += duration

    def delete(self):
        """Record cache delete"""
        self.deletes += 1

    def error(self):
        """Record cache error"""
        self.errors += 1

    @property
    def hit_rate(self) -> float:
        """Calculate hit rate"""
        total = self.hits + self.misses
        return (self.hits / total * 100) if total > 0 else 0.0

    @property
    def avg_get_time(self) -> float:
        """Calculate average get time"""
        total_ops = self.hits + self.misses
        return self.total_get_time / total_ops if total_ops > 0 else 0.0

    @property
    def avg_set_time(self) -> float:
        """Calculate average set time"""
        return self.total_set_time / self.sets if self.sets > 0 else 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'hits': self.hits,
            'misses': self.misses,
            'sets': self.sets,
            'deletes': self.deletes,
            'errors': self.errors,
            'hit_rate': self.hit_rate,
            'avg_get_time_ms': self.avg_get_time * 1000,
            'avg_set_time_ms': self.avg_set_time * 1000,
        }


class L1Cache:
    """In-memory LRU cache (L1)"""

    def __init__(self, max_size: int = 1000, ttl: int = 60):
        self.max_size = max_size
        self.ttl = ttl
        self.cache: Dict[str, tuple] = {}  # key -> (value, expiry_time)
        self.access_times: Dict[str, float] = {}

    def get(self, key: str) -> Optional[Any]:
        """Get value from L1 cache"""
        if key not in self.cache:
            return None

        value, expiry = self.cache[key]

        # Check expiry
        if expiry and time.time() > expiry:
            del self.cache[key]
            if key in self.access_times:
                del self.access_times[key]
            return None

        # Update access time
        self.access_times[key] = time.time()
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set value in L1 cache"""
        # Evict if at capacity
        if len(self.cache) >= self.max_size and key not in self.cache:
            self._evict_lru()

        ttl = ttl or self.ttl
        expiry = time.time() + ttl if ttl > 0 else None
        self.cache[key] = (value, expiry)
        self.access_times[key] = time.time()

    def delete(self, key: str):
        """Delete key from L1 cache"""
        if key in self.cache:
            del self.cache[key]
        if key in self.access_times:
            del self.access_times[key]

    def clear(self):
        """Clear all cache"""
        self.cache.clear()
        self.access_times.clear()

    def _evict_lru(self):
        """Evict least recently used item"""
        if not self.access_times:
            return

        lru_key = min(self.access_times.items(), key=lambda x: x[1])[0]
        self.delete(lru_key)

    @property
    def size(self) -> int:
        """Get current cache size"""
        return len(self.cache)


class CacheManager:
    """
    Unified cache manager with multi-level caching

    L1: In-memory LRU cache (fast, limited size)
    L2: Redis cache (persistent, larger capacity)
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        namespace: str = "kamiyo",
        enable_l1: bool = True,
        l1_max_size: int = 1000,
        l1_ttl: int = 60,
        serializer: str = "json"  # json or pickle
    ):
        self.redis_url = redis_url
        self.namespace = namespace
        self.enable_l1 = enable_l1
        self.serializer = serializer

        # Redis connection (lazy initialization)
        self._redis: Optional[aioredis.Redis] = None
        self._connecting = False

        # L1 cache
        self.l1 = L1Cache(max_size=l1_max_size, ttl=l1_ttl) if enable_l1 else None

        # Statistics
        self.stats = CacheStats()
        self.per_key_stats: Dict[str, CacheStats] = {}

        # Cache key patterns for invalidation
        self.key_patterns: Set[str] = set()

    async def connect(self):
        """Connect to Redis with graceful degradation"""
        if self._redis is not None:
            return

        if self._connecting:
            # Wait for existing connection attempt
            while self._connecting:
                await asyncio.sleep(0.1)
            return

        self._connecting = True
        try:
            self._redis = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False,  # Handle binary data
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            await self._redis.ping()
            logger.info(f"Connected to Redis: {self.redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable, running without L2 cache: {e}")
            self._redis = None
            # Don't raise - gracefully degrade to L1 only
        finally:
            self._connecting = False

    async def disconnect(self):
        """Disconnect from Redis"""
        if self._redis:
            await self._redis.close()
            self._redis = None
            logger.info("Disconnected from Redis")

    def _make_key(self, key: str) -> str:
        """Create namespaced cache key"""
        return f"{self.namespace}:{key}"

    def _serialize(self, value: Any) -> bytes:
        """Serialize value for storage"""
        if self.serializer == "json":
            return json.dumps(value, cls=CustomJSONEncoder).encode('utf-8')
        else:
            return pickle.dumps(value)

    def _deserialize(self, data: bytes) -> Any:
        """Deserialize value from storage"""
        if self.serializer == "json":
            return json.loads(data.decode('utf-8'))
        else:
            return pickle.loads(data)

    async def get(self, key: str, default: Any = None) -> Any:
        """
        Get value from cache

        Args:
            key: Cache key
            default: Default value if not found

        Returns:
            Cached value or default
        """
        start_time = time.time()
        full_key = self._make_key(key)

        try:
            # Try L1 cache first
            if self.l1:
                value = self.l1.get(full_key)
                if value is not None:
                    duration = time.time() - start_time
                    self.stats.hit(duration)
                    self._update_key_stats(key, hit=True, duration=duration)
                    cache_operations_total.labels(
                        operation='get',
                        result='hit_l1'
                    ).inc()
                    return value

            # Try Redis (L2)
            if self._redis is None:
                await self.connect()

            # If still no Redis connection, return default
            if self._redis is None:
                duration = time.time() - start_time
                self.stats.miss(duration)
                self._update_key_stats(key, hit=False, duration=duration)
                cache_operations_total.labels(
                    operation='get',
                    result='miss'
                ).inc()
                return default

            data = await self._redis.get(full_key)

            if data is not None:
                value = self._deserialize(data)

                # Populate L1 cache
                if self.l1:
                    self.l1.set(full_key, value)

                duration = time.time() - start_time
                self.stats.hit(duration)
                self._update_key_stats(key, hit=True, duration=duration)
                cache_operations_total.labels(
                    operation='get',
                    result='hit_l2'
                ).inc()
                return value
            else:
                duration = time.time() - start_time
                self.stats.miss(duration)
                self._update_key_stats(key, hit=False, duration=duration)
                cache_operations_total.labels(
                    operation='get',
                    result='miss'
                ).inc()
                return default

        except RedisError as e:
            logger.error(f"Redis error in get: {e}")
            self.stats.error()
            return default
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self.stats.error()
            return default

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        nx: bool = False,
        xx: bool = False
    ) -> bool:
        """
        Set value in cache

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (None = no expiry)
            nx: Only set if key doesn't exist
            xx: Only set if key exists

        Returns:
            True if set successfully
        """
        start_time = time.time()
        full_key = self._make_key(key)

        try:
            # Set in L1
            if self.l1:
                self.l1.set(full_key, value, ttl)

            # Set in Redis (L2)
            if self._redis is None:
                await self.connect()

            # If Redis unavailable, still return success (L1 cache is set)
            if self._redis is None:
                duration = time.time() - start_time
                self.stats.set(duration)
                cache_operations_total.labels(
                    operation='set',
                    result='l1_only'
                ).inc()
                self.key_patterns.add(key.split(':')[0])
                return True

            data = self._serialize(value)

            if nx:
                result = await self._redis.set(full_key, data, ex=ttl, nx=True)
            elif xx:
                result = await self._redis.set(full_key, data, ex=ttl, xx=True)
            else:
                result = await self._redis.set(full_key, data, ex=ttl)

            duration = time.time() - start_time
            self.stats.set(duration)
            cache_operations_total.labels(
                operation='set',
                result='success'
            ).inc()

            # Track key pattern
            self.key_patterns.add(key.split(':')[0])

            return bool(result)

        except RedisError as e:
            logger.error(f"Redis error in set: {e}")
            self.stats.error()
            return False
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            self.stats.error()
            return False

    async def delete(self, key: str) -> bool:
        """
        Delete key from cache

        Args:
            key: Cache key

        Returns:
            True if deleted successfully
        """
        full_key = self._make_key(key)

        try:
            # Delete from L1
            if self.l1:
                self.l1.delete(full_key)

            # Delete from Redis
            if self._redis is None:
                await self.connect()

            # If Redis unavailable, still return success (L1 deleted)
            if self._redis is None:
                self.stats.delete()
                cache_operations_total.labels(
                    operation='delete',
                    result='l1_only'
                ).inc()
                return True

            result = await self._redis.delete(full_key)
            self.stats.delete()
            cache_operations_total.labels(
                operation='delete',
                result='success'
            ).inc()

            return result > 0

        except RedisError as e:
            logger.error(f"Redis error in delete: {e}")
            self.stats.error()
            return False
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            self.stats.error()
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern

        Args:
            pattern: Key pattern (e.g., "user:*")

        Returns:
            Number of keys deleted
        """
        full_pattern = self._make_key(pattern)

        try:
            if self._redis is None:
                await self.connect()

            # Scan for matching keys
            keys = []
            async for key in self._redis.scan_iter(match=full_pattern, count=100):
                keys.append(key)

            if keys:
                # Delete in batches
                deleted = await self._redis.delete(*keys)

                # Clear L1 cache (conservative approach)
                if self.l1:
                    self.l1.clear()

                logger.info(f"Deleted {deleted} keys matching pattern: {pattern}")
                return deleted
            return 0

        except RedisError as e:
            logger.error(f"Redis error in delete_pattern: {e}")
            self.stats.error()
            return 0
        except Exception as e:
            logger.error(f"Cache delete_pattern error: {e}")
            self.stats.error()
            return 0

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        full_key = self._make_key(key)

        try:
            # Check L1
            if self.l1 and self.l1.get(full_key) is not None:
                return True

            # Check Redis
            if self._redis is None:
                await self.connect()

            return await self._redis.exists(full_key) > 0

        except Exception as e:
            logger.error(f"Cache exists error: {e}")
            return False

    async def ttl(self, key: str) -> int:
        """Get time to live for key in seconds"""
        full_key = self._make_key(key)

        try:
            if self._redis is None:
                await self.connect()

            return await self._redis.ttl(full_key)

        except Exception as e:
            logger.error(f"Cache ttl error: {e}")
            return -2

    async def mget(self, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple values at once

        Args:
            keys: List of cache keys

        Returns:
            Dictionary of key -> value
        """
        result = {}
        redis_keys = []
        redis_key_map = {}

        for key in keys:
            full_key = self._make_key(key)

            # Check L1 first
            if self.l1:
                value = self.l1.get(full_key)
                if value is not None:
                    result[key] = value
                    continue

            redis_keys.append(full_key)
            redis_key_map[full_key] = key

        # Fetch remaining from Redis
        if redis_keys:
            try:
                if self._redis is None:
                    await self.connect()

                values = await self._redis.mget(redis_keys)

                for full_key, data in zip(redis_keys, values):
                    if data is not None:
                        key = redis_key_map[full_key]
                        value = self._deserialize(data)
                        result[key] = value

                        # Populate L1
                        if self.l1:
                            self.l1.set(full_key, value)

            except Exception as e:
                logger.error(f"Cache mget error: {e}")

        return result

    async def mset(self, mapping: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """
        Set multiple key-value pairs at once

        Args:
            mapping: Dictionary of key -> value
            ttl: Time to live in seconds

        Returns:
            True if successful
        """
        try:
            # Set in L1
            if self.l1:
                for key, value in mapping.items():
                    full_key = self._make_key(key)
                    self.l1.set(full_key, value, ttl)

            # Set in Redis
            if self._redis is None:
                await self.connect()

            # Serialize values
            redis_mapping = {}
            for key, value in mapping.items():
                full_key = self._make_key(key)
                redis_mapping[full_key] = self._serialize(value)

            # Use pipeline for efficiency
            async with self._redis.pipeline(transaction=False) as pipe:
                pipe.mset(redis_mapping)

                if ttl:
                    for key in redis_mapping.keys():
                        pipe.expire(key, ttl)

                await pipe.execute()

            return True

        except Exception as e:
            logger.error(f"Cache mset error: {e}")
            return False

    async def clear(self):
        """Clear all cache in namespace"""
        try:
            # Clear L1
            if self.l1:
                self.l1.clear()

            # Clear Redis namespace
            if self._redis is None:
                await self.connect()

            pattern = f"{self.namespace}:*"
            keys = []
            async for key in self._redis.scan_iter(match=pattern, count=100):
                keys.append(key)

            if keys:
                await self._redis.delete(*keys)

            logger.info(f"Cleared cache namespace: {self.namespace}")

        except Exception as e:
            logger.error(f"Cache clear error: {e}")

    def _update_key_stats(self, key: str, hit: bool, duration: float):
        """Update per-key statistics"""
        if key not in self.per_key_stats:
            self.per_key_stats[key] = CacheStats()

        if hit:
            self.per_key_stats[key].hit(duration)
        else:
            self.per_key_stats[key].miss(duration)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            'global': self.stats.to_dict(),
            'l1_size': self.l1.size if self.l1 else 0,
            'l1_max_size': self.l1.max_size if self.l1 else 0,
        }

    def get_key_stats(self, key: str) -> Optional[Dict[str, Any]]:
        """Get statistics for specific key"""
        if key in self.per_key_stats:
            return self.per_key_stats[key].to_dict()
        return None


# Global cache manager instance
_cache_manager: Optional[CacheManager] = None


def get_cache_manager() -> CacheManager:
    """Get global cache manager instance"""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager()
    return _cache_manager


def cached(
    ttl: int = 300,
    key_prefix: str = "",
    key_builder: Optional[Callable] = None
):
    """
    Decorator for caching function results

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
        key_builder: Custom function to build cache key from args/kwargs

    Example:
        @cached(ttl=300, key_prefix="exploit")
        async def get_exploit(tx_hash: str):
            # Expensive operation
            return result
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache = get_cache_manager()

            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Default key builder
                key_parts = [key_prefix or func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)

            # Try to get from cache
            result = await cache.get(cache_key)
            if result is not None:
                return result

            # Execute function
            result = await func(*args, **kwargs)

            # Store in cache
            if result is not None:
                await cache.set(cache_key, result, ttl=ttl)

            return result

        return wrapper
    return decorator


def cache_invalidate(pattern: str):
    """
    Decorator for cache invalidation

    Args:
        pattern: Cache key pattern to invalidate

    Example:
        @cache_invalidate(pattern="exploit:*")
        async def create_exploit(data: dict):
            # Create exploit
            return result
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Execute function
            result = await func(*args, **kwargs)

            # Invalidate cache
            cache = get_cache_manager()
            await cache.delete_pattern(pattern)

            return result

        return wrapper
    return decorator
