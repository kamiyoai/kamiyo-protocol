# -*- coding: utf-8 -*-
"""
Stripe Webhook Event Processors for Kamiyo
Individual processors for each Stripe webhook event type
"""

import os
import sys
import logging
from typing import Dict, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database.postgres_manager import get_db
from monitoring.prometheus_metrics import subscriptions_total, payments_total, revenue_total
from api.webhooks.notifications import (
    notify_subscription_created,
    notify_subscription_cancelled,
    notify_subscription_updated,
    notify_payment_succeeded,
    notify_payment_failed
)

logger = logging.getLogger(__name__)


# ==========================================
# CUSTOMER EVENT PROCESSORS
# ==========================================

async def process_customer_created(event: Dict[str, Any]) -> None:
    """
    Process customer.created webhook event

    Args:
        event: Stripe event object
    """
    try:
        customer = event['data']['object']
        customer_id = customer['id']

        logger.info(f"Processing customer.created: {customer_id}")

        db = get_db()

        # Check if customer already exists
        query = "SELECT id FROM customers WHERE stripe_customer_id = %s"
        result = db.execute_with_retry(query, (customer_id,), readonly=True)

        if result:
            logger.info(f"Customer {customer_id} already exists - updating")

            # Update existing customer
            update_query = """
                UPDATE customers
                SET email = %s,
                    name = %s,
                    metadata = %s,
                    last_webhook_event_id = %s,
                    last_webhook_updated_at = CURRENT_TIMESTAMP
                WHERE stripe_customer_id = %s
            """

            params = (
                customer.get('email'),
                customer.get('name'),
                customer.get('metadata'),
                event['id'],
                customer_id
            )

            db.execute_with_retry(update_query, params, readonly=False)

        else:
            logger.info(f"Creating new customer record for {customer_id}")

            # Note: Normally customers are created via our API before Stripe
            # This handler is for edge cases where Stripe creates the customer first
            # We'll need to match to a user_id later

            insert_query = """
                INSERT INTO customers (
                    stripe_customer_id, user_id, email, name, metadata,
                    last_webhook_event_id, last_webhook_updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """

            # Extract user_id from metadata if available
            user_id = customer.get('metadata', {}).get('user_id')

            params = (
                customer_id,
                user_id,
                customer.get('email'),
                customer.get('name'),
                customer.get('metadata'),
                event['id']
            )

            db.execute_with_retry(insert_query, params, readonly=False)

        logger.info(f"Successfully processed customer.created for {customer_id}")

    except Exception as e:
        logger.error(f"Error processing customer.created: {e}")
        raise


async def process_customer_updated(event: Dict[str, Any]) -> None:
    """
    Process customer.updated webhook event

    Args:
        event: Stripe event object
    """
    try:
        customer = event['data']['object']
        customer_id = customer['id']

        logger.info(f"Processing customer.updated: {customer_id}")

        db = get_db()

        # Update customer record
        query = """
            UPDATE customers
            SET email = %s,
                name = %s,
                metadata = %s,
                last_webhook_event_id = %s,
                last_webhook_updated_at = CURRENT_TIMESTAMP
            WHERE stripe_customer_id = %s
        """

        params = (
            customer.get('email'),
            customer.get('name'),
            customer.get('metadata'),
            event['id'],
            customer_id
        )

        result = db.execute_with_retry(query, params, readonly=False)

        if not result:
            logger.warning(f"Customer {customer_id} not found in database")
            # Could call process_customer_created here as fallback

        logger.info(f"Successfully processed customer.updated for {customer_id}")

    except Exception as e:
        logger.error(f"Error processing customer.updated: {e}")
        raise


async def process_customer_deleted(event: Dict[str, Any]) -> None:
    """
    Process customer.deleted webhook event

    Args:
        event: Stripe event object
    """
    try:
        customer = event['data']['object']
        customer_id = customer['id']

        logger.info(f"Processing customer.deleted: {customer_id}")

        db = get_db()

        # Soft delete: mark as deleted but keep record
        query = """
            UPDATE customers
            SET deleted_at = CURRENT_TIMESTAMP,
                last_webhook_event_id = %s,
                last_webhook_updated_at = CURRENT_TIMESTAMP
            WHERE stripe_customer_id = %s
        """

        params = (event['id'], customer_id)

        db.execute_with_retry(query, params, readonly=False)

        logger.info(f"Successfully processed customer.deleted for {customer_id}")

    except Exception as e:
        logger.error(f"Error processing customer.deleted: {e}")
        raise


# ==========================================
# SUBSCRIPTION EVENT PROCESSORS
# ==========================================

async def process_subscription_created(event: Dict[str, Any]) -> None:
    """
    Process customer.subscription.created webhook event

    Args:
        event: Stripe event object
    """
    try:
        subscription = event['data']['object']
        subscription_id = subscription['id']

        logger.info(f"Processing subscription.created: {subscription_id}")

        db = get_db()

        # Get customer from database
        customer_query = "SELECT id, user_id, email FROM customers WHERE stripe_customer_id = %s"
        customer_result = db.execute_with_retry(customer_query, (subscription['customer'],), readonly=True)

        if not customer_result:
            logger.error(f"Customer {subscription['customer']} not found for subscription {subscription_id}")
            raise ValueError(f"Customer not found: {subscription['customer']}")

        customer = customer_result[0]
        customer_db_id = customer['id']
        user_id = customer['user_id']

        # Extract tier from metadata
        tier = subscription.get('metadata', {}).get('tier', 'basic')

        # Check if subscription already exists
        check_query = "SELECT id FROM subscriptions WHERE stripe_subscription_id = %s"
        existing = db.execute_with_retry(check_query, (subscription_id,), readonly=True)

        if existing:
            logger.info(f"Subscription {subscription_id} already exists - updating")
            # Update existing subscription
            update_query = """
                UPDATE subscriptions
                SET status = %s,
                    tier = %s,
                    current_period_start = %s,
                    current_period_end = %s,
                    cancel_at_period_end = %s,
                    last_webhook_event_id = %s,
                    last_webhook_updated_at = CURRENT_TIMESTAMP
                WHERE stripe_subscription_id = %s
            """

            params = (
                subscription['status'],
                tier,
                datetime.fromtimestamp(subscription['current_period_start']),
                datetime.fromtimestamp(subscription['current_period_end']),
                subscription.get('cancel_at_period_end', False),
                event['id'],
                subscription_id
            )

            db.execute_with_retry(update_query, params, readonly=False)

        else:
            # Create new subscription record
            insert_query = """
                INSERT INTO subscriptions (
                    stripe_subscription_id, customer_id, status, tier,
                    current_period_start, current_period_end, cancel_at_period_end,
                    metadata, last_webhook_event_id, last_webhook_updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """

            params = (
                subscription_id,
                customer_db_id,
                subscription['status'],
                tier,
                datetime.fromtimestamp(subscription['current_period_start']),
                datetime.fromtimestamp(subscription['current_period_end']),
                subscription.get('cancel_at_period_end', False),
                subscription.get('metadata'),
                event['id']
            )

            db.execute_with_retry(insert_query, params, readonly=False)

        # Track metrics
        subscriptions_total.labels(tier=tier, event='created').inc()

        # Send notification to user
        if user_id:
            subscription_data = {
                'tier': tier,
                'stripe_subscription_id': subscription_id,
                'current_period_start': datetime.fromtimestamp(subscription['current_period_start']),
                'current_period_end': datetime.fromtimestamp(subscription['current_period_end']),
                'cancel_at_period_end': subscription.get('cancel_at_period_end', False)
            }
            notify_subscription_created(user_id, subscription_data)

        # Generate MCP token for subscription (if not already created by checkout)
        try:
            from api.webhooks.mcp_processors import process_mcp_subscription_events
            await process_mcp_subscription_events(event)
        except Exception as e:
            logger.error(f"Error in MCP subscription processing: {e}")
            # Don't fail the main webhook - MCP is supplementary

        logger.info(f"Successfully processed subscription.created for {subscription_id}")

    except Exception as e:
        logger.error(f"Error processing subscription.created: {e}")
        raise


async def process_subscription_updated(event: Dict[str, Any]) -> None:
    """
    Process customer.subscription.updated webhook event

    Args:
        event: Stripe event object
    """
    try:
        subscription = event['data']['object']
        previous_attributes = event['data'].get('previous_attributes', {})
        subscription_id = subscription['id']

        logger.info(f"Processing subscription.updated: {subscription_id}")

        db = get_db()

        # Get existing subscription
        query = """
            SELECT s.id, s.tier, c.user_id
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.id
            WHERE s.stripe_subscription_id = %s
        """
        result = db.execute_with_retry(query, (subscription_id,), readonly=True)

        if not result:
            logger.warning(f"Subscription {subscription_id} not found - creating new record")
            await process_subscription_created(event)
            return

        old_subscription = result[0]
        old_tier = old_subscription['tier']
        user_id = old_subscription['user_id']

        # Extract new tier
        new_tier = subscription.get('metadata', {}).get('tier', old_tier)

        # Update subscription record
        update_query = """
            UPDATE subscriptions
            SET status = %s,
                tier = %s,
                current_period_start = %s,
                current_period_end = %s,
                cancel_at_period_end = %s,
                metadata = %s,
                last_webhook_event_id = %s,
                last_webhook_updated_at = CURRENT_TIMESTAMP
            WHERE stripe_subscription_id = %s
        """

        params = (
            subscription['status'],
            new_tier,
            datetime.fromtimestamp(subscription['current_period_start']),
            datetime.fromtimestamp(subscription['current_period_end']),
            subscription.get('cancel_at_period_end', False),
            subscription.get('metadata'),
            event['id'],
            subscription_id
        )

        db.execute_with_retry(update_query, params, readonly=False)

        # Track metrics if tier changed
        if new_tier != old_tier:
            subscriptions_total.labels(tier=new_tier, event='upgraded').inc()

            # Send notification
            if user_id:
                subscription_data = {
                    'tier': new_tier,
                    'stripe_subscription_id': subscription_id,
                    'current_period_end': datetime.fromtimestamp(subscription['current_period_end']),
                    'cancel_at_period_end': subscription.get('cancel_at_period_end', False)
                }
                notify_subscription_updated(user_id, old_tier, new_tier, subscription_data)

        # Check if subscription was cancelled
        if subscription.get('cancel_at_period_end') and not previous_attributes.get('cancel_at_period_end'):
            if user_id:
                subscription_data = {
                    'tier': new_tier,
                    'stripe_subscription_id': subscription_id,
                    'current_period_end': datetime.fromtimestamp(subscription['current_period_end']),
                    'cancel_at_period_end': True
                }
                notify_subscription_cancelled(user_id, subscription_data)

        # Update MCP token tier if changed
        try:
            from api.webhooks.mcp_processors import process_mcp_subscription_events
            await process_mcp_subscription_events(event)
        except Exception as e:
            logger.error(f"Error in MCP subscription processing: {e}")
            # Don't fail the main webhook

        logger.info(f"Successfully processed subscription.updated for {subscription_id}")

    except Exception as e:
        logger.error(f"Error processing subscription.updated: {e}")
        raise


async def process_subscription_deleted(event: Dict[str, Any]) -> None:
    """
    Process customer.subscription.deleted webhook event

    Args:
        event: Stripe event object
    """
    try:
        subscription = event['data']['object']
        subscription_id = subscription['id']

        logger.info(f"Processing subscription.deleted: {subscription_id}")

        db = get_db()

        # Get subscription and user info
        query = """
            SELECT s.id, s.tier, c.user_id
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.id
            WHERE s.stripe_subscription_id = %s
        """
        result = db.execute_with_retry(query, (subscription_id,), readonly=True)

        if result:
            old_subscription = result[0]
            tier = old_subscription['tier']
            user_id = old_subscription['user_id']

            # Update subscription status
            update_query = """
                UPDATE subscriptions
                SET status = 'canceled',
                    canceled_at = CURRENT_TIMESTAMP,
                    cancel_at_period_end = TRUE,
                    last_webhook_event_id = %s,
                    last_webhook_updated_at = CURRENT_TIMESTAMP
                WHERE stripe_subscription_id = %s
            """

            params = (event['id'], subscription_id)
            db.execute_with_retry(update_query, params, readonly=False)

            # Track metrics
            subscriptions_total.labels(tier=tier, event='cancelled').inc()

            # Send notification
            if user_id:
                subscription_data = {
                    'tier': tier,
                    'stripe_subscription_id': subscription_id,
                    'cancel_at_period_end': True
                }
                notify_subscription_cancelled(user_id, subscription_data)

        # Revoke MCP token access
        try:
            from api.webhooks.mcp_processors import process_mcp_subscription_events
            await process_mcp_subscription_events(event)
        except Exception as e:
            logger.error(f"Error in MCP subscription processing: {e}")
            # Don't fail the main webhook

        logger.info(f"Successfully processed subscription.deleted for {subscription_id}")

    except Exception as e:
        logger.error(f"Error processing subscription.deleted: {e}")
        raise


# ==========================================
# PAYMENT EVENT PROCESSORS
# ==========================================

async def process_payment_succeeded(event: Dict[str, Any]) -> None:
    """
    Process invoice.payment_succeeded webhook event

    Args:
        event: Stripe event object
    """
    try:
        invoice = event['data']['object']
        invoice_id = invoice['id']
        customer_id = invoice['customer']

        logger.info(f"Processing payment_succeeded: {invoice_id}")

        db = get_db()

        # Get customer and user info
        query = "SELECT id, user_id, email FROM customers WHERE stripe_customer_id = %s"
        result = db.execute_with_retry(query, (customer_id,), readonly=True)

        if not result:
            logger.warning(f"Customer {customer_id} not found for invoice {invoice_id}")
            return

        customer = result[0]
        user_id = customer['user_id']

        # Get subscription tier for revenue tracking
        subscription_id = invoice.get('subscription')
        tier = 'basic'  # Default

        if subscription_id:
            sub_query = "SELECT tier FROM subscriptions WHERE stripe_subscription_id = %s"
            sub_result = db.execute_with_retry(sub_query, (subscription_id,), readonly=True)
            if sub_result:
                tier = sub_result[0]['tier']

        # Track metrics
        amount = invoice.get('amount_paid', 0) / 100  # Convert from cents
        payments_total.labels(status='succeeded').inc()
        revenue_total.labels(tier=tier).inc(amount)

        # Send notification to user
        if user_id:
            payment_data = {
                'amount': invoice.get('amount_paid', 0),
                'currency': invoice.get('currency', 'usd'),
                'invoice_id': invoice_id,
                'payment_intent_id': invoice.get('payment_intent'),
                'receipt_url': invoice.get('hosted_invoice_url')
            }
            notify_payment_succeeded(user_id, payment_data)

        logger.info(f"Successfully processed payment_succeeded for {invoice_id} (${amount:.2f})")

    except Exception as e:
        logger.error(f"Error processing payment_succeeded: {e}")
        raise


async def process_payment_failed(event: Dict[str, Any]) -> None:
    """
    Process invoice.payment_failed webhook event

    Args:
        event: Stripe event object
    """
    try:
        invoice = event['data']['object']
        invoice_id = invoice['id']
        customer_id = invoice['customer']

        logger.info(f"Processing payment_failed: {invoice_id}")

        db = get_db()

        # Get customer and user info
        query = "SELECT id, user_id, email FROM customers WHERE stripe_customer_id = %s"
        result = db.execute_with_retry(query, (customer_id,), readonly=True)

        if not result:
            logger.warning(f"Customer {customer_id} not found for invoice {invoice_id}")
            return

        customer = result[0]
        user_id = customer['user_id']

        # Track metrics
        payments_total.labels(status='failed').inc()

        # Get error message
        payment_intent_id = invoice.get('payment_intent')
        error_message = "Payment failed"

        # Could fetch payment_intent for more details if needed
        # For now, use last_payment_error from invoice
        if invoice.get('last_payment_error'):
            error_message = invoice['last_payment_error'].get('message', error_message)

        # Send notification to user
        if user_id:
            payment_data = {
                'amount': invoice.get('amount_due', 0),
                'currency': invoice.get('currency', 'usd'),
                'invoice_id': invoice_id,
                'payment_intent_id': payment_intent_id,
                'error_message': error_message
            }
            notify_payment_failed(user_id, payment_data)

        logger.info(f"Successfully processed payment_failed for {invoice_id}")

    except Exception as e:
        logger.error(f"Error processing payment_failed: {e}")
        raise


# ==========================================
# CHECKOUT EVENT PROCESSORS
# ==========================================

async def process_checkout_session_completed(event: Dict[str, Any]) -> None:
    """
    Process checkout.session.completed webhook event

    This is the PRIMARY event for MCP token generation.
    When a user completes checkout, this handler:
    1. Creates/updates customer record
    2. Waits for subscription to be created (async by Stripe)
    3. Generates MCP token via mcp_processors
    4. TODO: Sends welcome email with token and setup instructions

    Args:
        event: Stripe checkout.session.completed event
    """
    try:
        session = event['data']['object']
        session_id = session['id']
        customer_id = session['customer']
        subscription_id = session.get('subscription')

        logger.info(f"Processing checkout.session.completed: {session_id}")

        db = get_db()

        # Extract customer email and metadata
        customer_email = session.get('customer_email') or session.get('customer_details', {}).get('email')
        tier = session.get('metadata', {}).get('tier', 'personal')

        logger.info(f"Checkout completed - Email: {customer_email}, Tier: {tier}, Subscription: {subscription_id}")

        # Get or create customer record
        customer_query = "SELECT id, user_id, email FROM customers WHERE stripe_customer_id = %s"
        customer_result = db.execute_with_retry(customer_query, (customer_id,), readonly=True)

        if not customer_result:
            # Create customer record
            logger.info(f"Creating customer record for {customer_id} ({customer_email})")

            # Generate user_id (UUID) for new customer
            import uuid
            user_id = str(uuid.uuid4())

            insert_customer = """
                INSERT INTO customers (
                    stripe_customer_id, user_id, email, name, metadata,
                    last_webhook_event_id, last_webhook_updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                RETURNING id, user_id, email
            """

            customer_result = db.execute_with_retry(
                insert_customer,
                (
                    customer_id,
                    user_id,
                    customer_email,
                    session.get('customer_details', {}).get('name'),
                    {'tier': tier, 'source': 'checkout'},
                    event['id']
                ),
                readonly=False
            )

            logger.info(f"Created customer record with user_id: {user_id}")

        customer = customer_result[0]
        user_id = str(customer['user_id'])

        # If subscription exists, generate MCP token immediately
        # Otherwise, it will be generated when subscription.created fires
        if subscription_id:
            logger.info(f"Subscription {subscription_id} exists - generating MCP token")

            # Import MCP token generation
            from mcp.auth.jwt_handler import create_mcp_token, get_token_hash
            from datetime import datetime, timedelta

            # Generate MCP token (1 year expiration)
            mcp_token = create_mcp_token(
                user_id=user_id,
                tier=tier,
                subscription_id=subscription_id,
                expires_days=365
            )

            # Get token hash for storage
            token_hash = get_token_hash(mcp_token)

            # Calculate expiration date
            expires_at = datetime.utcnow() + timedelta(days=365)

            # Store token hash in database
            insert_token = """
                INSERT INTO mcp_tokens (
                    user_id, token_hash, subscription_id, tier,
                    expires_at, is_active, created_at
                )
                VALUES (%s, %s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, subscription_id)
                DO UPDATE SET
                    token_hash = EXCLUDED.token_hash,
                    tier = EXCLUDED.tier,
                    expires_at = EXCLUDED.expires_at,
                    is_active = TRUE,
                    created_at = CURRENT_TIMESTAMP
            """

            db.execute_with_retry(
                insert_token,
                (user_id, token_hash, subscription_id, tier, expires_at),
                readonly=False
            )

            logger.info(
                f"MCP token created for user {user_id}, tier {tier}, "
                f"subscription {subscription_id}"
            )

            # TODO: Send welcome email with MCP token
            # This is CRITICAL - user needs token to use MCP
            # Email should include:
            # - Welcome message
            # - MCP token (ONLY send once!)
            # - Claude Desktop setup instructions
            # - Link to documentation
            # - Support contact info

            logger.warning(f"TODO: Send MCP welcome email to {customer_email} with token")
            logger.info(f"MCP Token (STORE SECURELY - not logged in production): {mcp_token[:20]}...")

        else:
            logger.info(f"No subscription yet - MCP token will be generated on subscription.created")

        # Track metrics
        from monitoring.prometheus_metrics import subscriptions_total
        subscriptions_total.labels(tier=tier, event='checkout_completed').inc()

        logger.info(f"Successfully processed checkout.session.completed for {session_id}")

    except Exception as e:
        logger.error(f"Error processing checkout.session.completed: {e}", exc_info=True)
        raise


# ==========================================
# PAYMENT METHOD EVENT PROCESSORS
# ==========================================

async def process_payment_method_attached(event: Dict[str, Any]) -> None:
    """
    Process payment_method.attached webhook event

    Args:
        event: Stripe event object
    """
    try:
        payment_method = event['data']['object']
        payment_method_id = payment_method['id']
        customer_id = payment_method.get('customer')

        logger.info(f"Processing payment_method.attached: {payment_method_id}")

        if not customer_id:
            logger.warning(f"Payment method {payment_method_id} has no customer")
            return

        db = get_db()

        # Get customer database ID
        query = "SELECT id FROM customers WHERE stripe_customer_id = %s"
        result = db.execute_with_retry(query, (customer_id,), readonly=True)

        if not result:
            logger.warning(f"Customer {customer_id} not found")
            return

        customer_db_id = result[0]['id']

        # Check if payment method already exists
        check_query = "SELECT id FROM payment_methods WHERE stripe_payment_method_id = %s"
        existing = db.execute_with_retry(check_query, (payment_method_id,), readonly=True)

        if not existing:
            # Insert new payment method
            insert_query = """
                INSERT INTO payment_methods (
                    stripe_payment_method_id, customer_id, type,
                    card_brand, card_last4, card_exp_month, card_exp_year,
                    is_default, last_webhook_event_id, last_webhook_updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """

            params = (
                payment_method_id,
                customer_db_id,
                payment_method['type'],
                payment_method.get('card', {}).get('brand') if payment_method['type'] == 'card' else None,
                payment_method.get('card', {}).get('last4') if payment_method['type'] == 'card' else None,
                payment_method.get('card', {}).get('exp_month') if payment_method['type'] == 'card' else None,
                payment_method.get('card', {}).get('exp_year') if payment_method['type'] == 'card' else None,
                False,  # Will be set to true if it becomes default
                event['id']
            )

            db.execute_with_retry(insert_query, params, readonly=False)

        logger.info(f"Successfully processed payment_method.attached for {payment_method_id}")

    except Exception as e:
        logger.error(f"Error processing payment_method.attached: {e}")
        raise


async def process_payment_method_detached(event: Dict[str, Any]) -> None:
    """
    Process payment_method.detached webhook event

    Args:
        event: Stripe event object
    """
    try:
        payment_method = event['data']['object']
        payment_method_id = payment_method['id']

        logger.info(f"Processing payment_method.detached: {payment_method_id}")

        db = get_db()

        # Delete payment method from database
        query = "DELETE FROM payment_methods WHERE stripe_payment_method_id = %s"
        db.execute_with_retry(query, (payment_method_id,), readonly=False)

        logger.info(f"Successfully processed payment_method.detached for {payment_method_id}")

    except Exception as e:
        logger.error(f"Error processing payment_method.detached: {e}")
        raise


# Test function
if __name__ == '__main__':
    import asyncio
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Webhook Event Processors Test ===\n")

    # This would normally be called with real Stripe events
    # For testing, we'd need mock event data

    print("Processors available:")
    print("  - process_customer_created")
    print("  - process_customer_updated")
    print("  - process_customer_deleted")
    print("  - process_subscription_created")
    print("  - process_subscription_updated")
    print("  - process_subscription_deleted")
    print("  - process_payment_succeeded")
    print("  - process_payment_failed")
    print("  - process_payment_method_attached")
    print("  - process_payment_method_detached")

    print("\n✅ Event processors ready")
