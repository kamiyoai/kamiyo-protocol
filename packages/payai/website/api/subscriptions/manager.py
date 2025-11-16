# -*- coding: utf-8 -*-
"""
Subscription Manager for Kamiyo
Manages subscription lifecycle, tier changes, and feature access
"""

import os
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import redis

from .tiers import TierName, get_tier, is_upgrade, is_downgrade
from .usage_tracker import UsageTracker, get_usage_tracker
from database.postgres_manager import PostgresManager, get_db

logger = logging.getLogger(__name__)


class Subscription(BaseModel):
    """Subscription model"""
    id: int
    user_id: str
    tier: TierName
    status: str  # active, cancelled, expired, past_due
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    created_at: datetime
    updated_at: datetime


class UsageStats(BaseModel):
    """Usage statistics model"""
    user_id: str
    tier: TierName
    usage_current_minute: int
    usage_current_hour: int
    usage_current_day: int
    limit_minute: int
    limit_hour: int
    limit_day: int
    remaining_minute: int
    remaining_hour: int
    remaining_day: int
    last_activity: Optional[str] = None
    endpoint_breakdown: Dict[str, int] = {}


class SubscriptionManager:
    """
    Manages subscriptions and feature access

    Features:
    - Get user's current tier
    - Check feature access
    - Upgrade/downgrade subscriptions
    - Cancel subscriptions
    - Track usage statistics
    - Cache tier info in Redis
    """

    def __init__(self, db: PostgresManager = None, redis_url: str = None):
        """
        Initialize subscription manager

        Args:
            db: Database manager instance
            redis_url: Redis connection URL
        """
        self.db = db or get_db()
        self.usage_tracker = get_usage_tracker()

        # Initialize Redis for caching
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("Subscription manager connected to Redis")
        except Exception as e:
            logger.warning(f"Redis connection failed, caching disabled: {e}")
            self.redis_client = None

        # Cache TTL (5 minutes)
        self.cache_ttl = 300

    async def get_user_tier(self, user_id: str) -> TierName:
        """
        Get user's current subscription tier

        Args:
            user_id: User identifier

        Returns:
            TierName enum
        """
        # Check cache first
        if self.redis_client:
            try:
                cached_tier = self.redis_client.get(f"tier:{user_id}")
                if cached_tier:
                    logger.debug(f"Cache hit for user {user_id} tier")
                    return TierName(cached_tier)
            except Exception as e:
                logger.warning(f"Cache read failed: {e}")

        # Query database
        try:
            query = """
                SELECT tier FROM user_subscriptions
                WHERE user_id = %s AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """
            result = self.db.execute_with_retry(query, (user_id,), readonly=True)

            if result and len(result) > 0:
                tier = TierName(result[0]['tier'])
            else:
                # Default to free tier if no subscription found
                tier = TierName.FREE

            # Cache the result
            if self.redis_client:
                try:
                    self.redis_client.setex(f"tier:{user_id}", self.cache_ttl, tier.value)
                except Exception as e:
                    logger.warning(f"Cache write failed: {e}")

            return tier

        except Exception as e:
            logger.error(f"Failed to get user tier: {e}")
            # Default to free tier on error
            return TierName.FREE

    async def check_feature_access(self, user_id: str, feature: str) -> bool:
        """
        Check if user has access to a specific feature

        Args:
            user_id: User identifier
            feature: Feature name (e.g., "discord_alerts", "webhook_alerts")

        Returns:
            True if user has access, False otherwise
        """
        try:
            tier_name = await self.get_user_tier(user_id)
            tier_config = get_tier(tier_name)

            # Map feature names to tier attributes
            feature_map = {
                'email_alerts': tier_config.email_alerts,
                'discord_alerts': tier_config.discord_alerts,
                'telegram_alerts': tier_config.telegram_alerts,
                'webhook_alerts': tier_config.webhook_alerts,
                'real_time_alerts': tier_config.real_time_alerts,
                'custom_integrations': tier_config.custom_integrations,
                'csv_export': tier_config.csv_export,
                'json_export': tier_config.json_export,
                'api_access': tier_config.api_access,
                'white_label': tier_config.white_label
            }

            return feature_map.get(feature, False)

        except Exception as e:
            logger.error(f"Failed to check feature access: {e}")
            return False

    async def upgrade_subscription(self, user_id: str, new_tier: TierName) -> Subscription:
        """
        Upgrade user's subscription to a higher tier

        Args:
            user_id: User identifier
            new_tier: New subscription tier

        Returns:
            Updated Subscription object

        Raises:
            ValueError: If tier change is not an upgrade
        """
        current_tier = await self.get_user_tier(user_id)

        if not is_upgrade(current_tier, new_tier):
            raise ValueError(f"Cannot upgrade from {current_tier.value} to {new_tier.value}")

        # Update subscription in database
        try:
            query = """
                UPDATE user_subscriptions
                SET tier = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND status = 'active'
                RETURNING *
            """
            result = self.db.execute_with_retry(query, (new_tier.value, user_id), readonly=False)

            if not result:
                raise ValueError("No active subscription found")

            # Invalidate cache
            if self.redis_client:
                try:
                    self.redis_client.delete(f"tier:{user_id}")
                except Exception as e:
                    logger.warning(f"Cache invalidation failed: {e}")

            # Reset usage counters on upgrade
            self.usage_tracker.reset_usage(user_id)

            logger.info(f"Upgraded user {user_id} from {current_tier.value} to {new_tier.value}")

            return Subscription(**result[0])

        except Exception as e:
            logger.error(f"Failed to upgrade subscription: {e}")
            raise

    async def downgrade_subscription(self, user_id: str, new_tier: TierName) -> Subscription:
        """
        Downgrade user's subscription to a lower tier

        Args:
            user_id: User identifier
            new_tier: New subscription tier

        Returns:
            Updated Subscription object

        Raises:
            ValueError: If tier change is not a downgrade
        """
        current_tier = await self.get_user_tier(user_id)

        if not is_downgrade(current_tier, new_tier):
            raise ValueError(f"Cannot downgrade from {current_tier.value} to {new_tier.value}")

        # Update subscription in database
        try:
            # Set to downgrade at end of billing period
            query = """
                UPDATE user_subscriptions
                SET cancel_at_period_end = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND status = 'active'
                RETURNING *
            """
            result = self.db.execute_with_retry(query, (user_id,), readonly=False)

            if not result:
                raise ValueError("No active subscription found")

            # Invalidate cache
            if self.redis_client:
                try:
                    self.redis_client.delete(f"tier:{user_id}")
                except Exception as e:
                    logger.warning(f"Cache invalidation failed: {e}")

            logger.info(f"Scheduled downgrade for user {user_id} from {current_tier.value} to {new_tier.value}")

            return Subscription(**result[0])

        except Exception as e:
            logger.error(f"Failed to downgrade subscription: {e}")
            raise

    async def cancel_subscription(self, user_id: str) -> bool:
        """
        Cancel user's subscription

        Args:
            user_id: User identifier

        Returns:
            True if cancelled successfully

        Raises:
            ValueError: If no active subscription found
        """
        try:
            # Set subscription to cancel at period end
            query = """
                UPDATE user_subscriptions
                SET cancel_at_period_end = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND status = 'active'
                RETURNING id
            """
            result = self.db.execute_with_retry(query, (user_id,), readonly=False)

            if not result:
                raise ValueError("No active subscription found")

            # Invalidate cache
            if self.redis_client:
                try:
                    self.redis_client.delete(f"tier:{user_id}")
                except Exception as e:
                    logger.warning(f"Cache invalidation failed: {e}")

            logger.info(f"Cancelled subscription for user {user_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to cancel subscription: {e}")
            raise

    async def get_usage_stats(self, user_id: str) -> UsageStats:
        """
        Get comprehensive usage statistics for a user

        Args:
            user_id: User identifier

        Returns:
            UsageStats object with current usage and limits
        """
        try:
            tier_name = await self.get_user_tier(user_id)
            tier_config = get_tier(tier_name)

            # Get usage from tracker
            rate_limit_info = self.usage_tracker.check_rate_limit(user_id, tier_name)
            usage_info = self.usage_tracker.get_usage_stats(user_id)

            return UsageStats(
                user_id=user_id,
                tier=tier_name,
                usage_current_minute=rate_limit_info.get('usage_minute', 0),
                usage_current_hour=rate_limit_info.get('usage_hour', 0),
                usage_current_day=rate_limit_info.get('usage_day', 0),
                limit_minute=tier_config.api_requests_per_minute,
                limit_hour=tier_config.api_requests_per_hour,
                limit_day=tier_config.api_requests_per_day,
                remaining_minute=rate_limit_info.get('remaining_minute', 0),
                remaining_hour=rate_limit_info.get('remaining_hour', 0),
                remaining_day=rate_limit_info.get('remaining_day', 0),
                last_activity=usage_info.get('last_activity'),
                endpoint_breakdown=usage_info.get('endpoint_breakdown', {})
            )

        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            raise

    async def get_subscription(self, user_id: str) -> Optional[Subscription]:
        """
        Get user's active subscription

        Args:
            user_id: User identifier

        Returns:
            Subscription object or None if not found
        """
        try:
            query = """
                SELECT * FROM user_subscriptions
                WHERE user_id = %s AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """
            result = self.db.execute_with_retry(query, (user_id,), readonly=True)

            if result and len(result) > 0:
                return Subscription(**result[0])

            return None

        except Exception as e:
            logger.error(f"Failed to get subscription: {e}")
            return None

    def invalidate_cache(self, user_id: str) -> None:
        """
        Invalidate cached tier info for a user

        Args:
            user_id: User identifier
        """
        if self.redis_client:
            try:
                self.redis_client.delete(f"tier:{user_id}")
                logger.debug(f"Invalidated cache for user {user_id}")
            except Exception as e:
                logger.warning(f"Cache invalidation failed: {e}")


# Singleton instance
_manager_instance = None


def get_subscription_manager() -> SubscriptionManager:
    """Get subscription manager singleton"""
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = SubscriptionManager()
    return _manager_instance


# Test function
if __name__ == '__main__':
    import asyncio
    import logging
    logging.basicConfig(level=logging.INFO)

    async def test():
        print("\n=== Subscription Manager Test ===\n")

        manager = SubscriptionManager()
        test_user = "test_user_123"

        print("1. Testing get_user_tier...")
        tier = await manager.get_user_tier(test_user)
        print(f"   User tier: {tier.value}")

        print("\n2. Testing check_feature_access...")
        has_discord = await manager.check_feature_access(test_user, "discord_alerts")
        has_telegram = await manager.check_feature_access(test_user, "telegram_alerts")
        print(f"   Discord alerts: {has_discord}")
        print(f"   Telegram alerts: {has_telegram}")

        print("\n3. Testing get_usage_stats...")
        try:
            stats = await manager.get_usage_stats(test_user)
            print(f"   Current day usage: {stats.usage_current_day}/{stats.limit_day}")
            print(f"   Remaining today: {stats.remaining_day}")
        except Exception as e:
            print(f"   Error: {e}")

        print("\n✅ Subscription manager ready")

    asyncio.run(test())
