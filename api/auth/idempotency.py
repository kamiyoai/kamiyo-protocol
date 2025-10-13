# -*- coding: utf-8 -*-
"""
Deterministic Idempotency Key Generation
Addresses P0-3: Prevent duplicate operations on token generation retry
"""

import hashlib
import logging
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class IdempotencyManager:
    """
    Manages idempotency for critical operations to prevent duplicates on retry.

    Features:
    - Deterministic JTI generation (UUID v4 based on user + operation)
    - Redis-backed request deduplication
    - Configurable TTL for idempotency keys
    - Graceful degradation to in-memory store
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_ttl: int = 3600  # 1 hour
    ):
        """
        Initialize idempotency manager.

        Args:
            redis_url: Redis connection URL (defaults to env REDIS_URL)
            default_ttl: Default TTL for idempotency keys in seconds
        """
        import os
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self._default_ttl = default_ttl

        # Redis client for distributed idempotency
        self._redis_client: Optional[redis.Redis] = None
        self._use_redis = True

        # In-memory fallback
        # Structure: {idempotency_key: {"result": ..., "expires": timestamp}}
        self._memory_store: Dict[str, Dict[str, Any]] = {}

        # Initialize Redis
        self._initialize_redis()

    def _initialize_redis(self) -> None:
        """Initialize Redis connection."""
        try:
            self._redis_client = redis.from_url(
                self.redis_url,
                decode_responses=False,  # We'll handle encoding ourselves
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            self._redis_client.ping()
            self._use_redis = True
            logger.info("Idempotency manager: Redis storage enabled")

        except (ConnectionError, TimeoutError, RedisError) as e:
            logger.warning(
                f"Idempotency manager: Failed to connect to Redis: {e}. "
                f"Falling back to in-memory storage."
            )
            self._use_redis = False
            self._redis_client = None

    def generate_deterministic_jti(
        self,
        user_id: str,
        operation: str,
        timestamp: datetime,
        additional_context: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Generate deterministic JWT token ID (jti) for idempotency.

        The JTI is generated deterministically based on:
        - user_id
        - operation type
        - timestamp (rounded to nearest second)
        - optional additional context

        This ensures that retries of the same operation within the same second
        will generate the same JTI, preventing duplicate tokens.

        Args:
            user_id: User identifier
            operation: Operation type (e.g., "login", "refresh", "api_call")
            timestamp: Operation timestamp
            additional_context: Optional dict with additional context

        Returns:
            Deterministic UUID v4 string
        """
        # Round timestamp to nearest second for determinism
        timestamp_str = timestamp.replace(microsecond=0).isoformat()

        # Build deterministic seed
        seed_parts = [
            str(user_id),
            operation,
            timestamp_str
        ]

        # Add additional context if provided
        if additional_context:
            # Sort keys for determinism
            for key in sorted(additional_context.keys()):
                seed_parts.append(f"{key}={additional_context[key]}")

        seed = "|".join(seed_parts)

        # Generate deterministic UUID using SHA-256 hash
        # Use UUID namespace for proper UUID v5 generation
        # This is better than uuid4() which is random
        namespace = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # DNS namespace
        deterministic_uuid = uuid.uuid5(namespace, seed)

        logger.debug(
            f"Generated deterministic JTI for user={user_id}, "
            f"operation={operation}: {deterministic_uuid}"
        )

        return str(deterministic_uuid)

    def store_operation_result(
        self,
        idempotency_key: str,
        result: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> bool:
        """
        Store operation result for idempotency.

        Args:
            idempotency_key: Unique key for the operation
            result: Operation result to store
            ttl: TTL in seconds (defaults to default_ttl)

        Returns:
            True if stored successfully, False otherwise
        """
        ttl = ttl or self._default_ttl
        redis_key = f"kamiyo:idempotency:{idempotency_key}"

        if self._use_redis and self._redis_client:
            try:
                # Serialize result (we'll use JSON)
                import json
                serialized = json.dumps(result)

                # Store with TTL
                self._redis_client.setex(
                    name=redis_key,
                    time=ttl,
                    value=serialized
                )

                logger.debug(
                    f"Stored idempotency result: key={idempotency_key}, ttl={ttl}s"
                )
                return True

            except (RedisError, TypeError, ValueError) as e:
                logger.error(f"Failed to store idempotency result in Redis: {e}")
                self._use_redis = False
                # Fall through to memory store

        # Fallback to in-memory store
        expires = datetime.utcnow() + timedelta(seconds=ttl)
        self._memory_store[idempotency_key] = {
            "result": result,
            "expires": expires
        }

        logger.debug(
            f"Stored idempotency result in memory: key={idempotency_key}, ttl={ttl}s"
        )
        return True

    def get_operation_result(
        self,
        idempotency_key: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get stored operation result for idempotency check.

        Args:
            idempotency_key: Unique key for the operation

        Returns:
            Stored result if found and not expired, None otherwise
        """
        redis_key = f"kamiyo:idempotency:{idempotency_key}"

        if self._use_redis and self._redis_client:
            try:
                # Get from Redis
                serialized = self._redis_client.get(redis_key)

                if serialized:
                    import json
                    result = json.loads(serialized)
                    logger.info(
                        f"Idempotent operation detected: key={idempotency_key}. "
                        f"Returning cached result."
                    )
                    return result

            except (RedisError, TypeError, ValueError) as e:
                logger.error(f"Failed to get idempotency result from Redis: {e}")
                self._use_redis = False
                # Fall through to memory store

        # Check in-memory store
        if idempotency_key in self._memory_store:
            stored = self._memory_store[idempotency_key]

            # Check expiry
            if datetime.utcnow() < stored["expires"]:
                logger.info(
                    f"Idempotent operation detected (memory): key={idempotency_key}. "
                    f"Returning cached result."
                )
                return stored["result"]
            else:
                # Expired, remove
                del self._memory_store[idempotency_key]

        return None

    def clean_expired_memory_entries(self) -> int:
        """
        Clean expired entries from in-memory store.

        Returns:
            Number of entries removed
        """
        if not self._memory_store:
            return 0

        now = datetime.utcnow()
        expired_keys = [
            key for key, data in self._memory_store.items()
            if now >= data["expires"]
        ]

        for key in expired_keys:
            del self._memory_store[key]

        if expired_keys:
            logger.debug(f"Cleaned {len(expired_keys)} expired idempotency entries")

        return len(expired_keys)

    def create_idempotent_operation(
        self,
        user_id: str,
        operation: str,
        request_data: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> tuple[str, Optional[Dict[str, Any]]]:
        """
        Create idempotent operation with deduplication.

        This is a high-level helper that combines:
        1. Generate deterministic idempotency key
        2. Check if operation already executed
        3. Return cached result if found

        Args:
            user_id: User identifier
            operation: Operation type
            request_data: Request data for context
            ttl: TTL for idempotency in seconds

        Returns:
            Tuple of (idempotency_key, cached_result_or_None)
        """
        # Generate idempotency key
        timestamp = datetime.utcnow()
        idempotency_key = self.generate_deterministic_jti(
            user_id=user_id,
            operation=operation,
            timestamp=timestamp,
            additional_context={
                "request_hash": hashlib.sha256(
                    str(request_data).encode()
                ).hexdigest()[:16]
            }
        )

        # Check for existing result
        cached_result = self.get_operation_result(idempotency_key)

        return idempotency_key, cached_result

    def get_stats(self) -> dict:
        """Get idempotency manager statistics."""
        stats = {
            "backend": "redis" if self._use_redis else "memory",
            "default_ttl_seconds": self._default_ttl,
        }

        if not self._use_redis:
            # Clean expired entries first
            self.clean_expired_memory_entries()
            stats["memory_stored_operations"] = len(self._memory_store)

        return stats


# Singleton instance
_idempotency_manager: Optional[IdempotencyManager] = None


def get_idempotency_manager() -> IdempotencyManager:
    """
    Get singleton idempotency manager instance.

    Returns:
        IdempotencyManager instance
    """
    global _idempotency_manager
    if _idempotency_manager is None:
        _idempotency_manager = IdempotencyManager()
    return _idempotency_manager


def idempotent_operation(operation_name: str, ttl: int = 3600):
    """
    Decorator to make operations idempotent.

    Usage:
        @idempotent_operation("user_login", ttl=600)
        async def login_user(user_id: str, request_data: dict):
            # Your operation logic
            return {"token": "..."}

    If the same operation is called again within TTL, the cached result is returned.
    """
    def decorator(func):
        from functools import wraps

        @wraps(func)
        async def wrapper(user_id: str, request_data: Dict[str, Any], *args, **kwargs):
            manager = get_idempotency_manager()

            # Create idempotent operation
            idempotency_key, cached_result = manager.create_idempotent_operation(
                user_id=user_id,
                operation=operation_name,
                request_data=request_data,
                ttl=ttl
            )

            # Return cached result if found
            if cached_result is not None:
                logger.info(f"Returning cached result for {operation_name}")
                return cached_result

            # Execute operation
            result = await func(user_id, request_data, *args, **kwargs)

            # Store result for future idempotency
            manager.store_operation_result(idempotency_key, result, ttl=ttl)

            return result

        return wrapper
    return decorator
