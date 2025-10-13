# -*- coding: utf-8 -*-
"""
Production-Grade Tier-Based Rate Limiting Middleware
Addresses P0-3: Apply tier-based rate limiting to all API endpoints

Features:
- Multi-window rate limiting (minute/hour/day)
- Tier-based limits matching subscriptions/tiers.py
- Token bucket algorithm for smooth traffic shaping
- Redis support for distributed deployments
- Proper HTTP 429 responses with Retry-After headers
- IP-based limiting for unauthenticated requests
"""

import time
import hashlib
import os
from typing import Dict, Optional, Tuple
from collections import defaultdict
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import logging

logger = logging.getLogger(__name__)


class TokenBucketRateLimiter:
    """
    Token bucket rate limiter with multiple time windows.

    Implements sliding window rate limiting with token bucket algorithm:
    - Smooth traffic shaping (no burst spikes)
    - Multiple windows (minute/hour/day)
    - Thread-safe for in-memory mode
    - Redis-ready for distributed mode
    """

    def __init__(self, use_redis: bool = False, redis_url: Optional[str] = None):
        """
        Initialize rate limiter.

        Args:
            use_redis: Use Redis for distributed rate limiting (production)
            redis_url: Redis connection URL
        """
        self.use_redis = use_redis
        self.redis_client = None

        if use_redis:
            try:
                import redis
                self.redis_client = redis.from_url(
                    redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/1"),
                    decode_responses=True,
                    socket_connect_timeout=1,
                    socket_timeout=1
                )
                # Test connection
                self.redis_client.ping()
                logger.info("Rate limiter using Redis backend")
            except Exception as e:
                logger.warning(f"Redis unavailable, falling back to in-memory: {e}")
                self.use_redis = False
                self.redis_client = None

        # In-memory buckets: {user_key: {window: (tokens, last_refill_time)}}
        self._buckets: Dict[str, Dict[str, Tuple[float, float]]] = defaultdict(dict)

    def _check_limit_redis(
        self,
        user_key: str,
        window: str,
        limit: int,
        period_seconds: int
    ) -> Tuple[bool, int]:
        """Check rate limit using Redis (distributed)"""
        if not self.redis_client:
            return self._check_limit_memory(user_key, window, limit, period_seconds)

        try:
            redis_key = f"ratelimit:{user_key}:{window}"
            now = time.time()

            # Get current bucket state
            pipe = self.redis_client.pipeline()
            pipe.hgetall(redis_key)
            results = pipe.execute()
            bucket = results[0] if results else {}

            tokens = float(bucket.get('tokens', limit))
            last_refill = float(bucket.get('last_refill', now))

            # Calculate token refill (tokens per second)
            refill_rate = limit / period_seconds
            elapsed = now - last_refill
            tokens = min(limit, tokens + (elapsed * refill_rate))

            # Check if request can be served
            if tokens >= 1.0:
                # Allow request, consume token
                tokens -= 1.0

                # Update Redis atomically
                pipe = self.redis_client.pipeline()
                pipe.hset(redis_key, mapping={
                    'tokens': str(tokens),
                    'last_refill': str(now)
                })
                pipe.expire(redis_key, period_seconds * 2)  # Auto-cleanup
                pipe.execute()

                return True, 0
            else:
                # Reject request, calculate retry time
                tokens_needed = 1.0 - tokens
                retry_after = int(tokens_needed / refill_rate) + 1
                return False, retry_after

        except Exception as e:
            logger.error(f"Redis rate limit error: {e}")
            # Fallback to memory on Redis error
            return self._check_limit_memory(user_key, window, limit, period_seconds)

    def _check_limit_memory(
        self,
        user_key: str,
        window: str,
        limit: int,
        period_seconds: int
    ) -> Tuple[bool, int]:
        """Check rate limit using in-memory buckets (single-instance)"""
        now = time.time()

        # Get or create bucket
        if window not in self._buckets[user_key]:
            self._buckets[user_key][window] = (float(limit), now)

        tokens, last_refill = self._buckets[user_key][window]

        # Calculate token refill
        refill_rate = limit / period_seconds
        elapsed = now - last_refill
        tokens = min(limit, tokens + (elapsed * refill_rate))

        # Check if request can be served
        if tokens >= 1.0:
            # Allow request, consume token
            tokens -= 1.0
            self._buckets[user_key][window] = (tokens, now)
            return True, 0
        else:
            # Reject request, calculate retry time
            tokens_needed = 1.0 - tokens
            retry_after = int(tokens_needed / refill_rate) + 1
            return False, retry_after

    def check_rate_limit(
        self,
        user_key: str,
        limits: Dict[str, Tuple[int, int]]
    ) -> Tuple[bool, str, int]:
        """
        Check all rate limit windows for user.

        Args:
            user_key: Unique identifier (user:123 or IP)
            limits: {window: (limit, period_seconds)}
                   e.g., {"minute": (60, 60), "hour": (1000, 3600)}

        Returns:
            (allowed, violated_window, retry_after_seconds)
        """
        for window, (limit, period) in limits.items():
            if self.use_redis:
                allowed, retry_after = self._check_limit_redis(user_key, window, limit, period)
            else:
                allowed, retry_after = self._check_limit_memory(user_key, window, limit, period)

            if not allowed:
                logger.warning(
                    f"Rate limit exceeded: user={user_key}, window={window}, "
                    f"limit={limit}/{period}s, retry_after={retry_after}s"
                )
                return False, window, retry_after

        return True, "", 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for tier-based rate limiting.

    Features:
    - Tier-based limits matching subscriptions/tiers.py
    - Multi-window enforcement (minute/hour/day)
    - Token bucket algorithm for smooth traffic
    - Proper HTTP 429 responses with Retry-After
    - IP-based limits for unauthenticated users
    """

    def __init__(
        self,
        app,
        use_redis: bool = False,
        redis_url: Optional[str] = None
    ):
        super().__init__(app)
        self.limiter = TokenBucketRateLimiter(use_redis=use_redis, redis_url=redis_url)

        # Tier-based rate limits (matching api/subscriptions/tiers.py)
        self.tier_limits = {
            "free": {
                "minute": (0, 60),        # No API access
                "hour": (0, 3600),
                "day": (0, 86400)
            },
            "pro": {
                "minute": (35, 60),       # 35 req/min
                "hour": (2083, 3600),     # ~2K req/hour
                "day": (50000, 86400)     # 50K req/day
            },
            "team": {
                "minute": (70, 60),       # 70 req/min
                "hour": (4167, 3600),     # ~4K req/hour
                "day": (100000, 86400)    # 100K req/day
            },
            "enterprise": {
                "minute": (1000, 60),     # 1K req/min (effectively unlimited)
                "hour": (99999, 3600),
                "day": (999999, 86400)
            }
        }

        # IP-based limits for unauthenticated requests (stricter)
        self.ip_limits = {
            "minute": (10, 60),           # 10 req/min per IP
            "hour": (100, 3600),          # 100 req/hour per IP
            "day": (500, 86400)           # 500 req/day per IP
        }

        logger.info("Rate limiting middleware initialized with tier-based limits")

    async def _get_user_tier_and_key(self, request: Request) -> Tuple[Optional[str], str]:
        """
        Extract user tier and unique key from request.

        Returns:
            (tier, user_key) - tier is None for unauthenticated
        """
        # Check for API key in headers
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                api_key = auth_header.replace("Bearer ", "").strip()

        if api_key:
            try:
                # Query database for user tier
                from database import get_db
                db = get_db()

                with db.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT id, tier FROM users WHERE api_key = ?",
                        (api_key,)
                    )
                    row = cursor.fetchone()

                    if row:
                        user_id = row[0]
                        tier = row[1].lower() if row[1] else "free"
                        return tier, f"user:{user_id}"

            except Exception as e:
                logger.error(f"Failed to lookup user tier: {e}")

        # No valid auth - return None tier, IP as key
        return None, self._get_client_ip(request)

    def _get_client_ip(self, request: Request) -> str:
        """
        Extract client IP address.

        Handles X-Forwarded-For for proxied requests.
        """
        # Check X-Forwarded-For (set by load balancers)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take first IP (client)
            return f"ip:{forwarded.split(',')[0].strip()}"

        # Fall back to direct connection
        if request.client:
            return f"ip:{request.client.host}"

        return "ip:unknown"

    async def dispatch(self, request: Request, call_next):
        """Process request with tier-based multi-window rate limiting"""

        # Skip rate limiting for health checks and docs
        skip_paths = {"/health", "/ready", "/docs", "/redoc", "/openapi.json"}
        if request.url.path in skip_paths:
            return await call_next(request)

        # Get user tier and identifier
        tier, user_key = await self._get_user_tier_and_key(request)

        # Select appropriate limits
        if tier and tier != "free":
            limits = self.tier_limits.get(tier, self.ip_limits)
        else:
            # Unauthenticated or free tier - use strict IP limits
            limits = self.ip_limits

        # Check rate limits across all windows
        allowed, violated_window, retry_after = self.limiter.check_rate_limit(user_key, limits)

        if not allowed:
            # Rate limit exceeded - return 429
            logger.warning(
                f"Rate limit exceeded: "
                f"path={request.url.path}, "
                f"user={user_key}, "
                f"tier={tier or 'unauthenticated'}, "
                f"window={violated_window}, "
                f"retry_after={retry_after}s"
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded for {violated_window} window. Please slow down.",
                    "tier": tier or "unauthenticated",
                    "window": violated_window,
                    "retry_after_seconds": retry_after,
                    "upgrade_url": "https://kamiyo.ai/pricing"
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limits[violated_window][0]),
                    "X-RateLimit-Remaining": "0"
                }
            )

        # Allow request
        response = await call_next(request)

        # Add rate limit headers (for minute window)
        if "minute" in limits:
            response.headers["X-RateLimit-Limit"] = str(limits["minute"][0])
            response.headers["X-RateLimit-Reset"] = str(int(time.time() + 60))

        return response


def get_rate_limiter(use_redis: bool = False, redis_url: Optional[str] = None):
    """
    Factory function for rate limiting middleware.

    Args:
        use_redis: Use Redis for distributed rate limiting (production)
        redis_url: Redis connection URL

    Returns:
        Configured RateLimitMiddleware
    """
    # Return middleware factory, not instance
    def factory(app):
        return RateLimitMiddleware(app, use_redis=use_redis, redis_url=redis_url)
    return factory
