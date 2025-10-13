# -*- coding: utf-8 -*-
"""
Authentication Rate Limiter
Addresses P1-3: Brute force protection against credential stuffing attacks

OWASP Best Practices:
- Progressive lockout (exponential backoff)
- Track by IP AND user identifier
- Distributed rate limiting via Redis
- Security team alerts on suspicious activity
- Graceful degradation to in-memory
"""

import os
import time
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    allowed: bool
    retry_after: int  # seconds
    attempts: int
    message: str


class AuthenticationRateLimiter:
    """
    Production-ready authentication rate limiter with progressive lockout.

    Features:
    - Progressive lockout: 5 fails = 1 min, 10 fails = 15 min, 20 fails = 1 hour
    - Exponential backoff on failed attempts
    - Track by IP AND user identifier
    - Redis-backed distributed limiting
    - Clear on successful auth
    - Security team alerts on 10+ failed attempts
    - Graceful degradation to in-memory

    Rate Limiting Strategy:
    - 5 failed attempts: 60 seconds lockout
    - 10 failed attempts: 900 seconds (15 min) lockout
    - 20 failed attempts: 3600 seconds (1 hour) lockout
    - 50 failed attempts: 86400 seconds (24 hours) lockout

    Each failed attempt also adds exponential backoff delay to response time.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        window_seconds: int = 3600,  # 1 hour window
        alert_threshold: int = 10,    # Alert on 10 failures
        lockout_tiers: Optional[Dict[int, int]] = None
    ):
        """
        Initialize authentication rate limiter.

        Args:
            redis_url: Redis connection URL (defaults to env REDIS_URL)
            window_seconds: Time window for counting attempts
            alert_threshold: Number of failures before alerting security team
            lockout_tiers: Dict mapping attempt count to lockout seconds
        """
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self._window_seconds = window_seconds
        self._alert_threshold = alert_threshold

        # Default lockout tiers (progressive)
        self._lockout_tiers = lockout_tiers or {
            5: 60,        # 5 attempts = 1 minute
            10: 900,      # 10 attempts = 15 minutes
            20: 3600,     # 20 attempts = 1 hour
            50: 86400     # 50 attempts = 24 hours
        }

        # Redis client for distributed rate limiting
        self._redis_client: Optional[redis.Redis] = None
        self._use_redis = True

        # In-memory fallback
        # Structure: {identifier: {"attempts": int, "first_attempt": timestamp, "locked_until": timestamp}}
        self._memory_store: Dict[str, Dict[str, Any]] = {}

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
            logger.info("Authentication rate limiter: Redis enabled")

        except (ConnectionError, TimeoutError, RedisError) as e:
            logger.warning(
                f"Authentication rate limiter: Failed to connect to Redis: {e}. "
                f"Falling back to in-memory rate limiting (NOT distributed)."
            )
            self._use_redis = False
            self._redis_client = None

    def _get_lockout_duration(self, attempts: int) -> int:
        """
        Get lockout duration based on attempt count (progressive).

        Args:
            attempts: Number of failed attempts

        Returns:
            Lockout duration in seconds
        """
        # Find the highest tier that applies
        lockout_duration = 0
        for threshold, duration in sorted(self._lockout_tiers.items()):
            if attempts >= threshold:
                lockout_duration = duration

        return lockout_duration

    def _apply_exponential_backoff(self, attempts: int) -> None:
        """
        Apply exponential backoff delay based on failed attempts.

        This slows down brute force attacks even before lockout.

        Args:
            attempts: Number of failed attempts
        """
        if attempts >= 5:
            # Exponential backoff: 2^(attempts - 5) seconds (capped at 30s)
            backoff_delay = min(2 ** (attempts - 5), 30)
            logger.info(f"Applying {backoff_delay}s exponential backoff for {attempts} failed attempts")
            time.sleep(backoff_delay)

    def _check_auth_attempt_redis(
        self,
        identifier: str,
        is_success: bool = False
    ) -> RateLimitResult:
        """
        Check authentication attempt using Redis (distributed).

        Args:
            identifier: IP address or user identifier
            is_success: Whether this is a successful auth (clears limit)

        Returns:
            RateLimitResult with allowed status and retry_after
        """
        if not self._use_redis or not self._redis_client:
            return self._check_auth_attempt_memory(identifier, is_success)

        try:
            attempts_key = f"kamiyo:auth:attempts:{identifier}"
            locked_key = f"kamiyo:auth:locked:{identifier}"

            # If this is a successful auth, clear all limits
            if is_success:
                self._redis_client.delete(attempts_key)
                self._redis_client.delete(locked_key)
                logger.info(f"Authentication successful, cleared rate limit for: {identifier}")
                return RateLimitResult(
                    allowed=True,
                    retry_after=0,
                    attempts=0,
                    message="Authentication successful"
                )

            # Check if currently locked out
            locked_until = self._redis_client.get(locked_key)
            if locked_until:
                try:
                    locked_timestamp = float(locked_until)
                    now = time.time()
                    if now < locked_timestamp:
                        retry_after = int(locked_timestamp - now)
                        logger.warning(
                            f"Rate limit exceeded for {identifier}: "
                            f"locked for {retry_after}s more"
                        )
                        return RateLimitResult(
                            allowed=False,
                            retry_after=retry_after,
                            attempts=int(self._redis_client.get(attempts_key) or 0),
                            message=f"Too many failed attempts. Locked for {retry_after} seconds."
                        )
                    else:
                        # Lock expired, clear it
                        self._redis_client.delete(locked_key)
                except ValueError:
                    pass

            # Get current attempt count
            attempts = int(self._redis_client.get(attempts_key) or 0)

            # Increment attempt count
            pipe = self._redis_client.pipeline()
            pipe.incr(attempts_key)
            pipe.expire(attempts_key, self._window_seconds)
            results = pipe.execute()
            new_attempts = results[0]

            # Check if we should lock out
            lockout_duration = self._get_lockout_duration(new_attempts)

            if lockout_duration > 0:
                # Lock out the identifier
                locked_until_timestamp = time.time() + lockout_duration
                self._redis_client.setex(
                    locked_key,
                    lockout_duration,
                    str(locked_until_timestamp)
                )

                logger.warning(
                    f"Rate limit triggered for {identifier}: "
                    f"{new_attempts} attempts, locked for {lockout_duration}s"
                )

                # Alert security team on high attempt count
                if new_attempts >= self._alert_threshold:
                    self._alert_security_team(identifier, new_attempts)

                # Apply exponential backoff before returning
                self._apply_exponential_backoff(new_attempts)

                return RateLimitResult(
                    allowed=False,
                    retry_after=lockout_duration,
                    attempts=new_attempts,
                    message=f"Too many failed attempts. Locked for {lockout_duration} seconds."
                )

            # Not locked yet, but apply exponential backoff to slow down attacks
            if new_attempts >= 3:
                self._apply_exponential_backoff(new_attempts)

            return RateLimitResult(
                allowed=True,
                retry_after=0,
                attempts=new_attempts,
                message="Authentication attempt allowed"
            )

        except RedisError as e:
            logger.error(f"Redis rate limit check failed: {e}. Falling back to memory.")
            self._use_redis = False
            return self._check_auth_attempt_memory(identifier, is_success)

    def _check_auth_attempt_memory(
        self,
        identifier: str,
        is_success: bool = False
    ) -> RateLimitResult:
        """
        Check authentication attempt using in-memory store (single instance only).

        Args:
            identifier: IP address or user identifier
            is_success: Whether this is a successful auth (clears limit)

        Returns:
            RateLimitResult with allowed status and retry_after
        """
        now = time.time()

        # If successful, clear limits
        if is_success:
            if identifier in self._memory_store:
                del self._memory_store[identifier]
            logger.info(f"Authentication successful (memory), cleared rate limit for: {identifier}")
            return RateLimitResult(
                allowed=True,
                retry_after=0,
                attempts=0,
                message="Authentication successful"
            )

        # Get or create record
        if identifier not in self._memory_store:
            self._memory_store[identifier] = {
                "attempts": 0,
                "first_attempt": now,
                "locked_until": 0
            }

        record = self._memory_store[identifier]

        # Check if locked
        if record["locked_until"] > now:
            retry_after = int(record["locked_until"] - now)
            logger.warning(
                f"Rate limit exceeded (memory) for {identifier}: "
                f"locked for {retry_after}s more"
            )
            return RateLimitResult(
                allowed=False,
                retry_after=retry_after,
                attempts=record["attempts"],
                message=f"Too many failed attempts. Locked for {retry_after} seconds."
            )

        # Clean old attempts outside window
        if record["first_attempt"] < now - self._window_seconds:
            record["attempts"] = 0
            record["first_attempt"] = now

        # Increment attempts
        record["attempts"] += 1
        new_attempts = record["attempts"]

        # Check for lockout
        lockout_duration = self._get_lockout_duration(new_attempts)

        if lockout_duration > 0:
            record["locked_until"] = now + lockout_duration

            logger.warning(
                f"Rate limit triggered (memory) for {identifier}: "
                f"{new_attempts} attempts, locked for {lockout_duration}s"
            )

            # Alert security team
            if new_attempts >= self._alert_threshold:
                self._alert_security_team(identifier, new_attempts)

            # Apply exponential backoff
            self._apply_exponential_backoff(new_attempts)

            return RateLimitResult(
                allowed=False,
                retry_after=lockout_duration,
                attempts=new_attempts,
                message=f"Too many failed attempts. Locked for {lockout_duration} seconds."
            )

        # Not locked yet, but apply backoff
        if new_attempts >= 3:
            self._apply_exponential_backoff(new_attempts)

        return RateLimitResult(
            allowed=True,
            retry_after=0,
            attempts=new_attempts,
            message="Authentication attempt allowed"
        )

    def check_auth_attempt(
        self,
        identifier: str,
        is_success: bool = False
    ) -> RateLimitResult:
        """
        Check if authentication attempt is allowed.

        This is the main public method for rate limiting.

        Args:
            identifier: IP address or user identifier
            is_success: Whether this is a successful auth (clears limit)

        Returns:
            RateLimitResult with allowed status
        """
        if self._use_redis:
            return self._check_auth_attempt_redis(identifier, is_success)
        else:
            return self._check_auth_attempt_memory(identifier, is_success)

    def _alert_security_team(self, identifier: str, attempts: int) -> None:
        """
        Alert security team about suspicious authentication activity.

        Args:
            identifier: IP address or user identifier
            attempts: Number of failed attempts
        """
        logger.critical(
            f"SECURITY ALERT: Suspicious authentication activity detected. "
            f"Identifier: {identifier}, Failed attempts: {attempts}. "
            f"Consider blocking this IP if pattern continues."
        )

        # TODO: Integrate with alerting system (email, Slack, PagerDuty, etc.)
        # Example:
        # - Send email to security@example.com
        # - Post to Slack #security-alerts
        # - Create PagerDuty incident if > 50 attempts

    def get_stats(self) -> Dict[str, Any]:
        """
        Get rate limiter statistics.

        Returns:
            Dictionary with statistics
        """
        stats = {
            "backend": "redis" if self._use_redis else "memory",
            "window_seconds": self._window_seconds,
            "alert_threshold": self._alert_threshold,
            "lockout_tiers": self._lockout_tiers,
        }

        if not self._use_redis:
            # Count locked identifiers in memory
            now = time.time()
            locked_count = sum(
                1 for record in self._memory_store.values()
                if record["locked_until"] > now
            )
            stats["memory_tracked_identifiers"] = len(self._memory_store)
            stats["memory_locked_identifiers"] = locked_count

        return stats

    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on rate limiter.

        Returns:
            Dictionary with health status
        """
        health = {
            "status": "healthy",
            "backend": "redis" if self._use_redis else "memory",
            "timestamp": datetime.utcnow().isoformat()
        }

        if not self._use_redis:
            health["status"] = "degraded"
            health["warning"] = "Using in-memory fallback - rate limiting NOT distributed"

        return health


# Singleton instance
_rate_limiter: Optional[AuthenticationRateLimiter] = None


def get_rate_limiter() -> AuthenticationRateLimiter:
    """
    Get singleton authentication rate limiter instance.

    Returns:
        AuthenticationRateLimiter instance
    """
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = AuthenticationRateLimiter()
    return _rate_limiter


def reset_rate_limiter() -> None:
    """
    Reset singleton instance (for testing or reload).
    """
    global _rate_limiter
    _rate_limiter = None
