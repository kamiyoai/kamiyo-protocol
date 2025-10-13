# -*- coding: utf-8 -*-
"""
Main Stripe Webhook Handler for Kamiyo
Verifies signatures and routes events to appropriate processors
"""

import os
import sys
import logging
import json
import time
from typing import Dict, Any, Callable
from fastapi import Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import stripe
from config.stripe_config import get_stripe_config
from api.webhooks.event_store import store_event, mark_event_processed, mark_event_failed, log_processing_attempt
from api.webhooks.processors import (
    process_customer_created,
    process_customer_updated,
    process_customer_deleted,
    process_subscription_created,
    process_subscription_updated,
    process_subscription_deleted,
    process_payment_succeeded,
    process_payment_failed,
    process_payment_method_attached,
    process_payment_method_detached
)
from monitoring.prometheus_metrics import api_request_duration_seconds
from monitoring.alerts import get_alert_manager, AlertLevel

logger = logging.getLogger(__name__)

# Initialize rate limiter for webhook endpoint
# PCI DSS Requirement 6.5.10: Protect against injection attacks and abuse
# Limits webhook requests to 30 per minute per IP address
limiter = Limiter(key_func=get_remote_address)


# Event type to processor mapping
EVENT_PROCESSORS: Dict[str, Callable] = {
    # Customer events
    'customer.created': process_customer_created,
    'customer.updated': process_customer_updated,
    'customer.deleted': process_customer_deleted,

    # Subscription events (PRIORITY)
    'customer.subscription.created': process_subscription_created,
    'customer.subscription.updated': process_subscription_updated,
    'customer.subscription.deleted': process_subscription_deleted,

    # Payment events (PRIORITY)
    'invoice.payment_succeeded': process_payment_succeeded,
    'invoice.payment_failed': process_payment_failed,

    # Payment method events
    'payment_method.attached': process_payment_method_attached,
    'payment_method.detached': process_payment_method_detached,
}


async def handle_webhook_event(request: Request, raw_body: bytes) -> Dict[str, Any]:
    """
    Main webhook event handler with rate limiting protection

    This function:
    1. Applies rate limiting (30 requests/minute per IP)
    2. Verifies the webhook signature from Stripe
    3. Stores the event for idempotent processing
    4. Routes to appropriate processor
    5. Handles errors and retries

    PCI DSS Compliance:
    - Requirement 6.5.10: Protection against injection and abuse
    - Rate limiting prevents webhook spam attacks
    - Signature verification prevents forged webhooks
    - Event deduplication prevents replay attacks

    Rate Limiting:
    - 30 webhooks per minute per IP address
    - Protects against:
      * DoS attacks on webhook endpoint
      * Forged webhook spam
      * Replay attacks
      * Resource exhaustion

    Args:
        request: FastAPI request object
        raw_body: Raw request body bytes (needed for signature verification)

    Returns:
        Response dictionary with status

    Raises:
        HTTPException: If signature verification fails or processing errors occur
        RateLimitExceeded: If rate limit exceeded (429 response)
    """
    start_time = time.time()
    event_id = None
    event_type = None

    try:
        # DEFENSE #1: Rate limiting check
        # Apply rate limit of 30 webhooks per minute per IP
        try:
            await limiter.check_request_limit(
                request=request,
                endpoint_key="stripe_webhook",
                limit="30/minute"
            )
        except RateLimitExceeded:
            # Log rate limit violation
            client_ip = get_remote_address(request)
            logger.warning(
                f"[RATE LIMIT] Webhook rate limit exceeded for IP: {client_ip}",
                extra={
                    "client_ip": client_ip,
                    "user_agent": request.headers.get("user-agent")
                }
            )

            # Send alert for potential abuse
            alert_manager = get_alert_manager()
            alert_manager.send_alert(
                title="Webhook Rate Limit Exceeded",
                message=f"IP {client_ip} exceeded webhook rate limit (30/min). Potential abuse detected.",
                level=AlertLevel.WARNING,
                metadata={
                    "client_ip": client_ip,
                    "endpoint": "/webhooks/stripe"
                }
            )

            # Return 429 Too Many Requests
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Maximum 30 webhook requests per minute."
            )

        # DEFENSE #2: Signature verification
        # Get Stripe configuration
        config = get_stripe_config()

        if not config.webhook_secret:
            logger.error("STRIPE_WEBHOOK_SECRET not configured")
            raise HTTPException(
                status_code=500,
                detail="Webhook secret not configured"
            )

        # Get signature from headers
        signature = request.headers.get('stripe-signature')

        if not signature:
            logger.error("Missing Stripe signature header")
            raise HTTPException(
                status_code=400,
                detail="Missing signature"
            )

        # Verify webhook signature and construct event
        try:
            event = stripe.Webhook.construct_event(
                payload=raw_body,
                sig_header=signature,
                secret=config.webhook_secret
            )

            logger.info(f"Webhook signature verified successfully")

        except ValueError as e:
            # Invalid payload
            logger.error(f"Invalid webhook payload: {e}")
            raise HTTPException(
                status_code=400,
                detail="Invalid payload"
            )

        except stripe.error.SignatureVerificationError as e:
            # Invalid signature
            logger.error(f"Invalid webhook signature: {e}")
            raise HTTPException(
                status_code=400,
                detail="Invalid signature"
            )

        # Extract event details
        event_id = event.get('id')
        event_type = event.get('type')

        logger.info(f"Received webhook event: {event_id} (type: {event_type})")

        # Store event in database for idempotent processing
        stored_event = store_event(
            event_id=event_id,
            event_type=event_type,
            payload=event,
            status='pending'
        )

        if not stored_event:
            # Event already exists (duplicate delivery)
            logger.info(f"Event {event_id} already processed - returning success")
            return {
                'status': 'success',
                'message': 'Event already processed',
                'event_id': event_id
            }

        # Check if we have a processor for this event type
        processor = EVENT_PROCESSORS.get(event_type)

        if not processor:
            logger.warning(f"No processor for event type: {event_type}")

            # Mark as processed (we don't handle this type)
            mark_event_processed(event_id, status='processed')

            # Log the attempt
            log_processing_attempt(
                event_id=event_id,
                processor_name='no_processor',
                status='skipped',
                duration_ms=int((time.time() - start_time) * 1000),
                message=f"No processor configured for {event_type}"
            )

            return {
                'status': 'success',
                'message': f'Event type {event_type} not handled',
                'event_id': event_id
            }

        # Process the event
        processor_start = time.time()

        try:
            await processor(event)

            # Mark event as processed
            mark_event_processed(event_id, status='processed')

            # Calculate processing duration
            processing_duration = int((time.time() - processor_start) * 1000)

            # Log successful processing
            log_processing_attempt(
                event_id=event_id,
                processor_name=processor.__name__,
                status='success',
                duration_ms=processing_duration,
                message=f"Successfully processed {event_type}"
            )

            logger.info(f"Successfully processed event {event_id} in {processing_duration}ms")

            # Track metrics
            total_duration = time.time() - start_time
            api_request_duration_seconds.labels(
                method='POST',
                endpoint='/webhooks/stripe'
            ).observe(total_duration)

            return {
                'status': 'success',
                'message': 'Event processed successfully',
                'event_id': event_id,
                'event_type': event_type,
                'processing_time_ms': processing_duration
            }

        except Exception as e:
            # Processing failed
            processing_duration = int((time.time() - processor_start) * 1000)

            logger.error(f"Error processing event {event_id}: {e}")

            # Determine error type
            error_type = type(e).__name__

            # Mark event as failed
            mark_event_failed(
                event_id=event_id,
                error_message=str(e),
                error_type=error_type
            )

            # Log failed processing
            log_processing_attempt(
                event_id=event_id,
                processor_name=processor.__name__,
                status='failure',
                duration_ms=processing_duration,
                message=str(e),
                metadata={'error_type': error_type}
            )

            # Send alert for critical events
            if event_type in ['invoice.payment_failed', 'customer.subscription.deleted']:
                alert_manager = get_alert_manager()
                alert_manager.send_alert(
                    title=f"Webhook Processing Failed: {event_type}",
                    message=f"Failed to process event {event_id}: {str(e)}",
                    level=AlertLevel.ERROR,
                    metadata={
                        'event_id': event_id,
                        'event_type': event_type,
                        'error': str(e),
                        'processor': processor.__name__
                    }
                )

            # Re-raise exception to return 500 to Stripe for retry
            raise HTTPException(
                status_code=500,
                detail=f"Error processing event: {str(e)}"
            )

    except HTTPException:
        # Re-raise HTTP exceptions
        raise

    except Exception as e:
        # Unexpected error
        logger.error(f"Unexpected error in webhook handler: {e}")

        # Send critical alert
        alert_manager = get_alert_manager()
        alert_manager.send_alert(
            title="Critical Webhook Handler Error",
            message=f"Unexpected error in webhook handler: {str(e)}",
            level=AlertLevel.CRITICAL,
            metadata={
                'event_id': event_id,
                'event_type': event_type,
                'error': str(e)
            }
        )

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


def get_supported_event_types() -> list:
    """
    Get list of supported event types

    Returns:
        List of event type strings
    """
    return list(EVENT_PROCESSORS.keys())


def is_event_supported(event_type: str) -> bool:
    """
    Check if an event type is supported

    Args:
        event_type: Stripe event type

    Returns:
        True if supported, False otherwise
    """
    return event_type in EVENT_PROCESSORS


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Stripe Webhook Handler Test ===\n")

    print("Supported event types:")
    for event_type in get_supported_event_types():
        processor = EVENT_PROCESSORS[event_type]
        print(f"  - {event_type} → {processor.__name__}")

    print("\n✅ Webhook handler ready")
    print("\nIMPORTANT: Webhook signature verification is ENABLED")
    print("Set STRIPE_WEBHOOK_SECRET environment variable")
    print("\nTo test with Stripe CLI:")
    print("  stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe")
