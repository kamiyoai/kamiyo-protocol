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

    # Alert Features
    email_alerts: bool = Field(True, description="Email alerts enabled")
    discord_alerts: bool = Field(False, description="Discord alerts enabled")
    telegram_alerts: bool = Field(False, description="Telegram alerts enabled")
    webhook_alerts: bool = Field(False, description="Webhook alerts enabled")

    # Data Access
    historical_data_days: int = Field(..., description="Days of historical data access")
    real_time_alerts: bool = Field(False, description="Real-time alert delivery")

    # Support
    support_level: str = Field(..., description="Support level (community/email/priority/dedicated)")

    # Advanced Features
    custom_integrations: bool = Field(False, description="Custom integration support")
    dedicated_account_manager: bool = Field(False, description="Dedicated account manager")
    sla_guarantee: bool = Field(False, description="SLA guarantee")
    white_label: bool = Field(False, description="White label option")

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

        # Alerts - Unlimited email alerts, 24h delay
        email_alerts=True,
        discord_alerts=False,
        telegram_alerts=False,
        webhook_alerts=False,

        # Data Access - Limited
        historical_data_days=7,
        real_time_alerts=False,

        # Support - Community/email only
        support_level="community",

        # Advanced Features - None
        custom_integrations=False,
        dedicated_account_manager=False,
        sla_guarantee=False,
        white_label=False,

        # Export - Basic
        csv_export=True,
        json_export=True,
        api_access=True  # API access enabled for free tier
    ),

    TierName.PRO: SubscriptionTier(
        name=TierName.PRO,
        display_name="Pro",
        price_monthly_usd=Decimal("89.00"),

        # Rate Limits - 50K requests/day
        api_requests_per_day=50000,
        api_requests_per_hour=2083,  # ~2K per hour
        api_requests_per_minute=35,

        # Alerts - Multi-channel, unlimited, real-time
        email_alerts=True,
        discord_alerts=True,
        telegram_alerts=True,
        webhook_alerts=True,  # 2 webhook endpoints

        # Data Access - 90 days historical
        historical_data_days=90,
        real_time_alerts=True,

        # Support - Standard (24h)
        support_level="standard",

        # Advanced Features - None
        custom_integrations=False,
        dedicated_account_manager=False,
        sla_guarantee=False,
        white_label=False,

        # Export - Full
        csv_export=True,
        json_export=True,
        api_access=True
    ),

    TierName.TEAM: SubscriptionTier(
        name=TierName.TEAM,
        display_name="Team",
        price_monthly_usd=Decimal("199.00"),

        # Rate Limits - 100K requests/day (2x Pro)
        api_requests_per_day=100000,
        api_requests_per_hour=4167,  # ~4K per hour
        api_requests_per_minute=70,

        # Alerts - All channels including 5 webhooks
        email_alerts=True,
        discord_alerts=True,
        telegram_alerts=True,
        webhook_alerts=True,  # 5 webhook endpoints

        # Data Access - 1 year historical
        historical_data_days=365,
        real_time_alerts=True,

        # Support - Priority (12h)
        support_level="priority",

        # Advanced Features - Slack, beta features
        custom_integrations=False,
        dedicated_account_manager=False,
        sla_guarantee=False,
        white_label=False,

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

        # Alerts - All channels, 50 webhook endpoints
        email_alerts=True,
        discord_alerts=True,
        telegram_alerts=True,
        webhook_alerts=True,

        # Data Access - 2+ years historical
        historical_data_days=730,  # 2+ years
        real_time_alerts=True,

        # Support - Dedicated
        support_level="dedicated",

        # Advanced Features - All
        custom_integrations=True,
        dedicated_account_manager=True,
        sla_guarantee=True,
        white_label=True,

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
        print(f"  Alert Channels: ", end="")
        channels = []
        if tier.email_alerts:
            channels.append("Email")
        if tier.discord_alerts:
            channels.append("Discord")
        if tier.telegram_alerts:
            channels.append("Telegram")
        if tier.webhook_alerts:
            channels.append("Webhooks")
        print(", ".join(channels))
        print(f"  Historical Data: {tier.historical_data_days} days")
        print(f"  Real-time Alerts: {'Yes' if tier.real_time_alerts else 'No'}")
        print(f"  Support Level: {tier.support_level.title()}")
        if tier.custom_integrations:
            print(f"  Custom Integrations: Yes")
        if tier.dedicated_account_manager:
            print(f"  Account Manager: Yes")
        if tier.sla_guarantee:
            print(f"  SLA Guarantee: Yes")

    print("\n\n=== Tier Comparison ===")
    print(f"FREE -> PRO: {'Upgrade' if is_upgrade(TierName.FREE, TierName.PRO) else 'Not an upgrade'}")
    print(f"TEAM -> PRO: {'Downgrade' if is_downgrade(TierName.TEAM, TierName.PRO) else 'Not a downgrade'}")
    print(f"PRO -> PRO: {'Same tier' if compare_tiers(TierName.PRO, TierName.PRO) == 0 else 'Different'}")

    print("\n✅ Tier definitions ready")
