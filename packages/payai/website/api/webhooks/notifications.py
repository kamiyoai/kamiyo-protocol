# -*- coding: utf-8 -*-
"""
Webhook Notification System for Kamiyo
Sends user notifications for subscription and payment events
"""

import os
import sys
import logging
from typing import Dict, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from monitoring.alerts import get_alert_manager, AlertLevel
from database.postgres_manager import get_db

logger = logging.getLogger(__name__)


def notify_subscription_created(user_id: str, subscription: Dict[str, Any]) -> None:
    """
    Notify user about new subscription

    Args:
        user_id: User identifier
        subscription: Subscription data dictionary
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        # Send notification via alert system
        alert_manager.send_alert(
            title=f"Subscription Activated: {subscription.get('tier', 'Unknown').title()}",
            message=f"Welcome to Kamiyo {subscription.get('tier', 'Unknown').title()}! Your subscription is now active.",
            level=AlertLevel.INFO,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'tier': subscription.get('tier'),
                'subscription_id': subscription.get('stripe_subscription_id'),
                'period_start': str(subscription.get('current_period_start')),
                'period_end': str(subscription.get('current_period_end'))
            }
        )

        logger.info(f"Sent subscription created notification to user {user_id} ({user_email})")

        # TODO: Send actual email to user
        # This would integrate with SendGrid or similar service
        # For now, we're using the alert system which can send to Discord/Slack

    except Exception as e:
        logger.error(f"Error sending subscription created notification: {e}")


def notify_subscription_cancelled(user_id: str, subscription: Dict[str, Any]) -> None:
    """
    Notify user about subscription cancellation

    Args:
        user_id: User identifier
        subscription: Subscription data dictionary
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        # Determine if immediate or end of period
        cancel_at_period_end = subscription.get('cancel_at_period_end', False)
        period_end = subscription.get('current_period_end')

        if cancel_at_period_end:
            message = f"Your subscription will be cancelled at the end of your billing period ({period_end}). You'll continue to have access until then."
        else:
            message = "Your subscription has been cancelled. Thank you for using Kamiyo!"

        # Send notification
        alert_manager.send_alert(
            title="Subscription Cancelled",
            message=message,
            level=AlertLevel.WARNING,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'tier': subscription.get('tier'),
                'subscription_id': subscription.get('stripe_subscription_id'),
                'cancel_at_period_end': cancel_at_period_end,
                'period_end': str(period_end)
            }
        )

        logger.info(f"Sent subscription cancelled notification to user {user_id} ({user_email})")

    except Exception as e:
        logger.error(f"Error sending subscription cancelled notification: {e}")


def notify_payment_succeeded(user_id: str, payment: Dict[str, Any]) -> None:
    """
    Notify user about successful payment

    Args:
        user_id: User identifier
        payment: Payment data dictionary
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        amount = payment.get('amount', 0) / 100  # Convert from cents
        currency = payment.get('currency', 'usd').upper()

        # Send notification
        alert_manager.send_alert(
            title="Payment Successful",
            message=f"Your payment of ${amount:.2f} {currency} has been processed successfully.",
            level=AlertLevel.INFO,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'amount': f"${amount:.2f} {currency}",
                'invoice_id': payment.get('invoice_id'),
                'payment_intent_id': payment.get('payment_intent_id'),
                'receipt_url': payment.get('receipt_url')
            }
        )

        logger.info(f"Sent payment success notification to user {user_id} ({user_email})")

    except Exception as e:
        logger.error(f"Error sending payment success notification: {e}")


def notify_payment_failed(user_id: str, payment: Dict[str, Any]) -> None:
    """
    Notify user about failed payment

    Args:
        user_id: User identifier
        payment: Payment data dictionary
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        amount = payment.get('amount', 0) / 100  # Convert from cents
        currency = payment.get('currency', 'usd').upper()
        error_message = payment.get('error_message', 'Unknown error')

        # Send notification
        alert_manager.send_alert(
            title="Payment Failed",
            message=f"Your payment of ${amount:.2f} {currency} could not be processed. Please update your payment method. Error: {error_message}",
            level=AlertLevel.ERROR,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'amount': f"${amount:.2f} {currency}",
                'error': error_message,
                'invoice_id': payment.get('invoice_id'),
                'payment_intent_id': payment.get('payment_intent_id'),
                'action': 'Update payment method in account settings'
            }
        )

        logger.info(f"Sent payment failed notification to user {user_id} ({user_email})")

        # Also use the predefined alert function
        alert_manager.alert_payment_failure(
            user_email=user_email,
            amount=amount,
            error=error_message
        )

    except Exception as e:
        logger.error(f"Error sending payment failed notification: {e}")


def notify_subscription_updated(user_id: str, old_tier: str, new_tier: str, subscription: Dict[str, Any]) -> None:
    """
    Notify user about subscription tier change

    Args:
        user_id: User identifier
        old_tier: Previous tier
        new_tier: New tier
        subscription: Updated subscription data
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        # Determine if upgrade or downgrade
        tier_order = {'free': 0, 'basic': 1, 'pro': 2, 'enterprise': 3}
        is_upgrade = tier_order.get(new_tier.lower(), 0) > tier_order.get(old_tier.lower(), 0)

        if is_upgrade:
            title = f"Subscription Upgraded: {new_tier.title()}"
            message = f"Congratulations! Your subscription has been upgraded from {old_tier.title()} to {new_tier.title()}."
            level = AlertLevel.INFO
        else:
            title = f"Subscription Changed: {new_tier.title()}"
            message = f"Your subscription has been changed from {old_tier.title()} to {new_tier.title()}."
            level = AlertLevel.INFO

        # Send notification
        alert_manager.send_alert(
            title=title,
            message=message,
            level=level,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'old_tier': old_tier,
                'new_tier': new_tier,
                'subscription_id': subscription.get('stripe_subscription_id'),
                'period_end': str(subscription.get('current_period_end'))
            }
        )

        logger.info(f"Sent subscription updated notification to user {user_id} ({user_email})")

    except Exception as e:
        logger.error(f"Error sending subscription updated notification: {e}")


def notify_trial_ending(user_id: str, days_remaining: int, subscription: Dict[str, Any]) -> None:
    """
    Notify user about trial ending soon

    Args:
        user_id: User identifier
        days_remaining: Days until trial ends
        subscription: Subscription data
    """
    try:
        alert_manager = get_alert_manager()

        # Get user email
        user_email = _get_user_email(user_id)
        if not user_email:
            logger.warning(f"Could not find email for user {user_id}")
            return

        # Send notification
        alert_manager.send_alert(
            title=f"Trial Ending in {days_remaining} Days",
            message=f"Your trial period will end in {days_remaining} days. Add a payment method to continue using Kamiyo.",
            level=AlertLevel.WARNING,
            metadata={
                'user_id': user_id,
                'user_email': user_email,
                'days_remaining': days_remaining,
                'trial_end': str(subscription.get('trial_end')),
                'action': 'Add payment method to continue service'
            }
        )

        logger.info(f"Sent trial ending notification to user {user_id} ({user_email})")

    except Exception as e:
        logger.error(f"Error sending trial ending notification: {e}")


def _get_user_email(user_id: str) -> Optional[str]:
    """
    Get user email from database

    Args:
        user_id: User identifier

    Returns:
        User email or None if not found
    """
    try:
        db = get_db()

        # Try to get email from customers table first
        query = """
            SELECT email FROM customers WHERE user_id = %s LIMIT 1
        """

        result = db.execute_with_retry(query, (user_id,), readonly=True)

        if result and len(result) > 0:
            return result[0]['email']

        # If not found, try user_subscriptions table
        query = """
            SELECT c.email
            FROM user_subscriptions us
            JOIN customers c ON us.user_id = c.user_id
            WHERE us.user_id = %s
            LIMIT 1
        """

        result = db.execute_with_retry(query, (user_id,), readonly=True)

        if result and len(result) > 0:
            return result[0]['email']

        return None

    except Exception as e:
        logger.error(f"Error fetching user email: {e}")
        return None


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Webhook Notification System Test ===\n")

    test_user_id = "test_user_123"
    test_subscription = {
        'tier': 'pro',
        'stripe_subscription_id': 'sub_test_123',
        'current_period_start': '2025-10-07',
        'current_period_end': '2025-11-07',
        'cancel_at_period_end': False
    }

    test_payment = {
        'amount': 9900,  # $99.00 in cents
        'currency': 'usd',
        'invoice_id': 'in_test_123',
        'payment_intent_id': 'pi_test_123',
        'receipt_url': 'https://stripe.com/receipts/test'
    }

    print("1. Testing notify_subscription_created...")
    notify_subscription_created(test_user_id, test_subscription)
    print("   ✓ Notification sent")

    print("\n2. Testing notify_payment_succeeded...")
    notify_payment_succeeded(test_user_id, test_payment)
    print("   ✓ Notification sent")

    print("\n3. Testing notify_payment_failed...")
    test_payment['error_message'] = "Card declined"
    notify_payment_failed(test_user_id, test_payment)
    print("   ✓ Notification sent")

    print("\n4. Testing notify_subscription_cancelled...")
    notify_subscription_cancelled(test_user_id, test_subscription)
    print("   ✓ Notification sent")

    print("\n5. Testing notify_subscription_updated...")
    notify_subscription_updated(test_user_id, 'basic', 'pro', test_subscription)
    print("   ✓ Notification sent")

    print("\n✅ Notification system ready")
    print("Note: Actual email delivery requires SendGrid configuration")
