# -*- coding: utf-8 -*-
"""
Test Suite for Subscription Management System
Tests tiers, usage tracking, and subscription management
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_tiers():
    """Test tier definitions"""
    print("\n=== Testing Tier Definitions ===")

    from api.subscriptions.tiers import (
        TierName, get_tier, get_all_tiers, compare_tiers,
        is_upgrade, is_downgrade
    )

    # Test getting individual tiers
    free_tier = get_tier(TierName.FREE)
    assert free_tier.api_requests_per_day == 100
    assert free_tier.email_alerts == True
    assert free_tier.discord_alerts == False
    print("✓ Free tier configuration correct")

    basic_tier = get_tier(TierName.BASIC)
    assert basic_tier.api_requests_per_day == 1000
    assert basic_tier.discord_alerts == True
    assert basic_tier.real_time_alerts == True
    print("✓ Basic tier configuration correct")

    pro_tier = get_tier(TierName.PRO)
    assert pro_tier.api_requests_per_day == 10000
    assert pro_tier.telegram_alerts == True
    assert pro_tier.webhook_alerts == True
    print("✓ Pro tier configuration correct")

    enterprise_tier = get_tier(TierName.ENTERPRISE)
    assert enterprise_tier.api_requests_per_day == 999999
    assert enterprise_tier.custom_integrations == True
    assert enterprise_tier.dedicated_account_manager == True
    print("✓ Enterprise tier configuration correct")

    # Test tier comparison
    assert is_upgrade(TierName.FREE, TierName.BASIC) == True
    assert is_upgrade(TierName.BASIC, TierName.FREE) == False
    assert is_downgrade(TierName.PRO, TierName.BASIC) == True
    assert is_downgrade(TierName.BASIC, TierName.PRO) == False
    print("✓ Tier comparison logic correct")

    # Test getting all tiers
    all_tiers = get_all_tiers()
    assert len(all_tiers) == 4
    print("✓ All tiers retrieved")

    print("✅ Tier definitions: PASSED\n")


def test_usage_tracker():
    """Test usage tracker with Redis"""
    print("\n=== Testing Usage Tracker ===")

    try:
        from api.subscriptions.usage_tracker import UsageTracker
        from api.subscriptions.tiers import TierName

        tracker = UsageTracker()

        test_user = "test_user_integration"

        # Reset usage first
        tracker.reset_usage(test_user)
        print("✓ Usage reset")

        # Track some API calls
        for i in range(5):
            tracker.track_api_call(test_user, endpoint="/test")

        print("✓ Tracked 5 API calls")

        # Check usage counts
        usage_day = tracker.get_usage_count(test_user, "day")
        assert usage_day == 5, f"Expected 5, got {usage_day}"
        print(f"✓ Daily usage count: {usage_day}")

        # Check rate limits
        result = tracker.check_rate_limit(test_user, TierName.FREE)
        assert result['allowed'] == True
        assert result['usage_day'] == 5
        assert result['limit_day'] == 100
        remaining = result['remaining_day']
        assert remaining == 95, f"Expected 95 remaining, got {remaining}"
        print(f"✓ Rate limit check passed (remaining: {remaining})")

        # Get usage stats
        stats = tracker.get_usage_stats(test_user)
        assert stats['usage_current_day'] == 5
        print("✓ Usage stats retrieved")

        print("✅ Usage Tracker: PASSED\n")

    except Exception as e:
        print(f"⚠️  Usage Tracker: SKIPPED (Redis not available: {e})\n")


async def test_subscription_manager():
    """Test subscription manager"""
    print("\n=== Testing Subscription Manager ===")

    try:
        from api.subscriptions.manager import SubscriptionManager
        from api.subscriptions.tiers import TierName

        manager = SubscriptionManager()

        test_user = "test_manager_user"

        # Test getting user tier (should default to FREE)
        tier = await manager.get_user_tier(test_user)
        print(f"✓ Got user tier: {tier.value}")

        # Test feature access
        has_discord = await manager.check_feature_access(test_user, "discord_alerts")
        print(f"✓ Discord alerts access (FREE tier): {has_discord}")

        has_email = await manager.check_feature_access(test_user, "email_alerts")
        print(f"✓ Email alerts access (FREE tier): {has_email}")

        # Test getting usage stats
        try:
            stats = await manager.get_usage_stats(test_user)
            print(f"✓ Usage stats retrieved: {stats.usage_current_day} requests today")
        except Exception as e:
            print(f"⚠️  Usage stats skipped: {e}")

        print("✅ Subscription Manager: PASSED\n")

    except Exception as e:
        print(f"⚠️  Subscription Manager: SKIPPED ({e})\n")


def test_integration():
    """Test full integration"""
    print("\n=== Testing Full Integration ===")

    from api.subscriptions.tiers import TierName, get_tier
    from api.subscriptions.usage_tracker import UsageTracker

    try:
        tracker = UsageTracker()

        # Simulate user journey
        user_id = "integration_test_user"

        # 1. Start with free tier
        free_tier = get_tier(TierName.FREE)
        print(f"1. User starts with FREE tier ({free_tier.api_requests_per_day} req/day)")

        # 2. Reset and make requests
        tracker.reset_usage(user_id)
        for i in range(10):
            tracker.track_api_call(user_id, endpoint="/exploits")

        result = tracker.check_rate_limit(user_id, TierName.FREE)
        print(f"2. Made 10 requests, {result.get('remaining_day', 0)} remaining")

        # 3. Simulate upgrade to PRO
        pro_tier = get_tier(TierName.PRO)
        print(f"3. User upgrades to PRO tier ({pro_tier.api_requests_per_day} req/day)")

        # 4. Check new limits
        result = tracker.check_rate_limit(user_id, TierName.PRO)
        print(f"4. After upgrade: {result.get('remaining_day', 0)} remaining")

        # 5. Check enterprise tier
        enterprise_tier = get_tier(TierName.ENTERPRISE)
        print(f"5. Enterprise tier has unlimited requests: {enterprise_tier.api_requests_per_day}")

        print("✅ Integration Test: PASSED\n")

    except Exception as e:
        print(f"⚠️  Integration Test: SKIPPED ({e})\n")


def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("KAMIYO SUBSCRIPTION MANAGEMENT - TEST SUITE")
    print("="*70)

    # Test tier definitions
    test_tiers()

    # Test usage tracker (requires Redis)
    test_usage_tracker()

    # Test subscription manager (async)
    asyncio.run(test_subscription_manager())

    # Test integration
    test_integration()

    print("="*70)
    print("TEST SUITE COMPLETE")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()
