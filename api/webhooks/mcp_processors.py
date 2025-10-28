"""
MCP-Specific Webhook Processors

Handles MCP token generation and management for Stripe subscription events.
These processors extend the main webhook handlers with MCP functionality.

Integration:
    These processors should be called from the main processors.py handlers
    after the standard subscription processing is complete.
"""

import os
import sys
import logging
from typing import Dict, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database.postgres_manager import get_db
from mcp.auth.jwt_handler import create_mcp_token, get_token_hash

logger = logging.getLogger(__name__)


async def handle_mcp_subscription_created(event: Dict[str, Any]) -> None:
    """
    Generate MCP token when subscription is created

    Args:
        event: Stripe subscription.created event

    This function:
    1. Generates a new MCP JWT token
    2. Stores token hash in database
    3. TODO: Sends email with Claude Desktop setup instructions
    """
    try:
        subscription = event['data']['object']
        subscription_id = subscription['id']
        customer_id = subscription['customer']

        logger.info(f"Generating MCP token for subscription: {subscription_id}")

        db = get_db()

        # Get customer and user info
        customer_query = """
            SELECT id, user_id, email
            FROM customers
            WHERE stripe_customer_id = %s
        """
        customer_result = db.execute_with_retry(
            customer_query,
            (customer_id,),
            readonly=True
        )

        if not customer_result:
            logger.error(f"Customer {customer_id} not found for MCP token generation")
            return

        customer = customer_result[0]
        user_id = str(customer['user_id'])
        email = customer['email']

        # Extract tier from subscription metadata
        tier = subscription.get('metadata', {}).get('tier', 'personal')

        # Map Stripe tiers to MCP tiers if needed
        tier_mapping = {
            'basic': 'personal',
            'pro': 'team',
            'enterprise': 'enterprise'
        }
        mcp_tier = tier_mapping.get(tier.lower(), tier.lower())

        # Generate MCP token (1 year expiration)
        mcp_token = create_mcp_token(
            user_id=user_id,
            tier=mcp_tier,
            subscription_id=subscription_id,
            expires_days=365
        )

        # Get token hash for storage
        token_hash = get_token_hash(mcp_token)

        # Calculate expiration date (1 year from now)
        from datetime import datetime, timedelta
        expires_at = datetime.utcnow() + timedelta(days=365)

        # Store token hash in database
        insert_query = """
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
            insert_query,
            (user_id, token_hash, subscription_id, mcp_tier, expires_at),
            readonly=False
        )

        logger.info(
            f"MCP token created for user {user_id}, tier {mcp_tier}, "
            f"subscription {subscription_id}"
        )

        # TODO: Send email with setup instructions
        # This would include:
        # - The MCP token (ONLY send once, securely)
        # - Claude Desktop configuration instructions
        # - Link to documentation
        #
        # Example email content:
        # """
        # Your KAMIYO MCP access is ready!
        #
        # Token: {mcp_token}
        #
        # To use with Claude Desktop:
        # 1. Open Claude Desktop settings
        # 2. Add MCP server:
        #    {
        #      "kamiyo-security": {
        #        "command": "npx",
        #        "args": ["-y", "@kamiyo/mcp-server"],
        #        "env": {
        #          "KAMIYO_MCP_TOKEN": "{mcp_token}"
        #        }
        #      }
        #    }
        #
        # Documentation: https://kamiyo.io/docs/mcp
        # """

        logger.info(f"TODO: Send MCP setup email to {email}")

    except Exception as e:
        logger.error(f"Error handling MCP subscription created: {e}", exc_info=True)
        # Don't raise - we don't want to fail the main webhook processing
        # The subscription was already created successfully


async def handle_mcp_subscription_updated(event: Dict[str, Any]) -> None:
    """
    Update MCP token when subscription tier changes

    Args:
        event: Stripe subscription.updated event

    This function:
    1. Checks if tier changed
    2. Updates token tier in database
    3. Optionally regenerates token for security
    """
    try:
        subscription = event['data']['object']
        previous_attributes = event['data'].get('previous_attributes', {})
        subscription_id = subscription['id']

        # Check if metadata changed (tier might be in metadata)
        if 'metadata' not in previous_attributes:
            logger.debug(f"Subscription {subscription_id} updated but no metadata change")
            return

        logger.info(f"Updating MCP token for subscription: {subscription_id}")

        db = get_db()

        # Get new tier
        new_tier = subscription.get('metadata', {}).get('tier', 'personal')

        # Map to MCP tier
        tier_mapping = {
            'basic': 'personal',
            'pro': 'team',
            'enterprise': 'enterprise'
        }
        mcp_tier = tier_mapping.get(new_tier.lower(), new_tier.lower())

        # Update tier in database
        update_query = """
            UPDATE mcp_tokens
            SET tier = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = %s
        """

        result = db.execute_with_retry(
            update_query,
            (mcp_tier, subscription_id),
            readonly=False
        )

        if result:
            logger.info(
                f"Updated MCP token tier to {mcp_tier} for subscription {subscription_id}"
            )
        else:
            logger.warning(f"No MCP token found for subscription {subscription_id}")

        # Note: We don't regenerate the token here
        # The existing token will now have the new tier when verified
        # (because we validate against current subscription status)

    except Exception as e:
        logger.error(f"Error handling MCP subscription updated: {e}", exc_info=True)


async def handle_mcp_subscription_cancelled(event: Dict[str, Any]) -> None:
    """
    Revoke MCP access when subscription is cancelled

    Args:
        event: Stripe subscription.deleted event

    This function:
    1. Marks MCP token as inactive
    2. TODO: Sends email notification
    """
    try:
        subscription = event['data']['object']
        subscription_id = subscription['id']

        logger.info(f"Revoking MCP token for subscription: {subscription_id}")

        db = get_db()

        # Mark token as inactive
        update_query = """
            UPDATE mcp_tokens
            SET is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = %s
        """

        result = db.execute_with_retry(
            update_query,
            (subscription_id,),
            readonly=False
        )

        if result:
            logger.info(f"Revoked MCP token for subscription {subscription_id}")

            # Get user info for notification
            user_query = """
                SELECT c.user_id, c.email
                FROM mcp_tokens mt
                JOIN customers c ON mt.user_id = c.user_id
                WHERE mt.subscription_id = %s
            """
            user_result = db.execute_with_retry(
                user_query,
                (subscription_id,),
                readonly=True
            )

            if user_result:
                email = user_result[0]['email']
                logger.info(f"TODO: Send MCP cancellation email to {email}")
                # TODO: Send email notification about revoked access

        else:
            logger.warning(f"No MCP token found for subscription {subscription_id}")

    except Exception as e:
        logger.error(f"Error handling MCP subscription cancelled: {e}", exc_info=True)


# Integration helpers

async def process_mcp_subscription_events(event: Dict[str, Any]) -> None:
    """
    Route subscription events to appropriate MCP handlers

    Call this from the main webhook processors after standard processing.

    Args:
        event: Stripe event object

    Example integration in processors.py:
        async def process_subscription_created(event):
            # ... existing processing ...

            # Add MCP token generation
            from api.webhooks.mcp_processors import process_mcp_subscription_events
            await process_mcp_subscription_events(event)
    """
    event_type = event.get('type')

    handlers = {
        'customer.subscription.created': handle_mcp_subscription_created,
        'customer.subscription.updated': handle_mcp_subscription_updated,
        'customer.subscription.deleted': handle_mcp_subscription_cancelled,
    }

    handler = handlers.get(event_type)
    if handler:
        try:
            await handler(event)
        except Exception as e:
            logger.error(f"Error in MCP event handler for {event_type}: {e}")
            # Don't raise - MCP processing is supplementary


# Test function
if __name__ == '__main__':
    import asyncio
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== MCP Webhook Processors Test ===\n")

    # Mock event data
    mock_subscription_created = {
        'id': 'evt_test_123',
        'type': 'customer.subscription.created',
        'data': {
            'object': {
                'id': 'sub_test_abc',
                'customer': 'cus_test_xyz',
                'status': 'active',
                'metadata': {
                    'tier': 'team'
                },
                'current_period_start': 1234567890,
                'current_period_end': 1234567890 + 2592000
            }
        }
    }

    print("Mock event structure:")
    print(f"  Event ID: {mock_subscription_created['id']}")
    print(f"  Event Type: {mock_subscription_created['type']}")
    print(f"  Subscription ID: {mock_subscription_created['data']['object']['id']}")
    print(f"  Tier: {mock_subscription_created['data']['object']['metadata']['tier']}")

    print("\nProcessors available:")
    print("  - handle_mcp_subscription_created")
    print("  - handle_mcp_subscription_updated")
    print("  - handle_mcp_subscription_cancelled")

    print("\n✅ MCP Webhook Processors ready")
    print("\nIntegration instructions:")
    print("1. Import in api/webhooks/processors.py:")
    print("   from api.webhooks.mcp_processors import process_mcp_subscription_events")
    print("\n2. Add to each subscription processor:")
    print("   await process_mcp_subscription_events(event)")
