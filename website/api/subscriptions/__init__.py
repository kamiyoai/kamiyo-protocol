# -*- coding: utf-8 -*-
"""
Subscription Management Module for Kamiyo
Handles tier enforcement, usage tracking, and subscription lifecycle
"""

# Import tier definitions (no dependencies)
from .tiers import SubscriptionTier, TierName, TIERS

# Lazy imports for components with external dependencies
def get_subscription_manager():
    """Lazy import for SubscriptionManager (requires Redis)"""
    from .manager import SubscriptionManager, get_subscription_manager
    return get_subscription_manager()

def get_usage_tracker():
    """Lazy import for UsageTracker (requires Redis)"""
    from .usage_tracker import UsageTracker, get_usage_tracker
    return get_usage_tracker()

def get_middleware():
    """Lazy import for middleware"""
    from .middleware import subscription_enforcement_middleware
    return subscription_enforcement_middleware

__all__ = [
    'SubscriptionTier',
    'TierName',
    'TIERS',
    'get_subscription_manager',
    'get_usage_tracker',
    'get_middleware'
]
