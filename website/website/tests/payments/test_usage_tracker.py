# -*- coding: utf-8 -*-
"""
Usage Tracker Tests
Comprehensive tests for Redis-based rate limiting and usage tracking
"""

import pytest
import time
from unittest.mock import Mock, patch
import fakeredis

from api.subscriptions.usage_tracker import UsageTracker, get_usage_tracker
from api.subscriptions.tiers import TierName
from tests.payments.fixtures import redis_client


# ==========================================
# INITIALIZATION TESTS
# ==========================================

class TestUsageTrackerInit:
    """Test usage tracker initialization"""

    def test_init_with_redis_success(self):
        """Test successful initialization with Redis"""
        # Arrange & Act
        with patch('redis.from_url') as mock_redis:
            mock_client = Mock()
            mock_client.ping = Mock()
            mock_redis.return_value = mock_client

            tracker = UsageTracker()

            # Assert
            assert tracker.redis_client is not None
            mock_client.ping.assert_called_once()

    def test_init_redis_connection_failure(self):
        """Test initialization handles Redis connection failure"""
        # Arrange & Act
        with patch('redis.from_url') as mock_redis:
            mock_redis.side_effect = Exception("Connection failed")

            tracker = UsageTracker()

            # Assert
            assert tracker.redis_client is None

    def test_singleton_pattern(self):
        """Test get_usage_tracker returns singleton"""
        # Act
        tracker1 = get_usage_tracker()
        tracker2 = get_usage_tracker()

        # Assert
        assert tracker1 is tracker2


# ==========================================
# API CALL TRACKING TESTS
# ==========================================

class TestTrackApiCall:
    """Test API call tracking"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_track_api_call_success(self, tracker, redis_client):
        """Test successful API call tracking"""
        # Arrange
        user_id = "test_user_123"

        # Act
        tracker.track_api_call(user_id, endpoint="/exploits")

        # Assert
        current_time = int(time.time())
        minute_key = f"usage:{user_id}:minute:{current_time // 60}"
        assert redis_client.exists(minute_key)
        assert redis_client.get(minute_key) == "1"

    def test_track_multiple_calls(self, tracker, redis_client):
        """Test tracking multiple API calls"""
        # Arrange
        user_id = "test_user_123"

        # Act
        for _ in range(5):
            tracker.track_api_call(user_id)

        # Assert
        current_time = int(time.time())
        minute_key = f"usage:{user_id}:minute:{current_time // 60}"
        assert int(redis_client.get(minute_key)) == 5

    def test_track_with_endpoint(self, tracker, redis_client):
        """Test tracking with endpoint information"""
        # Arrange
        user_id = "test_user_123"
        endpoint = "/exploits"

        # Act
        tracker.track_api_call(user_id, endpoint=endpoint)

        # Assert
        current_time = int(time.time())
        endpoint_key = f"usage:{user_id}:endpoint:{endpoint}:{current_time // 86400}"
        assert redis_client.exists(endpoint_key)

    def test_track_updates_last_activity(self, tracker, redis_client):
        """Test tracking updates last activity timestamp"""
        # Arrange
        user_id = "test_user_123"

        # Act
        tracker.track_api_call(user_id)

        # Assert
        last_activity_key = f"usage:{user_id}:last_activity"
        assert redis_client.exists(last_activity_key)

    def test_track_without_redis(self):
        """Test tracking handles missing Redis gracefully"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act & Assert - should not raise error
        tracker.track_api_call("test_user_123")

    def test_track_sets_ttl(self, tracker, redis_client):
        """Test that tracked keys have TTL set"""
        # Arrange
        user_id = "test_user_123"

        # Act
        tracker.track_api_call(user_id)

        # Assert
        current_time = int(time.time())
        minute_key = f"usage:{user_id}:minute:{current_time // 60}"
        ttl = redis_client.ttl(minute_key)
        assert ttl > 0
        assert ttl <= 120  # Max 2 minutes


# ==========================================
# USAGE COUNT TESTS
# ==========================================

class TestGetUsageCount:
    """Test usage count retrieval"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_get_usage_count_minute(self, tracker):
        """Test getting minute usage count"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(3):
            tracker.track_api_call(user_id)

        # Act
        count = tracker.get_usage_count(user_id, "minute")

        # Assert
        assert count == 3

    def test_get_usage_count_hour(self, tracker):
        """Test getting hour usage count"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(10):
            tracker.track_api_call(user_id)

        # Act
        count = tracker.get_usage_count(user_id, "hour")

        # Assert
        assert count == 10

    def test_get_usage_count_day(self, tracker):
        """Test getting day usage count"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(25):
            tracker.track_api_call(user_id)

        # Act
        count = tracker.get_usage_count(user_id, "day")

        # Assert
        assert count == 25

    def test_get_usage_count_no_usage(self, tracker):
        """Test getting count with no usage"""
        # Act
        count = tracker.get_usage_count("new_user", "day")

        # Assert
        assert count == 0

    def test_get_usage_count_invalid_window(self, tracker):
        """Test invalid time window raises error"""
        # Act & Assert
        with pytest.raises(ValueError, match="Invalid time window"):
            tracker.get_usage_count("test_user", "invalid")

    def test_get_usage_count_without_redis(self):
        """Test usage count without Redis returns 0"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act
        count = tracker.get_usage_count("test_user", "day")

        # Assert
        assert count == 0


# ==========================================
# RATE LIMIT TESTS
# ==========================================

class TestCheckRateLimit:
    """Test rate limit checking"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_rate_limit_free_tier_within_limit(self, tracker):
        """Test FREE tier within rate limit"""
        # Arrange
        user_id = "test_user_free"
        for _ in range(50):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert
        assert result['allowed'] is True
        assert result['usage_day'] == 50
        assert result['remaining_day'] > 0

    def test_rate_limit_free_tier_exceeded(self, tracker):
        """Test FREE tier exceeding rate limit"""
        # Arrange
        user_id = "test_user_free"
        # FREE tier limit is 100/day
        for _ in range(101):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert
        assert result['allowed'] is False
        assert result['remaining_day'] == 0

    def test_rate_limit_basic_tier(self, tracker):
        """Test BASIC tier rate limits"""
        # Arrange
        user_id = "test_user_basic"
        for _ in range(500):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.BASIC)

        # Assert
        assert result['allowed'] is True
        assert result['usage_day'] == 500
        assert result['limit_day'] == 2000

    def test_rate_limit_pro_tier(self, tracker):
        """Test PRO tier rate limits"""
        # Arrange
        user_id = "test_user_pro"
        for _ in range(2000):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.PRO)

        # Assert
        assert result['allowed'] is True
        assert result['limit_day'] == 10000

    def test_rate_limit_enterprise_tier(self, tracker):
        """Test ENTERPRISE tier rate limits"""
        # Arrange
        user_id = "test_user_ent"
        for _ in range(5000):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.ENTERPRISE)

        # Assert
        assert result['allowed'] is True
        assert result['limit_day'] == 100000

    def test_rate_limit_minute_exceeded(self, tracker):
        """Test minute rate limit exceeded"""
        # Arrange
        user_id = "test_user_123"
        # FREE tier: 10/minute
        for _ in range(11):
            tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert
        assert result['allowed'] is False
        assert result['remaining_minute'] == 0

    def test_rate_limit_hour_exceeded(self, tracker):
        """Test hour rate limit exceeded"""
        # Arrange
        user_id = "test_user_123"
        # Simulate 51 calls (FREE tier: 50/hour)
        current_time = int(time.time())
        hour_key = f"usage:{user_id}:hour:{current_time // 3600}"
        tracker.redis_client.set(hour_key, 51)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert
        assert result['allowed'] is False

    def test_rate_limit_returns_reset_times(self, tracker):
        """Test rate limit returns reset timestamps"""
        # Arrange
        user_id = "test_user_123"
        tracker.track_api_call(user_id)

        # Act
        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert
        assert 'reset_minute' in result
        assert 'reset_hour' in result
        assert 'reset_day' in result
        assert result['reset_minute'] > int(time.time())

    def test_rate_limit_without_redis(self):
        """Test rate limit check without Redis"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act
        result = tracker.check_rate_limit("test_user", TierName.FREE)

        # Assert
        assert result['allowed'] is True
        assert result['remaining_day'] == 9999


# ==========================================
# USAGE RESET TESTS
# ==========================================

class TestResetUsage:
    """Test usage reset functionality"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_reset_all_windows(self, tracker):
        """Test resetting all time windows"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(5):
            tracker.track_api_call(user_id)

        # Act
        tracker.reset_usage(user_id)

        # Assert
        assert tracker.get_usage_count(user_id, "minute") == 0
        assert tracker.get_usage_count(user_id, "hour") == 0
        assert tracker.get_usage_count(user_id, "day") == 0

    def test_reset_specific_window(self, tracker):
        """Test resetting specific time window"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(10):
            tracker.track_api_call(user_id)

        # Act
        tracker.reset_usage(user_id, time_window="minute")

        # Assert
        assert tracker.get_usage_count(user_id, "minute") == 0
        assert tracker.get_usage_count(user_id, "hour") == 10
        assert tracker.get_usage_count(user_id, "day") == 10

    def test_reset_without_redis(self):
        """Test reset without Redis"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act & Assert - should not raise error
        tracker.reset_usage("test_user_123")


# ==========================================
# USAGE STATISTICS TESTS
# ==========================================

class TestGetUsageStats:
    """Test comprehensive usage statistics"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_get_usage_stats_complete(self, tracker):
        """Test getting complete usage statistics"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(5):
            tracker.track_api_call(user_id, endpoint="/exploits")
        for _ in range(3):
            tracker.track_api_call(user_id, endpoint="/alerts")

        # Act
        stats = tracker.get_usage_stats(user_id)

        # Assert
        assert stats['usage_current_minute'] == 8
        assert stats['usage_current_hour'] == 8
        assert stats['usage_current_day'] == 8
        assert 'last_activity' in stats
        assert len(stats['endpoint_breakdown']) == 2
        assert stats['endpoint_breakdown']['/exploits'] == 5
        assert stats['endpoint_breakdown']['/alerts'] == 3

    def test_get_usage_stats_no_activity(self, tracker):
        """Test stats for user with no activity"""
        # Act
        stats = tracker.get_usage_stats("new_user")

        # Assert
        assert stats['usage_current_day'] == 0
        assert stats['last_activity'] is None
        assert len(stats['endpoint_breakdown']) == 0

    def test_get_usage_stats_without_redis(self):
        """Test stats without Redis"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act
        stats = tracker.get_usage_stats("test_user")

        # Assert
        assert stats == {}


# ==========================================
# CLEANUP TESTS
# ==========================================

class TestCleanupOldKeys:
    """Test cleanup of expired keys"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_cleanup_sets_missing_ttl(self, tracker, redis_client):
        """Test cleanup sets TTL on keys without expiry"""
        # Arrange
        user_id = "test_user_123"
        current_time = int(time.time())

        # Create key without TTL
        minute_key = f"usage:{user_id}:minute:{current_time // 60}"
        redis_client.set(minute_key, 5)
        redis_client.persist(minute_key)  # Remove TTL

        # Act
        deleted = tracker.cleanup_old_keys(user_id)

        # Assert
        ttl = redis_client.ttl(minute_key)
        assert ttl > 0

    def test_cleanup_without_redis(self):
        """Test cleanup without Redis"""
        # Arrange
        tracker = UsageTracker()
        tracker.redis_client = None

        # Act
        deleted = tracker.cleanup_old_keys("test_user")

        # Assert
        assert deleted == 0


# ==========================================
# SLIDING WINDOW TESTS
# ==========================================

class TestSlidingWindow:
    """Test sliding window algorithm"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_sliding_window_different_minutes(self, tracker):
        """Test usage tracked across minute boundaries"""
        # Note: This is a conceptual test
        # Real sliding window testing requires time manipulation
        # which is complex with Redis keys based on timestamps

        # Arrange
        user_id = "test_user_123"

        # Act - track calls
        tracker.track_api_call(user_id)
        current_count = tracker.get_usage_count(user_id, "minute")

        # Assert
        assert current_count == 1

    def test_sliding_window_rate_limit_enforcement(self, tracker):
        """Test that rate limits are enforced per time window"""
        # Arrange
        user_id = "test_user_123"

        # Act - make exactly limit number of calls
        for _ in range(10):  # FREE tier minute limit
            tracker.track_api_call(user_id)

        result = tracker.check_rate_limit(user_id, TierName.FREE)

        # Assert - should be at limit but not over
        assert result['remaining_minute'] == 0
        assert result['allowed'] is False  # Next call would exceed


# ==========================================
# CONCURRENT ACCESS TESTS
# ==========================================

class TestConcurrentAccess:
    """Test concurrent access scenarios"""

    @pytest.fixture
    def tracker(self, redis_client):
        """Create usage tracker with fake Redis"""
        tracker = UsageTracker()
        tracker.redis_client = redis_client
        return tracker

    def test_concurrent_tracking(self, tracker):
        """Test multiple concurrent API calls"""
        # Arrange
        user_id = "test_user_123"

        # Act - simulate concurrent calls
        for _ in range(10):
            tracker.track_api_call(user_id)

        # Assert
        count = tracker.get_usage_count(user_id, "day")
        assert count == 10

    def test_concurrent_rate_limit_checks(self, tracker):
        """Test concurrent rate limit checks"""
        # Arrange
        user_id = "test_user_123"
        for _ in range(5):
            tracker.track_api_call(user_id)

        # Act - multiple concurrent checks
        results = []
        for _ in range(3):
            results.append(tracker.check_rate_limit(user_id, TierName.FREE))

        # Assert - all should return same result
        assert all(r['usage_day'] == 5 for r in results)
        assert all(r['allowed'] is True for r in results)
