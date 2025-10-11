"""
Subscription tier management and limits.
"""

from enum import Enum
from typing import Dict, List
from pydantic import BaseModel


class SubscriptionTier(str, Enum):
    """Subscription tier levels."""
    FREE = "FREE"
    BASIC = "BASIC"
    PRO = "PRO"


# ========== Tier Configurations ==========

TIER_LIMITS = {
    SubscriptionTier.FREE: {
        "name": "Free Tier",
        "price_monthly": 0,
        "data_delay_hours": 24,  # 24h delayed data
        "rate_limit_per_hour": 10,  # 10 requests per hour
        "api_access": False,  # No API key access (public endpoints only)
        "webhook_limit": 0,  # No webhooks
        "features": [
            "24-hour delayed exploit data",
            "Basic dashboard access",
            "10 requests per hour",
            "No API key required for public endpoints"
        ],
        "limitations": [
            "No real-time alerts",
            "No webhook support",
            "No advanced analytics",
            "Limited to public data only"
        ]
    },
    SubscriptionTier.BASIC: {
        "name": "Basic Plan",
        "price_monthly": 49,
        "data_delay_hours": 1,  # 1h delayed data
        "rate_limit_per_hour": 100,  # 100 requests per hour
        "api_access": True,  # Full API access
        "webhook_limit": 1,  # 1 webhook endpoint
        "features": [
            "1-hour delayed exploit data",
            "Full API access with API key",
            "100 requests per hour",
            "1 webhook endpoint",
            "Basic email alerts",
            "Historical data access"
        ],
        "limitations": [
            "1-hour data delay",
            "Single webhook only",
            "Standard support"
        ]
    },
    SubscriptionTier.PRO: {
        "name": "Professional Plan",
        "price_monthly": 199,
        "data_delay_hours": 0,  # Real-time data
        "rate_limit_per_hour": 1000,  # 1000 requests per hour
        "api_access": True,  # Full API access
        "webhook_limit": 10,  # Up to 10 webhook endpoints
        "features": [
            "Real-time exploit data",
            "Full API access with API key",
            "1000 requests per hour",
            "Up to 10 webhook endpoints",
            "Custom alert configurations",
            "Advanced filtering and analytics",
            "Priority support",
            "Historical data export",
            "Custom integrations support"
        ],
        "limitations": []
    }
}


# ========== Stripe Price IDs (Placeholders) ==========

STRIPE_PRICE_IDS = {
    SubscriptionTier.BASIC: "price_basic_monthly_49",  # Replace with actual Stripe price ID
    SubscriptionTier.PRO: "price_pro_monthly_199"  # Replace with actual Stripe price ID
}


# ========== Helper Functions ==========

def get_tier_limits(tier: SubscriptionTier) -> Dict:
    """
    Get limits and features for a subscription tier.

    Args:
        tier: Subscription tier

    Returns:
        Dict with tier configuration
    """
    return TIER_LIMITS.get(tier, TIER_LIMITS[SubscriptionTier.FREE])


def get_all_tiers() -> Dict[SubscriptionTier, Dict]:
    """Get all tier configurations."""
    return TIER_LIMITS


def can_access_endpoint(tier: SubscriptionTier, endpoint_type: str) -> bool:
    """
    Check if a tier can access a specific endpoint type.

    Args:
        tier: Subscription tier
        endpoint_type: Type of endpoint (public, api, webhook, etc.)

    Returns:
        True if access is allowed
    """
    limits = get_tier_limits(tier)

    if endpoint_type == "public":
        return True  # Everyone can access public endpoints

    if endpoint_type == "api":
        return limits["api_access"]

    if endpoint_type == "webhook":
        return limits["webhook_limit"] > 0

    return False


def get_data_delay_hours(tier: SubscriptionTier) -> int:
    """Get data delay in hours for a tier."""
    return get_tier_limits(tier)["data_delay_hours"]


def get_rate_limit(tier: SubscriptionTier) -> int:
    """Get rate limit per hour for a tier."""
    return get_tier_limits(tier)["rate_limit_per_hour"]


def get_webhook_limit(tier: SubscriptionTier) -> int:
    """Get webhook limit for a tier."""
    return get_tier_limits(tier)["webhook_limit"]


# ========== Tier Comparison ==========

class TierComparison(BaseModel):
    """Tier comparison for pricing page."""
    tier: str
    name: str
    price_monthly: int
    data_delay: str
    rate_limit: str
    api_access: bool
    webhook_limit: int
    features: List[str]
    limitations: List[str]
    stripe_price_id: str = None


def get_tier_comparison() -> List[TierComparison]:
    """Get formatted tier comparison for pricing page."""
    comparisons = []

    for tier, limits in TIER_LIMITS.items():
        # Format data delay
        if limits["data_delay_hours"] == 0:
            delay_str = "Real-time"
        elif limits["data_delay_hours"] == 1:
            delay_str = "1 hour delay"
        else:
            delay_str = f"{limits['data_delay_hours']} hours delay"

        # Format rate limit
        rate_str = f"{limits['rate_limit_per_hour']} requests/hour"

        comparison = TierComparison(
            tier=tier.value,
            name=limits["name"],
            price_monthly=limits["price_monthly"],
            data_delay=delay_str,
            rate_limit=rate_str,
            api_access=limits["api_access"],
            webhook_limit=limits["webhook_limit"],
            features=limits["features"],
            limitations=limits["limitations"],
            stripe_price_id=STRIPE_PRICE_IDS.get(tier)
        )
        comparisons.append(comparison)

    return comparisons


# ========== Subscription Validation ==========

def validate_webhook_count(tier: SubscriptionTier, current_count: int) -> bool:
    """
    Check if user can add another webhook.

    Args:
        tier: Current subscription tier
        current_count: Current number of webhooks

    Returns:
        True if user can add another webhook
    """
    limit = get_webhook_limit(tier)
    return current_count < limit


def get_tier_by_name(tier_name: str) -> SubscriptionTier:
    """
    Get tier enum by name string.

    Args:
        tier_name: Tier name string (case-insensitive)

    Returns:
        SubscriptionTier enum

    Raises:
        ValueError: If tier name is invalid
    """
    try:
        return SubscriptionTier[tier_name.upper()]
    except KeyError:
        raise ValueError(f"Invalid tier name: {tier_name}")


# ========== Stripe Integration Helpers ==========

def get_stripe_checkout_url(tier: SubscriptionTier, customer_email: str = None) -> str:
    """
    Generate Stripe checkout URL (placeholder).

    In production, this would:
    1. Create a Stripe checkout session
    2. Return the session URL
    3. Handle success/cancel callbacks

    Args:
        tier: Subscription tier to purchase
        customer_email: Optional customer email

    Returns:
        Stripe checkout URL (placeholder)
    """
    price_id = STRIPE_PRICE_IDS.get(tier)
    if not price_id:
        raise ValueError(f"No Stripe price ID configured for tier: {tier}")

    # Placeholder URL - replace with actual Stripe integration
    return f"https://checkout.stripe.com/pay/{price_id}?prefilled_email={customer_email or ''}"


def handle_stripe_webhook(event_type: str, event_data: dict) -> bool:
    """
    Handle Stripe webhook events (placeholder).

    In production, this would:
    1. Verify webhook signature
    2. Process events (subscription.created, subscription.deleted, etc.)
    3. Update user subscriptions in database
    4. Send confirmation emails

    Args:
        event_type: Stripe event type
        event_data: Event data payload

    Returns:
        True if event was handled successfully
    """
    # Placeholder implementation
    if event_type == "checkout.session.completed":
        # Create/activate subscription
        pass
    elif event_type == "customer.subscription.deleted":
        # Cancel subscription
        pass
    elif event_type == "customer.subscription.updated":
        # Update subscription
        pass
    elif event_type == "invoice.payment_failed":
        # Handle failed payment
        pass

    return True


# ========== Usage Tracking ==========

class UsageStats(BaseModel):
    """Usage statistics for a subscription."""
    api_calls_current_hour: int
    api_calls_today: int
    api_calls_month: int
    webhooks_configured: int
    last_api_call: str = None
    data_delay_hours: int


def get_usage_stats(api_key: str, tier: SubscriptionTier) -> UsageStats:
    """
    Get usage statistics for an API key (placeholder).

    In production, this would query usage from database or cache.

    Args:
        api_key: API key to check
        tier: Subscription tier

    Returns:
        UsageStats object
    """
    # Placeholder - would fetch from database/Redis in production
    return UsageStats(
        api_calls_current_hour=0,
        api_calls_today=0,
        api_calls_month=0,
        webhooks_configured=0,
        data_delay_hours=get_data_delay_hours(tier)
    )
