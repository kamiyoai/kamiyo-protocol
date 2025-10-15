# -*- coding: utf-8 -*-
"""
Usage Tracker for Kamiyo
Redis-based sliding window rate limiting and usage tracking
"""

import os
import time
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta
import redis
from .tiers import TierName, get_tier

logger = logging.getLogger(__name__)


class UsageTracker:
    """
    Redis-based usage tracking with sliding window algorithm

    Tracks API usage across multiple time windows:
    - Per minute
    - Per hour
    - Per day

    Uses Redis for high-performance distributed rate limiting
    """

    def __init__(self, redis_url: str = None):
        """
        Initialize usage tracker

        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')

        try:
            # Parse Redis URL to handle password
            if '@' in self.redis_url:
                # Format: redis://:password@host:port/db
                self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            else:
                # Format: redis://host:port/db (no password)
                self.redis_client = redis.from_url(self.redis_url, decode_responses=True)

            self.redis_client.ping()
            logger.info("Usage tracker connected to Redis")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            logger.warning("Usage tracking will be disabled")
            self.redis_client = None

    def track_api_call(self, user_id: str, endpoint: str = None) -> None:
        """
        Track an API call for a user

        Args:
            user_id: User identifier
            endpoint: API endpoint (optional, for detailed tracking)
        """
        if not self.redis_client:
            logger.warning("Redis unavailable, skipping usage tracking")
            return

        try:
            current_time = int(time.time())

            # Increment counters for different time windows
            # Per-minute counter
            minute_key = f"usage:{user_id}:minute:{current_time // 60}"
            self.redis_client.incr(minute_key)
            self.redis_client.expire(minute_key, 120)  # Keep for 2 minutes

            # Per-hour counter
            hour_key = f"usage:{user_id}:hour:{current_time // 3600}"
            self.redis_client.incr(hour_key)
            self.redis_client.expire(hour_key, 7200)  # Keep for 2 hours

            # Per-day counter
            day_key = f"usage:{user_id}:day:{current_time // 86400}"
            self.redis_client.incr(day_key)
            self.redis_client.expire(day_key, 172800)  # Keep for 2 days

            # Track endpoint-specific usage if provided
            if endpoint:
                endpoint_key = f"usage:{user_id}:endpoint:{endpoint}:{current_time // 86400}"
                self.redis_client.incr(endpoint_key)
                self.redis_client.expire(endpoint_key, 172800)

            # Update last activity timestamp
            self.redis_client.set(f"usage:{user_id}:last_activity", current_time, ex=86400)

        except Exception as e:
            logger.error(f"Failed to track API call: {e}")

    def get_usage_count(self, user_id: str, time_window: str = "day") -> int:
        """
        Get usage count for a specific time window

        Args:
            user_id: User identifier
            time_window: Time window ("minute", "hour", "day")

        Returns:
            Number of API calls in the time window
        """
        if not self.redis_client:
            return 0

        try:
            current_time = int(time.time())

            if time_window == "minute":
                key = f"usage:{user_id}:minute:{current_time // 60}"
            elif time_window == "hour":
                key = f"usage:{user_id}:hour:{current_time // 3600}"
            elif time_window == "day":
                key = f"usage:{user_id}:day:{current_time // 86400}"
            else:
                raise ValueError(f"Invalid time window: {time_window}")

            count = self.redis_client.get(key)
            return int(count) if count else 0

        except Exception as e:
            logger.error(f"Failed to get usage count: {e}")
            return 0

    def check_rate_limit(self, user_id: str, tier: TierName) -> Dict[str, any]:
        """
        Check if user is within rate limits for their tier

        Args:
            user_id: User identifier
            tier: User's subscription tier

        Returns:
            Dict with:
                - allowed: Boolean indicating if request is allowed
                - remaining_minute: Requests remaining this minute
                - remaining_hour: Requests remaining this hour
                - remaining_day: Requests remaining today
                - reset_minute: Timestamp when minute limit resets
                - reset_hour: Timestamp when hour limit resets
                - reset_day: Timestamp when day limit resets
        """
        if not self.redis_client:
            # If Redis is down, allow request but log warning
            logger.warning("Redis unavailable, allowing request without rate limiting")
            return {
                'allowed': True,
                'remaining_minute': 9999,
                'remaining_hour': 9999,
                'remaining_day': 9999
            }

        try:
            tier_config = get_tier(tier)

            # Get current usage for all time windows
            usage_minute = self.get_usage_count(user_id, "minute")
            usage_hour = self.get_usage_count(user_id, "hour")
            usage_day = self.get_usage_count(user_id, "day")

            # Calculate remaining requests
            remaining_minute = max(0, tier_config.api_requests_per_minute - usage_minute)
            remaining_hour = max(0, tier_config.api_requests_per_hour - usage_hour)
            remaining_day = max(0, tier_config.api_requests_per_day - usage_day)

            # Calculate reset times
            current_time = int(time.time())
            reset_minute = (current_time // 60 + 1) * 60
            reset_hour = (current_time // 3600 + 1) * 3600
            reset_day = (current_time // 86400 + 1) * 86400

            # Request is allowed if all limits have remaining capacity
            allowed = (
                usage_minute < tier_config.api_requests_per_minute and
                usage_hour < tier_config.api_requests_per_hour and
                usage_day < tier_config.api_requests_per_day
            )

            return {
                'allowed': allowed,
                'remaining_minute': remaining_minute,
                'remaining_hour': remaining_hour,
                'remaining_day': remaining_day,
                'limit_minute': tier_config.api_requests_per_minute,
                'limit_hour': tier_config.api_requests_per_hour,
                'limit_day': tier_config.api_requests_per_day,
                'reset_minute': reset_minute,
                'reset_hour': reset_hour,
                'reset_day': reset_day,
                'usage_minute': usage_minute,
                'usage_hour': usage_hour,
                'usage_day': usage_day
            }

        except Exception as e:
            logger.error(f"Failed to check rate limit: {e}")
            # Allow request on error to prevent service disruption
            return {'allowed': True, 'remaining_day': 9999}

    def reset_usage(self, user_id: str, time_window: str = None) -> None:
        """
        Reset usage counters for a user

        Args:
            user_id: User identifier
            time_window: Specific window to reset (or None for all)
        """
        if not self.redis_client:
            return

        try:
            current_time = int(time.time())

            if time_window is None or time_window == "minute":
                minute_key = f"usage:{user_id}:minute:{current_time // 60}"
                self.redis_client.delete(minute_key)

            if time_window is None or time_window == "hour":
                hour_key = f"usage:{user_id}:hour:{current_time // 3600}"
                self.redis_client.delete(hour_key)

            if time_window is None or time_window == "day":
                day_key = f"usage:{user_id}:day:{current_time // 86400}"
                self.redis_client.delete(day_key)

            logger.info(f"Reset usage for user {user_id} (window: {time_window or 'all'})")

        except Exception as e:
            logger.error(f"Failed to reset usage: {e}")

    def get_usage_stats(self, user_id: str) -> Dict[str, any]:
        """
        Get comprehensive usage statistics for a user

        Args:
            user_id: User identifier

        Returns:
            Dict with usage statistics across all time windows
        """
        if not self.redis_client:
            return {}

        try:
            # Get usage for all time windows
            usage_minute = self.get_usage_count(user_id, "minute")
            usage_hour = self.get_usage_count(user_id, "hour")
            usage_day = self.get_usage_count(user_id, "day")

            # Get last activity
            last_activity = self.redis_client.get(f"usage:{user_id}:last_activity")
            last_activity_dt = None
            if last_activity:
                last_activity_dt = datetime.fromtimestamp(int(last_activity))

            # Get endpoint breakdown for today
            current_day = int(time.time()) // 86400
            endpoint_pattern = f"usage:{user_id}:endpoint:*:{current_day}"
            endpoint_keys = self.redis_client.keys(endpoint_pattern)

            endpoint_usage = {}
            for key in endpoint_keys:
                # Extract endpoint from key
                parts = key.split(':')
                if len(parts) >= 4:
                    endpoint = parts[3]
                    count = self.redis_client.get(key)
                    endpoint_usage[endpoint] = int(count) if count else 0

            return {
                'usage_current_minute': usage_minute,
                'usage_current_hour': usage_hour,
                'usage_current_day': usage_day,
                'last_activity': last_activity_dt.isoformat() if last_activity_dt else None,
                'endpoint_breakdown': endpoint_usage
            }

        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            return {}

    def cleanup_old_keys(self, user_id: str) -> int:
        """
        Cleanup expired keys for a user (maintenance function)

        Args:
            user_id: User identifier

        Returns:
            Number of keys deleted
        """
        if not self.redis_client:
            return 0

        try:
            # Find all keys for user
            pattern = f"usage:{user_id}:*"
            keys = self.redis_client.keys(pattern)

            deleted = 0
            for key in keys:
                # Check if key has TTL
                ttl = self.redis_client.ttl(key)
                if ttl == -1:  # No expiry set
                    # Set expiry based on key type
                    if ':minute:' in key:
                        self.redis_client.expire(key, 120)
                    elif ':hour:' in key:
                        self.redis_client.expire(key, 7200)
                    else:
                        self.redis_client.expire(key, 172800)
                elif ttl == -2:  # Key doesn't exist
                    deleted += 1

            logger.info(f"Cleaned up {deleted} expired keys for user {user_id}")
            return deleted

        except Exception as e:
            logger.error(f"Failed to cleanup keys: {e}")
            return 0


# Singleton instance
_tracker_instance = None


def get_usage_tracker() -> UsageTracker:
    """Get usage tracker singleton"""
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = UsageTracker()
    return _tracker_instance


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Usage Tracker Test ===\n")

    tracker = UsageTracker()

    test_user = "test_user_123"

    print("1. Testing API call tracking...")
    for i in range(5):
        tracker.track_api_call(test_user, endpoint="/exploits")
    print(f"   Tracked 5 API calls")

    print("\n2. Testing usage counts...")
    usage_day = tracker.get_usage_count(test_user, "day")
    usage_hour = tracker.get_usage_count(test_user, "hour")
    usage_minute = tracker.get_usage_count(test_user, "minute")
    print(f"   Day: {usage_day}, Hour: {usage_hour}, Minute: {usage_minute}")

    print("\n3. Testing rate limit check (FREE tier)...")
    result = tracker.check_rate_limit(test_user, TierName.FREE)
    print(f"   Allowed: {result['allowed']}")
    print(f"   Remaining today: {result.get('remaining_day', 'N/A')}")
    print(f"   Daily limit: {result.get('limit_day', 'N/A')}")

    print("\n4. Testing usage stats...")
    stats = tracker.get_usage_stats(test_user)
    print(f"   Current day usage: {stats.get('usage_current_day', 0)}")
    print(f"   Last activity: {stats.get('last_activity', 'Never')}")
    if stats.get('endpoint_breakdown'):
        print(f"   Endpoint breakdown: {stats['endpoint_breakdown']}")

    print("\n5. Testing rate limit across tiers...")
    for tier in [TierName.FREE, TierName.BASIC, TierName.PRO, TierName.ENTERPRISE]:
        result = tracker.check_rate_limit(test_user, tier)
        print(f"   {tier.value.upper()}: Remaining={result.get('remaining_day', 0)}, Limit={result.get('limit_day', 0)}")

    print("\n✅ Usage tracker ready")
