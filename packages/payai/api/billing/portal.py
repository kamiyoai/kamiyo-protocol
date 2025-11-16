# -*- coding: utf-8 -*-
"""
Stripe Customer Portal Integration for Kamiyo
Allows users to manage billing, payment methods, and view invoices
"""

import os
import sys
import logging
from typing import Dict, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import stripe
from config.stripe_config import get_stripe_config
from monitoring.prometheus_metrics import api_requests_total
from monitoring.alerts import get_alert_manager, AlertLevel

logger = logging.getLogger(__name__)


class CustomerPortalManager:
    """
    Manages Stripe Customer Portal sessions

    Features:
    - Generate secure portal session URLs
    - Configure portal features (payment methods, subscriptions, invoices)
    - Track portal usage metrics
    - Handle errors gracefully
    """

    def __init__(self):
        """Initialize customer portal manager"""

        # Load Stripe configuration
        self.config = get_stripe_config()

        # Set Stripe API key
        if self.config.secret_key:
            stripe.api_key = self.config.secret_key
            logger.info("Customer Portal Manager initialized")
        else:
            logger.error("Stripe API key not configured")
            raise ValueError("STRIPE_SECRET_KEY environment variable required")

        # Get alert manager
        self.alert_manager = get_alert_manager()

    def create_portal_session(
        self,
        customer_id: str,
        return_url: str,
        configuration: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a Stripe Customer Portal session

        Args:
            customer_id: Stripe customer ID (not database ID)
            return_url: URL to return to after portal session
            configuration: Optional portal configuration ID

        Returns:
            Dict with session URL and expiration info
            {
                'url': 'https://billing.stripe.com/session/...',
                'id': 'bps_...',
                'customer': 'cus_...',
                'expires_at': 1234567890,
                'return_url': 'https://...'
            }

        Raises:
            stripe.error.StripeError: If Stripe API call fails
            ValueError: If customer_id or return_url is invalid
        """

        if not customer_id:
            raise ValueError("customer_id is required")

        if not return_url:
            raise ValueError("return_url is required")

        try:
            logger.info(f"Creating Customer Portal session for customer {customer_id}")

            # Create portal session
            params = {
                'customer': customer_id,
                'return_url': return_url
            }

            # Add configuration if provided
            if configuration:
                params['configuration'] = configuration

            session = stripe.billing_portal.Session.create(**params)

            logger.info(f"Portal session created: {session.id}")

            # Track metrics
            api_requests_total.labels(
                method='POST',
                endpoint='/billing/portal',
                status=200
            ).inc()

            return {
                'url': session.url,
                'id': session.id,
                'customer': session.customer,
                'expires_at': session.expires_at,
                'return_url': session.return_url
            }

        except stripe.error.InvalidRequestError as e:
            logger.error(f"Invalid request creating portal session: {e}")
            self.alert_manager.send_alert(
                title="Customer Portal Session Failed",
                message=f"Invalid request for customer {customer_id}: {str(e)}",
                level=AlertLevel.WARNING,
                metadata={'customer_id': customer_id, 'error': str(e)}
            )
            raise

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating portal session: {e}")
            self.alert_manager.send_alert(
                title="Customer Portal Session Failed",
                message=f"Stripe error for customer {customer_id}: {str(e)}",
                level=AlertLevel.ERROR,
                metadata={'customer_id': customer_id, 'error': str(e)}
            )
            raise

        except Exception as e:
            logger.error(f"Unexpected error creating portal session: {e}")
            self.alert_manager.send_alert(
                title="Customer Portal Session Failed",
                message=f"Unexpected error for customer {customer_id}: {str(e)}",
                level=AlertLevel.ERROR,
                metadata={'customer_id': customer_id, 'error': str(e)}
            )
            raise

    def get_portal_configuration(self) -> Dict[str, Any]:
        """
        Get default portal configuration settings

        Returns:
            Dict with portal configuration details
        """

        return {
            'features': {
                'customer_update': {
                    'allowed_updates': ['email', 'address', 'shipping', 'phone', 'tax_id'],
                    'enabled': True
                },
                'invoice_history': {
                    'enabled': True
                },
                'payment_method_update': {
                    'enabled': True
                },
                'subscription_cancel': {
                    'enabled': True,
                    'mode': 'at_period_end',
                    'cancellation_reason': {
                        'enabled': True,
                        'options': [
                            'too_expensive',
                            'missing_features',
                            'switched_service',
                            'unused',
                            'customer_service',
                            'too_complex',
                            'low_quality',
                            'other'
                        ]
                    }
                },
                'subscription_pause': {
                    'enabled': False
                },
                'subscription_update': {
                    'enabled': True,
                    'default_allowed_updates': ['price', 'quantity', 'promotion_code'],
                    'proration_behavior': 'create_prorations'
                }
            },
            'business_profile': {
                'headline': 'Manage Your Kamiyo Subscription',
                'privacy_policy_url': os.getenv('PRIVACY_POLICY_URL', 'https://kamiyo.ai/privacy'),
                'terms_of_service_url': os.getenv('TERMS_URL', 'https://kamiyo.ai/terms')
            }
        }


# Singleton instance
_portal_manager = None


def get_portal_manager() -> CustomerPortalManager:
    """
    Get Customer Portal Manager singleton

    Returns:
        CustomerPortalManager instance
    """

    global _portal_manager
    if _portal_manager is None:
        _portal_manager = CustomerPortalManager()
    return _portal_manager


def create_portal_session(customer_id: str, return_url: str) -> Dict[str, Any]:
    """
    Convenience function to create a portal session

    Args:
        customer_id: Stripe customer ID
        return_url: URL to return to after portal session

    Returns:
        Portal session data dict
    """

    manager = get_portal_manager()
    return manager.create_portal_session(customer_id, return_url)


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Customer Portal Manager Test ===\n")

    try:
        manager = get_portal_manager()
        print("✓ Portal manager initialized")

        # Print configuration
        config = manager.get_portal_configuration()
        print("\n✓ Portal Configuration:")
        print(f"  - Customer Updates: {config['features']['customer_update']['enabled']}")
        print(f"  - Invoice History: {config['features']['invoice_history']['enabled']}")
        print(f"  - Payment Methods: {config['features']['payment_method_update']['enabled']}")
        print(f"  - Subscription Cancel: {config['features']['subscription_cancel']['enabled']}")
        print(f"  - Subscription Update: {config['features']['subscription_update']['enabled']}")

        print("\n✅ Customer Portal Manager ready")
        print("\nTo test portal session creation:")
        print("  customer_id = 'cus_...'  # Your Stripe customer ID")
        print("  return_url = 'https://app.kamiyo.ai/billing'")
        print("  session = create_portal_session(customer_id, return_url)")
        print("  print(session['url'])")

    except Exception as e:
        print(f"\n❌ Initialization error: {e}")
        print("Set STRIPE_SECRET_KEY environment variable and try again")
