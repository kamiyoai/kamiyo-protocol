# -*- coding: utf-8 -*-
"""
Redis-backed JWT Token Revocation Store
Addresses P0-1: Distributed token revocation with Redis persistence
"""

import os
import logging
import hashlib
from typing import Optional, Set
from datetime import datetime, timedelta
import redis
from redis.connection import ConnectionPool
from redis.exceptions import ConnectionError, TimeoutError, RedisError

logger = logging.getLogger(__name__)


class RedisTokenRevocationStore:
    """
    Production-ready token revocation store using Redis with fallback to in-memory.

    Features:
    - Redis persistence for distributed deployments
    - Automatic TTL matching token expiry (memory efficient)
    - Connection pooling for performance
    - Graceful degradation to in-memory if Redis unavailable
    - Comprehensive error handling and logging
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        pool_size: int = 10,
        socket_timeout: float = 5.0,
        socket_connect_timeout: float = 5.0,
        retry_on_timeout: bool = True,
        health_check_interval: int = 30
    ):
        """
        Initialize Redis token revocation store.

        Args:
            redis_url: Redis connection URL (defaults to env REDIS_URL)
            pool_size: Maximum number of connections in pool
            socket_timeout: Socket timeout in seconds
            socket_connect_timeout: Connection timeout in seconds
            retry_on_timeout: Whether to retry on timeout
            health_check_interval: Health check interval in seconds
        """
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self._redis_client: Optional[redis.Redis] = None
        self._connection_pool: Optional[ConnectionPool] = None
        self._use_redis = True  # Flag to track Redis availability

        # In-memory fallback for when Redis is unavailable
        self._memory_store: Set[str] = set()

        # Connection pool settings
        self._pool_size = pool_size
        self._socket_timeout = socket_timeout
        self._socket_connect_timeout = socket_connect_timeout
        self._retry_on_timeout = retry_on_timeout
        self._health_check_interval = health_check_interval

        # Key prefix for namespacing
        self._key_prefix = "kamiyo:token:revoked:"

        # Initialize Redis connection
        self._initialize_redis()

    def _initialize_redis(self) -> None:
        """Initialize Redis connection with connection pooling."""
        try:
            # Create connection pool
            self._connection_pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=self._pool_size,
                socket_timeout=self._socket_timeout,
                socket_connect_timeout=self._socket_connect_timeout,
                retry_on_timeout=self._retry_on_timeout,
                health_check_interval=self._health_check_interval,
                decode_responses=True  # Auto-decode strings
            )

            # Create Redis client
            self._redis_client = redis.Redis(
                connection_pool=self._connection_pool
            )

            # Test connection
            self._redis_client.ping()
            self._use_redis = True
            logger.info("Redis token revocation store initialized successfully")

        except (ConnectionError, TimeoutError, RedisError) as e:
            logger.warning(
                f"Failed to connect to Redis for token revocation: {e}. "
                f"Falling back to in-memory store. "
                f"WARNING: Token revocation will NOT work across multiple instances!"
            )
            self._use_redis = False
            self._redis_client = None
            self._connection_pool = None

    def _get_redis_key(self, token_jti: str) -> str:
        """
        Generate namespaced Redis key for token JTI.

        Args:
            token_jti: JWT token ID (jti claim)

        Returns:
            Namespaced Redis key
        """
        # Hash the JTI for consistent key length (security best practice)
        hashed_jti = hashlib.sha256(token_jti.encode()).hexdigest()
        return f"{self._key_prefix}{hashed_jti}"

    def revoke(
        self,
        token_jti: str,
        expires_in: int,
        user_id: Optional[str] = None,
        reason: str = "user_logout"
    ) -> bool:
        """
        Revoke a token by adding it to the revocation list.

        Args:
            token_jti: JWT token ID (jti claim) to revoke
            expires_in: Token TTL in seconds (auto-cleanup after expiry)
            user_id: Optional user ID for audit trail
            reason: Reason for revocation (for logging/audit)

        Returns:
            True if successfully revoked, False otherwise
        """
        redis_key = self._get_redis_key(token_jti)

        # Metadata for audit trail
        metadata = {
            "revoked_at": datetime.utcnow().isoformat(),
            "user_id": user_id or "unknown",
            "reason": reason
        }

        if self._use_redis and self._redis_client:
            try:
                # Store in Redis with TTL matching token expiry
                # This ensures automatic cleanup - no manual deletion needed
                self._redis_client.setex(
                    name=redis_key,
                    time=expires_in,
                    value=f"{metadata['revoked_at']}|{metadata['user_id']}|{metadata['reason']}"
                )

                logger.info(
                    f"Token revoked in Redis: jti={token_jti[:8]}..., "
                    f"user={user_id}, reason={reason}, ttl={expires_in}s"
                )
                return True

            except (ConnectionError, TimeoutError, RedisError) as e:
                logger.error(f"Redis revocation failed: {e}. Falling back to in-memory.")
                # Fall through to in-memory store
                self._use_redis = False

        # Fallback to in-memory store
        self._memory_store.add(token_jti)
        logger.warning(
            f"Token revoked in MEMORY (not distributed): jti={token_jti[:8]}..., "
            f"user={user_id}, reason={reason}. "
            f"WARNING: Revocation only effective on THIS instance!"
        )
        return True

    def is_revoked(self, token_jti: str) -> bool:
        """
        Check if a token has been revoked.

        Args:
            token_jti: JWT token ID (jti claim) to check

        Returns:
            True if token is revoked, False otherwise
        """
        redis_key = self._get_redis_key(token_jti)

        if self._use_redis and self._redis_client:
            try:
                # Check Redis (O(1) lookup)
                exists = self._redis_client.exists(redis_key)
                return exists > 0

            except (ConnectionError, TimeoutError, RedisError) as e:
                logger.error(
                    f"Redis check failed: {e}. Falling back to in-memory. "
                    f"SECURITY WARNING: May allow revoked tokens!"
                )
                # Fall through to in-memory check
                self._use_redis = False

        # Fallback to in-memory store
        # NOTE: This only checks local instance - revoked tokens on other instances
        # will NOT be detected. This is a known limitation of the fallback.
        return token_jti in self._memory_store

    def get_stats(self) -> dict:
        """
        Get revocation store statistics.

        Returns:
            Dictionary with store statistics
        """
        stats = {
            "backend": "redis" if self._use_redis else "memory",
            "redis_url": self.redis_url if self._use_redis else None,
            "memory_revoked_count": len(self._memory_store),
        }

        if self._use_redis and self._redis_client:
            try:
                # Get approximate count of revoked tokens in Redis
                # Using SCAN for production-safe counting (non-blocking)
                cursor = 0
                revoked_count = 0
                while True:
                    cursor, keys = self._redis_client.scan(
                        cursor=cursor,
                        match=f"{self._key_prefix}*",
                        count=100
                    )
                    revoked_count += len(keys)
                    if cursor == 0:
                        break

                stats["redis_revoked_count"] = revoked_count
                stats["redis_connection_pool_size"] = self._pool_size

            except (ConnectionError, TimeoutError, RedisError) as e:
                logger.error(f"Failed to get Redis stats: {e}")
                stats["redis_error"] = str(e)

        return stats

    def health_check(self) -> dict:
        """
        Perform health check on the revocation store.

        Returns:
            Dictionary with health status
        """
        health = {
            "status": "unknown",
            "backend": "redis" if self._use_redis else "memory",
            "timestamp": datetime.utcnow().isoformat()
        }

        if self._use_redis and self._redis_client:
            try:
                # Ping Redis
                self._redis_client.ping()
                health["status"] = "healthy"
                health["redis_available"] = True

            except (ConnectionError, TimeoutError, RedisError) as e:
                logger.error(f"Redis health check failed: {e}")
                health["status"] = "degraded"
                health["redis_available"] = False
                health["error"] = str(e)
                # Try to reinitialize
                self._initialize_redis()
        else:
            health["status"] = "degraded"
            health["redis_available"] = False
            health["warning"] = "Using in-memory fallback - revocation NOT distributed"

        return health

    def close(self) -> None:
        """Close Redis connection pool."""
        if self._connection_pool:
            try:
                self._connection_pool.disconnect()
                logger.info("Redis connection pool closed")
            except Exception as e:
                logger.error(f"Error closing Redis connection pool: {e}")

        self._redis_client = None
        self._connection_pool = None
        self._use_redis = False


# Singleton instance
_revocation_store: Optional[RedisTokenRevocationStore] = None


def get_revocation_store() -> RedisTokenRevocationStore:
    """
    Get singleton revocation store instance.

    Returns:
        RedisTokenRevocationStore instance
    """
    global _revocation_store
    if _revocation_store is None:
        _revocation_store = RedisTokenRevocationStore()
    return _revocation_store


def close_revocation_store() -> None:
    """Close the revocation store (call on shutdown)."""
    global _revocation_store
    if _revocation_store is not None:
        _revocation_store.close()
        _revocation_store = None
