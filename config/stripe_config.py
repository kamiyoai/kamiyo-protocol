# -*- coding: utf-8 -*-
"""
Stripe Configuration for Kamiyo
Manages Stripe API keys, pricing plans, and webhook configuration
"""

import os
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class StripeConfig:
    """
    Centralized Stripe configuration

    Loads and validates Stripe credentials from environment variables
    Manages pricing plan configuration
    """

    def __init__(self):
        """Initialize Stripe configuration from environment"""

        # Load API keys
        self.secret_key = os.getenv('STRIPE_SECRET_KEY')
        self.publishable_key = os.getenv('STRIPE_PUBLISHABLE_KEY')
        self.webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

        # Validate required keys
        if not self.secret_key:
            logger.warning("STRIPE_SECRET_KEY not set - payment processing disabled")

        if not self.publishable_key:
            logger.warning("STRIPE_PUBLISHABLE_KEY not set")

        # Determine if test mode (keys start with sk_test_ or pk_test_)
        self.is_test_mode = self._check_test_mode()

        # API version (Stripe recommends pinning version)
        # Updated to latest stable version (2024-10-28.acacia)
        self.api_version = '2024-10-28'

        # Webhook endpoint URL
        self.webhook_endpoint = os.getenv(
            'STRIPE_WEBHOOK_ENDPOINT',
            'https://api.kamiyo.ai/api/v1/payments/webhook'
        )

        # Log configuration status
        self._log_configuration()

    def _check_test_mode(self) -> bool:
        """Check if running in test mode based on API keys"""

        if self.secret_key and self.secret_key.startswith('sk_test_'):
            return True
        if self.publishable_key and self.publishable_key.startswith('pk_test_'):
            return True
        return False

    def _log_configuration(self):
        """Log configuration status for debugging"""

        mode = "TEST" if self.is_test_mode else "LIVE"

        logger.info(f"Stripe configuration loaded - Mode: {mode}")
        logger.info(f"Secret key: {'✓' if self.secret_key else '✗'}")
        logger.info(f"Publishable key: {'✓' if self.publishable_key else '✗'}")
        logger.info(f"Webhook secret: {'✓' if self.webhook_secret else '✗'}")
        logger.info(f"API version: {self.api_version}")

        if self.is_test_mode:
            logger.warning("⚠️  Running in TEST mode - real payments will not be processed")

    def validate(self) -> bool:
        """
        Validate that all required configuration is present

        Returns:
            True if configuration is valid, False otherwise
        """

        if not self.secret_key:
            logger.error("Missing STRIPE_SECRET_KEY")
            return False

        if not self.publishable_key:
            logger.error("Missing STRIPE_PUBLISHABLE_KEY")
            return False

        # Webhook secret is optional for now (required for Day 8)
        if not self.webhook_secret:
            logger.warning("STRIPE_WEBHOOK_SECRET not set - webhooks disabled")

        return True

    @property
    def is_enabled(self) -> bool:
        """Check if Stripe is properly configured and enabled"""
        return bool(self.secret_key and self.publishable_key)

    def get_plan_config(self, tier: str) -> Optional[Dict]:
        """
        Get pricing plan configuration for a tier

        Args:
            tier: Subscription tier (free, basic, pro, enterprise)

        Returns:
            Plan configuration dict or None if not found
        """

        plans = {
            'free': {
                'name': 'Free',
                'price': 0,
                'currency': 'usd',
                'interval': 'month',
                'alerts_per_month': 'unlimited',
                'rate_limit_per_day': 1000,  # 1K API requests/day
                'features': [
                    'Unlimited email alerts',
                    '24-hour delayed data',
                    '1K API calls/day',
                    'Public dashboard access',
                    '7 days historical data',
                    'Community support'
                ]
            },
            'pro': {
                'name': 'Pro',
                'price': 89,  # $89/month
                'currency': 'usd',
                'interval': 'month',
                'price_id': os.getenv('STRIPE_PRICE_PRO'),
                'rate_limit_per_day': 50000,  # 50K API requests/day
                'webhook_limit': 2,
                'features': [
                    'Unlimited real-time alerts (<5 min)',
                    '50K API requests/day',
                    'WebSocket feed',
                    'Multi-channel alerts (Discord/Telegram/Email)',
                    '90 days historical data',
                    'Feature extraction API',
                    '2 webhook endpoints',
                    'Standard support (email, 24h)'
                ]
            },
            'team': {
                'name': 'Team',
                'price': 199,  # $199/month
                'currency': 'usd',
                'interval': 'month',
                'price_id': os.getenv('STRIPE_PRICE_TEAM'),
                'rate_limit_per_day': 100000,  # 100K API requests/day (2x Pro)
                'webhook_limit': 5,
                'features': [
                    'Everything in Pro',
                    '100K API requests/day (2x Pro)',
                    '5 webhook endpoints',
                    'Slack integration',
                    '1 year historical data',
                    'Advanced rate limits (500 req/hour)',
                    'Beta features: Fork detection, pattern clustering, advanced analytics',
                    'Custom alert filters (complex queries)',
                    'API burst allowance',
                    'Priority support (email + Discord, 12h)'
                ]
            },
            'enterprise': {
                'name': 'Enterprise',
                'price': 499,  # $499/month (starting price)
                'currency': 'usd',
                'interval': 'month',
                'price_id': os.getenv('STRIPE_PRICE_ENTERPRISE'),
                'rate_limit_per_day': -1,  # Unlimited
                'webhook_limit': 50,
                'features': [
                    'Everything in Team',
                    'Unlimited API calls',
                    '50 webhook endpoints',
                    'Protocol watchlists (monitor specific contracts)',
                    'Fork graph visualization (beta)',
                    '2+ years historical data',
                    'White-label options',
                    'Custom integrations',
                    'Bulk data exports',
                    'SLA guarantee (99.9% uptime)',
                    'Dedicated support manager (4h response)'
                ]
            }
        }

        return plans.get(tier.lower())

    def get_all_plans(self) -> Dict[str, Dict]:
        """
        Get all available pricing plans

        Returns:
            Dict mapping tier names to plan configurations
        """

        return {
            'free': self.get_plan_config('free'),
            'pro': self.get_plan_config('pro'),
            'team': self.get_plan_config('team'),
            'enterprise': self.get_plan_config('enterprise')
        }


# Singleton instance
_stripe_config = None


def get_stripe_config() -> StripeConfig:
    """
    Get Stripe configuration singleton

    Returns:
        StripeConfig instance
    """

    global _stripe_config
    if _stripe_config is None:
        _stripe_config = StripeConfig()
    return _stripe_config


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Stripe Configuration Test ===\n")

    # Test without environment variables
    config = get_stripe_config()

    print(f"\n1. Configuration Status:")
    print(f"   Enabled: {config.is_enabled}")
    print(f"   Test Mode: {config.is_test_mode}")
    print(f"   Valid: {config.validate()}")

    print(f"\n2. Available Plans:")
    plans = config.get_all_plans()
    for tier, plan in plans.items():
        print(f"   {tier.upper()}: ${plan['price']}/{plan['interval']}")

    print(f"\n3. Pro Plan Features:")
    pro_plan = config.get_plan_config('pro')
    for feature in pro_plan['features']:
        print(f"   - {feature}")

    print(f"\n4. Environment Variables Needed:")
    print(f"   STRIPE_SECRET_KEY={'✓' if config.secret_key else '✗ (required)'}")
    print(f"   STRIPE_PUBLISHABLE_KEY={'✓' if config.publishable_key else '✗ (required)'}")
    print(f"   STRIPE_WEBHOOK_SECRET={'✓' if config.webhook_secret else '○ (optional)'}")
    print(f"   STRIPE_PRICE_BASIC={'✓' if os.getenv('STRIPE_PRICE_BASIC') else '○ (optional)'}")
    print(f"   STRIPE_PRICE_PRO={'✓' if os.getenv('STRIPE_PRICE_PRO') else '○ (optional)'}")
    print(f"   STRIPE_PRICE_ENTERPRISE={'✓' if os.getenv('STRIPE_PRICE_ENTERPRISE') else '○ (optional)'}")

    print("\n✅ Stripe configuration ready")
