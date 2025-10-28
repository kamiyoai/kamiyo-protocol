# -*- coding: utf-8 -*-
"""
Subscription Tier Definitions for Kamiyo
Defines the four subscription tiers with their features and limits
"""

from enum import Enum
from typing import List, Dict
from pydantic import BaseModel, Field
from decimal import Decimal


class TierName(str, Enum):
    """Subscription tier names"""
    FREE = "free"
    PRO = "pro"
    TEAM = "team"
    ENTERPRISE = "enterprise"


class SubscriptionTier(BaseModel):
    """
    Subscription tier configuration

    Defines all features and limits for a subscription tier
    """

    name: TierName = Field(..., description="Tier name")
    display_name: str = Field(..., description="Display name for tier")
    price_monthly_usd: Decimal = Field(..., description="Monthly price in USD")

    # API Rate Limits
    api_requests_per_day: int = Field(..., description="Daily API request limit")
    api_requests_per_hour: int = Field(..., description="Hourly API request limit")
    api_requests_per_minute: int = Field(..., description="Per-minute API request limit")

    # x402 Payment Features
    x402_payments: bool = Field(True, description="x402 pay-per-use enabled")
    usdc_payments: bool = Field(True, description="USDC on-chain payments enabled")
    no_account_required: bool = Field(True, description="x402 no-account mode enabled")

    # Integration Features
    websocket_connections: bool = Field(False, description="WebSocket connections enabled")
    javascript_sdk: bool = Field(True, description="JavaScript SDK access")
    multiple_api_keys: bool = Field(False, description="Multiple API keys allowed")

    # Analytics & Monitoring
    usage_analytics: bool = Field(False, description="Usage analytics dashboard")
    real_time_monitoring: bool = Field(False, description="Real-time monitoring enabled")

    # Data Access
    historical_data_days: int = Field(..., description="Days of historical data access")

    # Support Levels
    support_level: str = Field(..., description="Support level (community/email/priority/dedicated)")
    email_support: bool = Field(False, description="Email support enabled")
    priority_support: bool = Field(False, description="Priority support enabled")
    dedicated_support_engineer: bool = Field(False, description="Dedicated support engineer")

    # Enterprise Features
    custom_payment_integrations: bool = Field(False, description="Custom payment integrations")
    sla_guarantee: bool = Field(False, description="99.9% SLA guarantee")

    # Export Features
    csv_export: bool = Field(True, description="CSV export enabled")
    json_export: bool = Field(True, description="JSON export enabled")
    api_access: bool = Field(True, description="API access enabled")

    class Config:
        use_enum_values = True


# Define all tiers according to specifications
TIERS: Dict[TierName, SubscriptionTier] = {
    TierName.FREE: SubscriptionTier(
        name=TierName.FREE,
        display_name="Free",
        price_monthly_usd=Decimal("0.00"),

        # Rate Limits - 1K API requests/day
        api_requests_per_day=1000,
        api_requests_per_hour=42,
        api_requests_per_minute=10,

        # x402 Payment Features - All tiers
        x402_payments=True,
        usdc_payments=True,
        no_account_required=True,

        # Integration Features
        websocket_connections=False,
        javascript_sdk=True,
        multiple_api_keys=False,

        # Analytics & Monitoring
        usage_analytics=False,
        real_time_monitoring=False,

        # Data Access - Limited
        historical_data_days=7,

        # Support - Community only
        support_level="community",
        email_support=False,
        priority_support=False,
        dedicated_support_engineer=False,

        # Enterprise Features - None
        custom_payment_integrations=False,
        sla_guarantee=False,

        # Export - Basic
        csv_export=True,
        json_export=True,
        api_access=True
    ),

    TierName.PRO: SubscriptionTier(
        name=TierName.PRO,
        display_name="Pro",
        price_monthly_usd=Decimal("89.00"),

        # Rate Limits - 50K requests/day
        api_requests_per_day=50000,
        api_requests_per_hour=2083,  # ~2K per hour
        api_requests_per_minute=35,

        # x402 Payment Features - All tiers
        x402_payments=True,
        usdc_payments=True,
        no_account_required=True,

        # Integration Features
        websocket_connections=True,
        javascript_sdk=True,
        multiple_api_keys=False,

        # Analytics & Monitoring
        usage_analytics=False,
        real_time_monitoring=True,

        # Data Access - 90 days historical
        historical_data_days=90,

        # Support - Email
        support_level="email",
        email_support=True,
        priority_support=False,
        dedicated_support_engineer=False,

        # Enterprise Features - None
        custom_payment_integrations=False,
        sla_guarantee=False,

        # Export - Full
        csv_export=True,
        json_export=True,
        api_access=True
    ),

    TierName.TEAM: SubscriptionTier(
        name=TierName.TEAM,
        display_name="Team",
        price_monthly_usd=Decimal("199.00"),

        # Rate Limits - 100K requests/day
        api_requests_per_day=100000,
        api_requests_per_hour=4167,  # ~4K per hour
        api_requests_per_minute=70,

        # x402 Payment Features - All tiers
        x402_payments=True,
        usdc_payments=True,
        no_account_required=True,

        # Integration Features
        websocket_connections=True,
        javascript_sdk=True,
        multiple_api_keys=True,

        # Analytics & Monitoring
        usage_analytics=True,
        real_time_monitoring=True,

        # Data Access - 1 year historical
        historical_data_days=365,

        # Support - Priority
        support_level="priority",
        email_support=True,
        priority_support=True,
        dedicated_support_engineer=False,

        # Enterprise Features - None
        custom_payment_integrations=False,
        sla_guarantee=False,

        # Export - Full
        csv_export=True,
        json_export=True,
        api_access=True
    ),

    TierName.ENTERPRISE: SubscriptionTier(
        name=TierName.ENTERPRISE,
        display_name="Enterprise",
        price_monthly_usd=Decimal("499.00"),

        # Rate Limits - Unlimited
        api_requests_per_day=999999,  # Effectively unlimited
        api_requests_per_hour=99999,
        api_requests_per_minute=1000,

        # x402 Payment Features - All tiers
        x402_payments=True,
        usdc_payments=True,
        no_account_required=True,

        # Integration Features
        websocket_connections=True,
        javascript_sdk=True,
        multiple_api_keys=True,

        # Analytics & Monitoring
        usage_analytics=True,
        real_time_monitoring=True,

        # Data Access - 2+ years historical
        historical_data_days=730,  # 2+ years

        # Support - Dedicated
        support_level="dedicated",
        email_support=True,
        priority_support=True,
        dedicated_support_engineer=True,

        # Enterprise Features - All
        custom_payment_integrations=True,
        sla_guarantee=True,

        # Export - Full
        csv_export=True,
        json_export=True,
        api_access=True
    )
}


def get_tier(tier_name: TierName) -> SubscriptionTier:
    """
    Get tier configuration by name

    Args:
        tier_name: Tier name enum

    Returns:
        SubscriptionTier configuration

    Raises:
        ValueError: If tier name is invalid
    """
    if tier_name not in TIERS:
        raise ValueError(f"Invalid tier name: {tier_name}")

    return TIERS[tier_name]


def get_all_tiers() -> List[SubscriptionTier]:
    """
    Get all tier configurations

    Returns:
        List of all subscription tiers
    """
    return [TIERS[tier] for tier in [TierName.FREE, TierName.PRO, TierName.TEAM, TierName.ENTERPRISE]]


def compare_tiers(tier_a: TierName, tier_b: TierName) -> int:
    """
    Compare two tiers

    Args:
        tier_a: First tier
        tier_b: Second tier

    Returns:
        -1 if tier_a < tier_b, 0 if equal, 1 if tier_a > tier_b
    """
    tier_order = {
        TierName.FREE: 0,
        TierName.PRO: 1,
        TierName.TEAM: 2,
        TierName.ENTERPRISE: 3
    }

    order_a = tier_order.get(tier_a, 0)
    order_b = tier_order.get(tier_b, 0)

    if order_a < order_b:
        return -1
    elif order_a > order_b:
        return 1
    else:
        return 0


def is_upgrade(from_tier: TierName, to_tier: TierName) -> bool:
    """
    Check if changing tiers is an upgrade

    Args:
        from_tier: Current tier
        to_tier: New tier

    Returns:
        True if upgrade, False otherwise
    """
    return compare_tiers(from_tier, to_tier) < 0


def is_downgrade(from_tier: TierName, to_tier: TierName) -> bool:
    """
    Check if changing tiers is a downgrade

    Args:
        from_tier: Current tier
        to_tier: New tier

    Returns:
        True if downgrade, False otherwise
    """
    return compare_tiers(from_tier, to_tier) > 0


# Test function
if __name__ == '__main__':
    import json

    print("\n=== Kamiyo Subscription Tiers ===\n")

    for tier_name in [TierName.FREE, TierName.PRO, TierName.TEAM, TierName.ENTERPRISE]:
        tier = get_tier(tier_name)
        print(f"\n{tier.display_name} - ${tier.price_monthly_usd}/month")
        print("-" * 60)
        print(f"  API Requests/Day: {tier.api_requests_per_day:,}")
        print(f"  WebSocket Connections: {'Yes' if tier.websocket_connections else 'No'}")
        print(f"  JavaScript SDK: {'Yes' if tier.javascript_sdk else 'No'}")
        print(f"  Multiple API Keys: {'Yes' if tier.multiple_api_keys else 'No'}")
        print(f"  Usage Analytics: {'Yes' if tier.usage_analytics else 'No'}")
        print(f"  Historical Data: {tier.historical_data_days} days")
        print(f"  Real-time Monitoring: {'Yes' if tier.real_time_monitoring else 'No'}")
        print(f"  Support Level: {tier.support_level.title()}")
        if tier.custom_payment_integrations:
            print(f"  Custom Payment Integrations: Yes")
        if tier.sla_guarantee:
            print(f"  SLA Guarantee: Yes")
        if tier.dedicated_support_engineer:
            print(f"  Dedicated Support Engineer: Yes")

    print("\n\n=== Tier Comparison ===")
    print(f"FREE -> PRO: {'Upgrade' if is_upgrade(TierName.FREE, TierName.PRO) else 'Not an upgrade'}")
    print(f"TEAM -> PRO: {'Downgrade' if is_downgrade(TierName.TEAM, TierName.PRO) else 'Not a downgrade'}")
    print(f"PRO -> PRO: {'Same tier' if compare_tiers(TierName.PRO, TierName.PRO) == 0 else 'Different'}")

    print("\n✅ Tier definitions ready")
