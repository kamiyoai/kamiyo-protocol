# -*- coding: utf-8 -*-
"""
Timing-Safe Token Validation
Addresses P0-2: Prevent timing attacks on token validation
"""

import hmac
import time
import random
import logging
from typing import Optional, Tuple
from functools import wraps
from collections import defaultdict
from datetime import datetime, timedelta
import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class TimingSafeValidator:
    """
    Timing-safe token validation with constant-time comparisons and jitter.

    Features:
    - Constant-time string comparison (prevents timing attacks)
    - Random jitter (10-20ms) on all validation responses
    - Redis-backed rate limiting (10 attempts/min per IP)
    - Graceful degradation to in-memory rate limiting
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        rate_limit_window: int = 60,  # seconds
        rate_limit_max: int = 10,  # max attempts per window
        jitter_min_ms: int = 10,
        jitter_max_ms: int = 20
    ):
        """
        Initialize timing-safe validator.

        Args:
            redis_url: Redis connection URL (defaults to env REDIS_URL)
            rate_limit_window: Rate limit window in seconds
            rate_limit_max: Maximum validation attempts per window
            jitter_min_ms: Minimum random jitter in milliseconds
            jitter_max_ms: Maximum random jitter in milliseconds
        """
        import os
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self._rate_limit_window = rate_limit_window
        self._rate_limit_max = rate_limit_max
        self._jitter_min_ms = jitter_min_ms
        self._jitter_max_ms = jitter_max_ms

        # Redis client for distributed rate limiting
        self._redis_client: Optional[redis.Redis] = None
        self._use_redis = True

        # In-memory fallback for rate limiting
        # Structure: {ip_address: [timestamp1, timestamp2, ...]}
        self._rate_limit_memory: defaultdict = defaultdict(list)

        # Initialize Redis
        self._initialize_redis()

    def _initialize_redis(self) -> None:
        """Initialize Redis connection for rate limiting."""
        try:
            self._redis_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            self._redis_client.ping()
            self._use_redis = True
            logger.info("Timing-safe validator: Redis rate limiting enabled")

        except (ConnectionError, TimeoutError, RedisError) as e:
            logger.warning(
                f"Timing-safe validator: Failed to connect to Redis: {e}. "
                f"Falling back to in-memory rate limiting."
            )
            self._use_redis = False
            self._redis_client = None

    def _apply_jitter(self) -> None:
        """Apply random jitter to prevent timing attacks."""
        jitter_ms = random.uniform(self._jitter_min_ms, self._jitter_max_ms)
        time.sleep(jitter_ms / 1000.0)  # Convert to seconds

    def _constant_time_compare(self, a: str, b: str) -> bool:
        """
        Constant-time string comparison using HMAC.

        This prevents timing attacks by ensuring the comparison
        takes the same amount of time regardless of where the
        strings differ.

        Args:
            a: First string
            b: Second string

        Returns:
            True if strings match, False otherwise
        """
        # Use hmac.compare_digest for constant-time comparison
        # This is the recommended approach in Python's security docs
        return hmac.compare_digest(a, b)

    def _check_rate_limit_redis(self, identifier: str) -> Tuple[bool, int]:
        """
        Check rate limit using Redis (distributed).

        Args:
            identifier: IP address or user identifier

        Returns:
            Tuple of (is_allowed, remaining_attempts)
        """
        if not self._use_redis or not self._redis_client:
            return self._check_rate_limit_memory(identifier)

        try:
            key = f"kamiyo:ratelimit:token:{identifier}"
            current_time = int(time.time())
            window_start = current_time - self._rate_limit_window

            # Use Redis sorted set for efficient time-windowed rate limiting
            pipe = self._redis_client.pipeline()

            # Remove old entries outside the window
            pipe.zremrangebyscore(key, 0, window_start)

            # Count remaining entries
            pipe.zcard(key)

            # Add current request
            pipe.zadd(key, {str(current_time): current_time})

            # Set expiry on the key
            pipe.expire(key, self._rate_limit_window)

            # Execute pipeline
            results = pipe.execute()
            current_count = results[1]  # Count before adding

            is_allowed = current_count < self._rate_limit_max
            remaining = max(0, self._rate_limit_max - current_count - 1)

            if not is_allowed:
                logger.warning(
                    f"Rate limit exceeded for {identifier}: "
                    f"{current_count}/{self._rate_limit_max} in {self._rate_limit_window}s"
                )

            return is_allowed, remaining

        except RedisError as e:
            logger.error(f"Redis rate limit check failed: {e}. Falling back to memory.")
            self._use_redis = False
            return self._check_rate_limit_memory(identifier)

    def _check_rate_limit_memory(self, identifier: str) -> Tuple[bool, int]:
        """
        Check rate limit using in-memory store (single instance only).

        Args:
            identifier: IP address or user identifier

        Returns:
            Tuple of (is_allowed, remaining_attempts)
        """
        current_time = time.time()
        window_start = current_time - self._rate_limit_window

        # Clean old entries
        self._rate_limit_memory[identifier] = [
            ts for ts in self._rate_limit_memory[identifier]
            if ts > window_start
        ]

        # Check count
        current_count = len(self._rate_limit_memory[identifier])
        is_allowed = current_count < self._rate_limit_max

        if is_allowed:
            self._rate_limit_memory[identifier].append(current_time)
            remaining = self._rate_limit_max - current_count - 1
        else:
            remaining = 0
            logger.warning(
                f"Rate limit exceeded (memory) for {identifier}: "
                f"{current_count}/{self._rate_limit_max} in {self._rate_limit_window}s"
            )

        return is_allowed, remaining

    def validate_token_timing_safe(
        self,
        token_jti: str,
        expected_jti: str,
        client_ip: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate token with timing-attack protection.

        Features:
        1. Rate limiting (10/min per IP)
        2. Constant-time comparison
        3. Random jitter (10-20ms)

        Args:
            token_jti: JWT token ID from request
            expected_jti: Expected JWT token ID
            client_ip: Client IP address for rate limiting

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Step 1: Check rate limit BEFORE validation
        is_allowed, remaining = self._check_rate_limit_redis(client_ip)

        if not is_allowed:
            # Apply jitter even on rate limit to prevent timing analysis
            self._apply_jitter()
            return False, "Rate limit exceeded. Please try again later."

        # Step 2: Constant-time comparison
        # This prevents attackers from guessing tokens character by character
        is_valid = self._constant_time_compare(token_jti, expected_jti)

        # Step 3: Apply random jitter to ALL responses
        # This ensures response time doesn't leak information
        self._apply_jitter()

        if not is_valid:
            logger.warning(
                f"Token validation failed for IP {client_ip} "
                f"(remaining attempts: {remaining})"
            )
            return False, "Invalid token"

        logger.info(f"Token validation succeeded for IP {client_ip}")
        return True, None

    def get_stats(self) -> dict:
        """Get validator statistics."""
        stats = {
            "backend": "redis" if self._use_redis else "memory",
            "rate_limit_window_seconds": self._rate_limit_window,
            "rate_limit_max_attempts": self._rate_limit_max,
            "jitter_range_ms": f"{self._jitter_min_ms}-{self._jitter_max_ms}",
        }

        if not self._use_redis:
            stats["memory_tracked_ips"] = len(self._rate_limit_memory)

        return stats


# Singleton instance
_timing_validator: Optional[TimingSafeValidator] = None


def get_timing_validator() -> TimingSafeValidator:
    """
    Get singleton timing-safe validator instance.

    Returns:
        TimingSafeValidator instance
    """
    global _timing_validator
    if _timing_validator is None:
        _timing_validator = TimingSafeValidator()
    return _timing_validator


def timing_safe_validation(func):
    """
    Decorator to add timing-safe validation to any function.

    Usage:
        @timing_safe_validation
        async def validate_user_token(token: str, client_ip: str):
            # Your validation logic
            pass
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Apply jitter before function execution
        validator = get_timing_validator()
        validator._apply_jitter()

        # Execute function
        result = await func(*args, **kwargs)

        # Apply jitter after function execution
        validator._apply_jitter()

        return result

    return wrapper
