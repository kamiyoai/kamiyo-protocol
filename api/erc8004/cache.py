"""
Redis caching layer for ERC-8004 API
Production-grade caching with TTL management and invalidation
"""

from typing import Optional, Any, Callable, List
import redis.asyncio as redis
import json
import hashlib
from functools import wraps
import os
import logging

logger = logging.getLogger(__name__)


class ERC8004Cache:
    """
    Production-grade caching with Redis

    Features:
    - Configurable TTL per operation type
    - Automatic cache invalidation on updates
    - Pattern-based key management
    - JSON serialization with datetime support
    """

    def __init__(self):
        self.redis = redis.from_url(
            os.getenv('REDIS_URL', 'redis://localhost:6379'),
            encoding="utf-8",
            decode_responses=True
        )
        self.default_ttl = 300

    def cache_key(self, prefix: str, *args, **kwargs) -> str:
        """
        Generate consistent cache key

        Uses SHA256 hash of arguments for collision-resistant keys.
        """
        key_parts = [prefix] + [str(arg) for arg in args]
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}:{v}")

        key_string = ":".join(key_parts)
        key_hash = hashlib.sha256(key_string.encode()).hexdigest()[:32]  # Use first 32 chars
        return f"erc8004:{prefix}:{key_hash}"

    async def get(self, key: str) -> Optional[Any]:
        """
        Get cached value

        Returns None if key doesn't exist or on error.
        """
        try:
            value = await self.redis.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.error(f"Cache get failed for {key}: {e}")
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set cached value with TTL

        Args:
            key: Cache key
            value: Value to cache (must be JSON serializable)
            ttl: Time to live in seconds (default: 300)

        Returns:
            True if successful, False otherwise
        """
        try:
            await self.redis.setex(
                key,
                ttl or self.default_ttl,
                json.dumps(value, default=str)
            )
            return True
        except Exception as e:
            logger.error(f"Cache set failed for {key}: {e}")
            return False

    async def delete(self, pattern: str) -> int:
        """
        Delete keys matching pattern

        Args:
            pattern: Pattern to match (e.g., "*agent_uuid*")

        Returns:
            Number of keys deleted
        """
        try:
            keys = await self.redis.keys(f"erc8004:*{pattern}*")
            if keys:
                return await self.redis.delete(*keys)
        except Exception as e:
            logger.error(f"Cache delete failed for pattern {pattern}: {e}")
        return 0

    async def invalidate_agent(self, agent_uuid: str):
        """
        Invalidate all caches for an agent

        Called when agent data is updated or feedback is submitted.
        """
        pattern = f"*{agent_uuid}*"
        deleted = await self.delete(pattern)
        logger.info(f"Invalidated {deleted} cache keys for agent {agent_uuid}")

    async def invalidate_prefix(self, prefix: str):
        """
        Invalidate all caches with a specific prefix

        Useful for clearing entire operation types.
        """
        try:
            keys = await self.redis.keys(f"erc8004:{prefix}:*")
            if keys:
                deleted = await self.redis.delete(*keys)
                logger.info(f"Invalidated {deleted} cache keys with prefix {prefix}")
                return deleted
        except Exception as e:
            logger.error(f"Cache invalidation failed for prefix {prefix}: {e}")
        return 0


def cached(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator for caching function results

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key (default: function name)

    Usage:
        @cached(ttl=60, key_prefix="agent_stats")
        async def get_agent_stats(agent_uuid: str):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache = ERC8004Cache()

            cache_key = cache.cache_key(
                key_prefix or func.__name__,
                *args,
                **kwargs
            )

            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value

            logger.debug(f"Cache miss: {cache_key}")
            result = await func(*args, **kwargs)

            await cache.set(cache_key, result, ttl)

            return result
        return wrapper
    return decorator


class CacheWarmer:
    """
    Helper for warming up caches proactively

    Useful for frequently accessed data.
    """

    def __init__(self, cache: ERC8004Cache):
        self.cache = cache

    async def warm_agent_stats(self, agent_uuids: List[str], db):
        """
        Warm cache for agent stats

        Args:
            agent_uuids: List of agent UUIDs to warm
            db: Database connection
        """
        for agent_uuid in agent_uuids:
            try:
                result = await db.fetch_one("""
                    SELECT * FROM v_erc8004_agent_stats
                    WHERE agent_uuid = %s
                """, (agent_uuid,))

                if result:
                    cache_key = self.cache.cache_key("agent_stats", agent_uuid)
                    await self.cache.set(cache_key, dict(result), ttl=300)
                    logger.info(f"Warmed cache for agent {agent_uuid}")
            except Exception as e:
                logger.error(f"Failed to warm cache for agent {agent_uuid}: {e}")

    async def warm_search_results(self, db, limit: int = 50):
        """
        Warm cache for popular search queries

        Pre-caches common search patterns.
        """
        queries = [
            {"status": "active", "limit": 50},
            {"status": "active", "trust_level": "excellent", "limit": 50},
            {"chain": "base", "limit": 50},
        ]

        for query in queries:
            try:
                cache_key = self.cache.cache_key("agent_search", **query)

                conditions = ["status = %s"]
                params = [query.get("status", "active")]

                if "trust_level" in query:
                    conditions.append("trust_level = %s")
                    params.append(query["trust_level"])

                if "chain" in query:
                    conditions.append("chain = %s")
                    params.append(query["chain"])

                where_clause = " AND ".join(conditions)
                params.append(query.get("limit", 50))

                results = await db.fetch_all(f"""
                    SELECT * FROM v_erc8004_agent_stats
                    WHERE {where_clause}
                    ORDER BY registered_at DESC
                    LIMIT %s
                """, tuple(params))

                await self.cache.set(cache_key, [dict(r) for r in results], ttl=60)
                logger.info(f"Warmed search cache for query {query}")
            except Exception as e:
                logger.error(f"Failed to warm search cache: {e}")
