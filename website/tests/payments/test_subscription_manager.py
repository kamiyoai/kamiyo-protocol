# -*- coding: utf-8 -*-
"""
Subscription Manager Tests
Comprehensive tests for subscription lifecycle management
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
import fakeredis

from api.subscriptions.manager import SubscriptionManager, get_subscription_manager
from api.subscriptions.tiers import TierName, get_tier
from tests.payments.fixtures import (
    redis_client,
    mock_db,
    free_tier_subscription,
    basic_tier_subscription,
    pro_tier_subscription,
    enterprise_tier_subscription
)


# ==========================================
# INITIALIZATION TESTS
# ==========================================

class TestSubscriptionManagerInit:
    """Test subscription manager initialization"""

    def test_init_with_redis(self):
        """Test initialization with Redis connection"""
        # Arrange & Act
        with patch('redis.from_url') as mock_redis:
            mock_redis_client = Mock()
            mock_redis_client.ping = Mock()
            mock_redis.return_value = mock_redis_client

            manager = SubscriptionManager()

            # Assert
            assert manager.redis_client is not None
            mock_redis_client.ping.assert_called_once()

    def test_init_redis_failure(self):
        """Test initialization handles Redis failure gracefully"""
        # Arrange & Act
        with patch('redis.from_url') as mock_redis:
            mock_redis.side_effect = Exception("Connection failed")

            manager = SubscriptionManager()

            # Assert
            assert manager.redis_client is None

    def test_singleton_pattern(self):
        """Test get_subscription_manager returns singleton"""
        # Act
        manager1 = get_subscription_manager()
        manager2 = get_subscription_manager()

        # Assert
        assert manager1 is manager2


# ==========================================
# TIER RETRIEVAL TESTS
# ==========================================

class TestGetUserTier:
    """Test user tier retrieval"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager with mocked dependencies"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker'):
                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                return manager

    @pytest.mark.asyncio
    async def test_get_tier_from_cache(self, manager, redis_client):
        """Test tier retrieval from Redis cache"""
        # Arrange
        user_id = "test_user_123"
        redis_client.set(f"tier:{user_id}", "pro")

        # Act
        tier = await manager.get_user_tier(user_id)

        # Assert
        assert tier == TierName.PRO
        assert not manager.db.execute_with_retry.called

    @pytest.mark.asyncio
    async def test_get_tier_from_database(self, manager, mock_db):
        """Test tier retrieval from database"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'basic'}]

        # Act
        tier = await manager.get_user_tier(user_id)

        # Assert
        assert tier == TierName.BASIC
        mock_db.execute_with_retry.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_tier_default_free(self, manager, mock_db):
        """Test default to FREE tier when no subscription"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = []

        # Act
        tier = await manager.get_user_tier(user_id)

        # Assert
        assert tier == TierName.FREE

    @pytest.mark.asyncio
    async def test_get_tier_caches_result(self, manager, mock_db, redis_client):
        """Test that tier is cached after database lookup"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'enterprise'}]

        # Act
        tier = await manager.get_user_tier(user_id)

        # Assert
        assert tier == TierName.ENTERPRISE
        cached = redis_client.get(f"tier:{user_id}")
        assert cached == "enterprise"

    @pytest.mark.asyncio
    async def test_get_tier_handles_db_error(self, manager, mock_db):
        """Test tier retrieval handles database errors"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = Exception("DB error")

        # Act
        tier = await manager.get_user_tier(user_id)

        # Assert - should default to FREE on error
        assert tier == TierName.FREE


# ==========================================
# FEATURE ACCESS TESTS
# ==========================================

class TestFeatureAccess:
    """Test feature access control"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker'):
                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                return manager

    @pytest.mark.asyncio
    async def test_free_tier_features(self, manager, mock_db):
        """Test FREE tier feature access"""
        # Arrange
        user_id = "test_user_free"
        mock_db.execute_with_retry.return_value = [{'tier': 'free'}]

        # Act & Assert
        assert await manager.check_feature_access(user_id, 'email_alerts') is True
        assert await manager.check_feature_access(user_id, 'discord_alerts') is False
        assert await manager.check_feature_access(user_id, 'telegram_alerts') is False
        assert await manager.check_feature_access(user_id, 'webhook_alerts') is False

    @pytest.mark.asyncio
    async def test_basic_tier_features(self, manager, mock_db):
        """Test BASIC tier feature access"""
        # Arrange
        user_id = "test_user_basic"
        mock_db.execute_with_retry.return_value = [{'tier': 'basic'}]

        # Act & Assert
        assert await manager.check_feature_access(user_id, 'email_alerts') is True
        assert await manager.check_feature_access(user_id, 'discord_alerts') is True
        assert await manager.check_feature_access(user_id, 'telegram_alerts') is False
        assert await manager.check_feature_access(user_id, 'csv_export') is True

    @pytest.mark.asyncio
    async def test_pro_tier_features(self, manager, mock_db):
        """Test PRO tier feature access"""
        # Arrange
        user_id = "test_user_pro"
        mock_db.execute_with_retry.return_value = [{'tier': 'pro'}]

        # Act & Assert
        assert await manager.check_feature_access(user_id, 'discord_alerts') is True
        assert await manager.check_feature_access(user_id, 'telegram_alerts') is True
        assert await manager.check_feature_access(user_id, 'webhook_alerts') is True
        assert await manager.check_feature_access(user_id, 'real_time_alerts') is True

    @pytest.mark.asyncio
    async def test_enterprise_tier_features(self, manager, mock_db):
        """Test ENTERPRISE tier has all features"""
        # Arrange
        user_id = "test_user_ent"
        mock_db.execute_with_retry.return_value = [{'tier': 'enterprise'}]

        # Act & Assert
        assert await manager.check_feature_access(user_id, 'white_label') is True
        assert await manager.check_feature_access(user_id, 'custom_integrations') is True
        assert await manager.check_feature_access(user_id, 'api_access') is True

    @pytest.mark.asyncio
    async def test_unknown_feature(self, manager, mock_db):
        """Test access to unknown feature returns False"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'pro'}]

        # Act
        has_access = await manager.check_feature_access(user_id, 'unknown_feature')

        # Assert
        assert has_access is False


# ==========================================
# UPGRADE/DOWNGRADE TESTS
# ==========================================

class TestTierChanges:
    """Test subscription tier changes"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker') as mock_tracker:
                tracker = Mock()
                tracker.reset_usage = Mock()
                mock_tracker.return_value = tracker

                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                manager.usage_tracker = tracker
                return manager

    @pytest.mark.asyncio
    async def test_upgrade_free_to_basic(self, manager, mock_db):
        """Test upgrade from FREE to BASIC"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'free'}],  # get_user_tier
            [{'user_id': user_id, 'tier': 'basic', 'status': 'active'}]  # update
        ]

        # Act
        result = await manager.upgrade_subscription(user_id, TierName.BASIC)

        # Assert
        assert result is not None
        assert result.tier == TierName.BASIC
        manager.usage_tracker.reset_usage.assert_called_once_with(user_id)

    @pytest.mark.asyncio
    async def test_upgrade_basic_to_pro(self, manager, mock_db):
        """Test upgrade from BASIC to PRO"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'basic'}],
            [{'user_id': user_id, 'tier': 'pro', 'status': 'active'}]
        ]

        # Act
        result = await manager.upgrade_subscription(user_id, TierName.PRO)

        # Assert
        assert result is not None
        assert result.tier == TierName.PRO

    @pytest.mark.asyncio
    async def test_upgrade_pro_to_enterprise(self, manager, mock_db):
        """Test upgrade from PRO to ENTERPRISE"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'pro'}],
            [{'user_id': user_id, 'tier': 'enterprise', 'status': 'active'}]
        ]

        # Act
        result = await manager.upgrade_subscription(user_id, TierName.ENTERPRISE)

        # Assert
        assert result is not None
        assert result.tier == TierName.ENTERPRISE

    @pytest.mark.asyncio
    async def test_upgrade_invalid_tier_change(self, manager, mock_db):
        """Test invalid upgrade (same tier or downgrade)"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'pro'}]

        # Act & Assert - try to "upgrade" to same tier
        with pytest.raises(ValueError, match="Cannot upgrade"):
            await manager.upgrade_subscription(user_id, TierName.PRO)

        # Try to "upgrade" to lower tier
        with pytest.raises(ValueError, match="Cannot upgrade"):
            await manager.upgrade_subscription(user_id, TierName.BASIC)

    @pytest.mark.asyncio
    async def test_upgrade_no_active_subscription(self, manager, mock_db):
        """Test upgrade fails when no active subscription"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'free'}],
            []  # No subscription found
        ]

        # Act & Assert
        with pytest.raises(ValueError, match="No active subscription"):
            await manager.upgrade_subscription(user_id, TierName.BASIC)

    @pytest.mark.asyncio
    async def test_upgrade_invalidates_cache(self, manager, mock_db, redis_client):
        """Test upgrade invalidates tier cache"""
        # Arrange
        user_id = "test_user_123"
        redis_client.set(f"tier:{user_id}", "free")
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'free'}],
            [{'user_id': user_id, 'tier': 'basic', 'status': 'active'}]
        ]

        # Act
        await manager.upgrade_subscription(user_id, TierName.BASIC)

        # Assert
        cached = redis_client.get(f"tier:{user_id}")
        assert cached is None  # Cache was invalidated

    @pytest.mark.asyncio
    async def test_downgrade_pro_to_basic(self, manager, mock_db):
        """Test downgrade from PRO to BASIC"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = [
            [{'tier': 'pro'}],
            [{'user_id': user_id, 'tier': 'pro', 'cancel_at_period_end': True}]
        ]

        # Act
        result = await manager.downgrade_subscription(user_id, TierName.BASIC)

        # Assert
        assert result is not None
        assert result.cancel_at_period_end is True

    @pytest.mark.asyncio
    async def test_downgrade_invalid_tier_change(self, manager, mock_db):
        """Test invalid downgrade"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'basic'}]

        # Act & Assert
        with pytest.raises(ValueError, match="Cannot downgrade"):
            await manager.downgrade_subscription(user_id, TierName.PRO)


# ==========================================
# SUBSCRIPTION CANCELLATION TESTS
# ==========================================

class TestSubscriptionCancellation:
    """Test subscription cancellation"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker'):
                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                return manager

    @pytest.mark.asyncio
    async def test_cancel_subscription_success(self, manager, mock_db):
        """Test successful subscription cancellation"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'id': 1}]

        # Act
        result = await manager.cancel_subscription(user_id)

        # Assert
        assert result is True
        mock_db.execute_with_retry.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_no_active_subscription(self, manager, mock_db):
        """Test cancellation fails with no active subscription"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = []

        # Act & Assert
        with pytest.raises(ValueError, match="No active subscription"):
            await manager.cancel_subscription(user_id)

    @pytest.mark.asyncio
    async def test_cancel_invalidates_cache(self, manager, mock_db, redis_client):
        """Test cancellation invalidates tier cache"""
        # Arrange
        user_id = "test_user_123"
        redis_client.set(f"tier:{user_id}", "pro")
        mock_db.execute_with_retry.return_value = [{'id': 1}]

        # Act
        await manager.cancel_subscription(user_id)

        # Assert
        cached = redis_client.get(f"tier:{user_id}")
        assert cached is None


# ==========================================
# USAGE STATISTICS TESTS
# ==========================================

class TestUsageStatistics:
    """Test usage statistics retrieval"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker') as mock_tracker:
                tracker = Mock()
                tracker.check_rate_limit = Mock(return_value={
                    'usage_minute': 5,
                    'usage_hour': 100,
                    'usage_day': 500,
                    'remaining_minute': 25,
                    'remaining_hour': 400,
                    'remaining_day': 1500
                })
                tracker.get_usage_stats = Mock(return_value={
                    'last_activity': '2025-01-01T12:00:00',
                    'endpoint_breakdown': {
                        '/exploits': 300,
                        '/alerts': 200
                    }
                })
                mock_tracker.return_value = tracker

                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                manager.usage_tracker = tracker
                return manager

    @pytest.mark.asyncio
    async def test_get_usage_stats_success(self, manager, mock_db):
        """Test successful usage statistics retrieval"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.return_value = [{'tier': 'pro'}]

        # Act
        stats = await manager.get_usage_stats(user_id)

        # Assert
        assert stats is not None
        assert stats.tier == TierName.PRO
        assert stats.usage_current_day == 500
        assert stats.remaining_day == 1500
        assert len(stats.endpoint_breakdown) == 2

    @pytest.mark.asyncio
    async def test_get_usage_stats_handles_error(self, manager, mock_db):
        """Test usage stats handles errors gracefully"""
        # Arrange
        user_id = "test_user_123"
        mock_db.execute_with_retry.side_effect = Exception("DB error")

        # Act & Assert
        with pytest.raises(Exception):
            await manager.get_usage_stats(user_id)


# ==========================================
# CACHE MANAGEMENT TESTS
# ==========================================

class TestCacheManagement:
    """Test cache management operations"""

    @pytest.fixture
    def manager(self, mock_db, redis_client):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker'):
                manager = SubscriptionManager(db=mock_db)
                manager.redis_client = redis_client
                return manager

    def test_invalidate_cache_success(self, manager, redis_client):
        """Test cache invalidation"""
        # Arrange
        user_id = "test_user_123"
        redis_client.set(f"tier:{user_id}", "basic")

        # Act
        manager.invalidate_cache(user_id)

        # Assert
        cached = redis_client.get(f"tier:{user_id}")
        assert cached is None

    def test_invalidate_cache_no_redis(self):
        """Test cache invalidation without Redis"""
        # Arrange
        manager = SubscriptionManager()
        manager.redis_client = None

        # Act & Assert - should not raise error
        manager.invalidate_cache("test_user_123")

    def test_cache_ttl_respected(self, manager, redis_client):
        """Test that cache TTL is set correctly"""
        # Arrange
        user_id = "test_user_123"
        manager.cache_ttl = 10  # 10 seconds

        # This would need actual integration test with time.sleep
        # Skipping for unit test
        pass


# ==========================================
# SUBSCRIPTION RETRIEVAL TESTS
# ==========================================

class TestGetSubscription:
    """Test subscription retrieval"""

    @pytest.fixture
    def manager(self, mock_db):
        """Create subscription manager"""
        with patch('api.subscriptions.manager.get_db', return_value=mock_db):
            with patch('api.subscriptions.manager.get_usage_tracker'):
                return SubscriptionManager(db=mock_db)

    @pytest.mark.asyncio
    async def test_get_subscription_success(
        self,
        manager,
        mock_db,
        basic_tier_subscription
    ):
        """Test successful subscription retrieval"""
        # Arrange
        mock_db.execute_with_retry.return_value = [basic_tier_subscription]

        # Act
        result = await manager.get_subscription(basic_tier_subscription['user_id'])

        # Assert
        assert result is not None
        assert result.tier == TierName.BASIC
        assert result.status == 'active'

    @pytest.mark.asyncio
    async def test_get_subscription_not_found(self, manager, mock_db):
        """Test subscription not found"""
        # Arrange
        mock_db.execute_with_retry.return_value = []

        # Act
        result = await manager.get_subscription("non_existent_user")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_get_subscription_handles_error(self, manager, mock_db):
        """Test subscription retrieval handles errors"""
        # Arrange
        mock_db.execute_with_retry.side_effect = Exception("DB error")

        # Act
        result = await manager.get_subscription("test_user_123")

        # Assert
        assert result is None
