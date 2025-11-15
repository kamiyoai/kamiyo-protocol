"""
API key authentication and rate limiting middleware.
"""

import time
import logging
from typing import Optional, Tuple
from datetime import datetime, timedelta
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from collections import defaultdict

from .subscriptions import SubscriptionTier, get_tier_limits

logger = logging.getLogger(__name__)

# API Key Header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# ========== In-Memory Rate Limiting ==========
# In production, use Redis or similar distributed cache

class RateLimiter:
    """Simple in-memory rate limiter with sliding window."""

    def __init__(self):
        # Store: {api_key: [(timestamp, count), ...]}
        self.requests = defaultdict(list)
        self.cleanup_interval = 3600  # Clean up every hour
        self.last_cleanup = time.time()

    def _cleanup_old_requests(self):
        """Remove requests older than 1 hour."""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return

        cutoff = now - 3600
        for api_key in list(self.requests.keys()):
            self.requests[api_key] = [
                (ts, count) for ts, count in self.requests[api_key]
                if ts > cutoff
            ]
            if not self.requests[api_key]:
                del self.requests[api_key]

        self.last_cleanup = now

    def check_rate_limit(self, api_key: str, limit: int) -> Tuple[bool, int, int]:
        """
        Check if request is within rate limit.

        Args:
            api_key: API key to check
            limit: Maximum requests per hour

        Returns:
            Tuple of (allowed, requests_used, retry_after_seconds)
        """
        self._cleanup_old_requests()

        now = time.time()
        cutoff = now - 3600  # 1 hour ago

        # Get requests in the last hour
        recent_requests = [
            (ts, count) for ts, count in self.requests[api_key]
            if ts > cutoff
        ]

        # Calculate total requests
        total_requests = sum(count for _, count in recent_requests)

        if total_requests >= limit:
            # Find oldest request timestamp to calculate retry_after
            oldest_ts = min(ts for ts, _ in recent_requests) if recent_requests else now
            retry_after = int(oldest_ts + 3600 - now)
            return False, total_requests, max(retry_after, 1)

        # Add current request
        self.requests[api_key].append((now, 1))
        return True, total_requests + 1, 0

    def get_usage(self, api_key: str) -> int:
        """Get current usage count for the hour."""
        now = time.time()
        cutoff = now - 3600

        recent_requests = [
            (ts, count) for ts, count in self.requests[api_key]
            if ts > cutoff
        ]

        return sum(count for _, count in recent_requests)


# Global rate limiter instance
rate_limiter = RateLimiter()


# ========== API Key Storage ==========
# In production, use a proper database with encrypted keys

class APIKeyStore:
    """Simple in-memory API key storage."""

    def __init__(self):
        # Store: {api_key: {"tier": SubscriptionTier, "created_at": datetime}}
        self.keys = {}
        self._initialize_demo_keys()

    def _initialize_demo_keys(self):
        """Initialize demo API keys for testing."""
        self.keys = {
            "varden_demo_free_key": {
                "tier": SubscriptionTier.FREE,
                "created_at": datetime.utcnow(),
                "user_id": "demo_free"
            },
            "varden_demo_basic_key": {
                "tier": SubscriptionTier.BASIC,
                "created_at": datetime.utcnow(),
                "user_id": "demo_basic"
            },
            "varden_demo_pro_key": {
                "tier": SubscriptionTier.PRO,
                "created_at": datetime.utcnow(),
                "user_id": "demo_pro"
            },
            # Add more demo keys for testing
            "varden_test_pro_12345": {
                "tier": SubscriptionTier.PRO,
                "created_at": datetime.utcnow(),
                "user_id": "test_user_1"
            }
        }
        logger.info(f"Initialized {len(self.keys)} demo API keys")

    def validate_key(self, api_key: str) -> Optional[dict]:
        """
        Validate an API key and return key info.

        Returns:
            Dict with tier and metadata, or None if invalid
        """
        return self.keys.get(api_key)

    def create_key(self, tier: SubscriptionTier, user_id: str) -> str:
        """Create a new API key (placeholder for Stripe integration)."""
        import uuid
        api_key = f"varden_live_{uuid.uuid4().hex[:24]}"

        self.keys[api_key] = {
            "tier": tier,
            "created_at": datetime.utcnow(),
            "user_id": user_id
        }

        return api_key

    def revoke_key(self, api_key: str) -> bool:
        """Revoke an API key."""
        if api_key in self.keys:
            del self.keys[api_key]
            return True
        return False


# Global API key store instance
api_key_store = APIKeyStore()


# ========== Authentication Dependency ==========

async def get_api_key(api_key: Optional[str] = Security(api_key_header)) -> Tuple[str, dict]:
    """
    Dependency to validate API key and return key info.

    Returns:
        Tuple of (api_key, key_info)

    Raises:
        HTTPException: If API key is invalid or missing
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is required. Include 'X-API-Key' header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    key_info = api_key_store.validate_key(api_key)
    if not key_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    return api_key, key_info


# ========== Rate Limiting Dependency ==========

async def check_rate_limit(api_key_info: Tuple[str, dict]) -> Tuple[str, dict]:
    """
    Dependency to check rate limits.

    Args:
        api_key_info: Tuple from get_api_key dependency

    Returns:
        Same api_key_info tuple

    Raises:
        HTTPException: If rate limit is exceeded
    """
    api_key, key_info = api_key_info
    tier = key_info["tier"]
    limits = get_tier_limits(tier)

    # Check rate limit
    allowed, requests_used, retry_after = rate_limiter.check_rate_limit(
        api_key, limits["rate_limit_per_hour"]
    )

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate Limit Exceeded",
                "detail": f"You have exceeded your rate limit of {limits['rate_limit_per_hour']} requests per hour",
                "retry_after_seconds": retry_after,
                "current_tier": tier.value,
                "requests_remaining": 0
            },
            headers={"Retry-After": str(retry_after)}
        )

    # Log request
    logger.debug(f"API request from {api_key[:20]}... (tier: {tier.value}, usage: {requests_used}/{limits['rate_limit_per_hour']})")

    return api_key, key_info


# ========== Optional Authentication ==========

async def get_optional_api_key(api_key: Optional[str] = Security(api_key_header)) -> Optional[Tuple[str, dict]]:
    """
    Dependency for optional authentication (public endpoints with optional key).

    Returns:
        Tuple of (api_key, key_info) or None if no key provided
    """
    if not api_key:
        return None

    key_info = api_key_store.validate_key(api_key)
    if not key_info:
        # Don't fail, just treat as unauthenticated
        return None

    return api_key, key_info


# ========== Helper Functions ==========

def get_tier_from_auth(auth_info: Optional[Tuple[str, dict]]) -> SubscriptionTier:
    """Get subscription tier from auth info, defaulting to FREE."""
    if not auth_info:
        return SubscriptionTier.FREE

    _, key_info = auth_info
    return key_info["tier"]


def get_data_delay(tier: SubscriptionTier) -> int:
    """Get data delay in hours for a subscription tier."""
    limits = get_tier_limits(tier)
    return limits["data_delay_hours"]


def get_webhook_limit(tier: SubscriptionTier) -> int:
    """Get webhook limit for a subscription tier."""
    limits = get_tier_limits(tier)
    return limits["webhook_limit"]


def get_requests_remaining(api_key: str, tier: SubscriptionTier) -> int:
    """Get remaining requests in current hour."""
    limits = get_tier_limits(tier)
    used = rate_limiter.get_usage(api_key)
    return max(0, limits["rate_limit_per_hour"] - used)


# ========== Admin Functions (for testing) ==========

def reset_rate_limit(api_key: str):
    """Reset rate limit for an API key (testing only)."""
    if api_key in rate_limiter.requests:
        del rate_limiter.requests[api_key]


def get_all_api_keys() -> dict:
    """Get all API keys (admin/testing only)."""
    return api_key_store.keys
