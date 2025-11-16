# -*- coding: utf-8 -*-
"""
Webhook API Routes for Kamiyo
FastAPI endpoints for Stripe webhooks
"""

import os
import sys
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.webhooks.stripe_handler import handle_webhook_event, get_supported_event_types
from api.webhooks.event_store import (
    get_event,
    get_failed_events,
    retry_failed_event,
    get_event_statistics,
    cleanup_old_events
)
from monitoring.prometheus_metrics import api_requests_total, api_requests_in_progress

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


# ==========================================
# WEBHOOK ENDPOINTS
# ==========================================

@router.post("/stripe")
@limiter.limit("10/second")  # Stripe sends webhooks frequently
async def stripe_webhook(request: Request):
    """
    Main Stripe webhook endpoint

    Receives and processes Stripe webhook events:
    - Verifies webhook signature
    - Stores event for idempotent processing
    - Routes to appropriate processor
    - Returns success/error status

    **CRITICAL**: This endpoint MUST verify webhook signature before processing.

    Rate limit: 10 requests/second

    Returns:
        Success/error response
    """
    # Track in-progress requests
    api_requests_in_progress.labels(endpoint='/webhooks/stripe').inc()

    try:
        # Get raw body (needed for signature verification)
        raw_body = await request.body()

        # Process webhook event
        result = await handle_webhook_event(request, raw_body)

        # Track successful request
        api_requests_total.labels(
            method='POST',
            endpoint='/webhooks/stripe',
            status=200
        ).inc()

        return JSONResponse(
            status_code=200,
            content=result
        )

    except HTTPException as e:
        # Track failed request
        api_requests_total.labels(
            method='POST',
            endpoint='/webhooks/stripe',
            status=e.status_code
        ).inc()

        raise

    except Exception as e:
        logger.error(f"Unexpected error in webhook endpoint: {e}")

        # Track failed request
        api_requests_total.labels(
            method='POST',
            endpoint='/webhooks/stripe',
            status=500
        ).inc()

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

    finally:
        # Decrement in-progress counter
        api_requests_in_progress.labels(endpoint='/webhooks/stripe').dec()


@router.get("/health")
async def webhook_health():
    """
    Health check endpoint for webhook system

    Returns:
        Health status
    """
    try:
        # Get recent event statistics
        stats = get_event_statistics(days=1)

        # Calculate total events
        total_events = sum(s['total'] for s in stats.values())
        failed_events = sum(s['failed'] for s in stats.values())

        # Determine health status
        health_status = "healthy"
        if failed_events > 0:
            failure_rate = failed_events / total_events if total_events > 0 else 0
            if failure_rate > 0.1:  # More than 10% failure rate
                health_status = "degraded"
            elif failure_rate > 0.2:  # More than 20% failure rate
                health_status = "unhealthy"

        return {
            'status': health_status,
            'webhook_system': 'operational',
            'events_last_24h': total_events,
            'failed_events_last_24h': failed_events,
            'supported_event_types': len(get_supported_event_types())
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            'status': 'unhealthy',
            'webhook_system': 'error',
            'error': str(e)
        }


# ==========================================
# ADMIN ENDPOINTS (Require Authentication)
# ==========================================

def verify_admin_key(x_admin_key: str = Header(None)) -> bool:
    """
    Verify admin API key

    Args:
        x_admin_key: Admin API key from header

    Returns:
        True if valid

    Raises:
        HTTPException: If invalid or missing
    """
    admin_key = os.getenv('ADMIN_API_KEY')

    if not admin_key:
        raise HTTPException(
            status_code=500,
            detail="Admin API key not configured"
        )

    if not x_admin_key or x_admin_key != admin_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid admin API key"
        )

    return True


@router.get("/events/{event_id}")
async def get_webhook_event(
    event_id: str,
    admin_verified: bool = Depends(verify_admin_key)
):
    """
    Get details of a specific webhook event (Admin only)

    Args:
        event_id: Stripe event ID

    Returns:
        Event details
    """
    try:
        event = get_event(event_id)

        if not event:
            raise HTTPException(
                status_code=404,
                detail=f"Event {event_id} not found"
            )

        return event.to_dict()

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error fetching event {event_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching event: {str(e)}"
        )


@router.post("/events/{event_id}/retry")
async def retry_webhook_event(
    event_id: str,
    admin_verified: bool = Depends(verify_admin_key)
):
    """
    Retry a failed webhook event (Admin only)

    Args:
        event_id: Stripe event ID

    Returns:
        Success status
    """
    try:
        # Check if event exists
        event = get_event(event_id)

        if not event:
            raise HTTPException(
                status_code=404,
                detail=f"Event {event_id} not found"
            )

        # Only retry failed events
        if event.status != 'failed':
            raise HTTPException(
                status_code=400,
                detail=f"Event {event_id} is not in failed state (current: {event.status})"
            )

        # Reset for retry
        success = retry_failed_event(event_id)

        if not success:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to reset event {event_id} for retry"
            )

        return {
            'status': 'success',
            'message': f'Event {event_id} reset for retry',
            'event_id': event_id
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error retrying event {event_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error retrying event: {str(e)}"
        )


@router.get("/events/failed/list")
async def list_failed_events(
    limit: int = 100,
    admin_verified: bool = Depends(verify_admin_key)
):
    """
    List failed webhook events (Admin only)

    Args:
        limit: Maximum number of events to return (default: 100)

    Returns:
        List of failed events
    """
    try:
        events = get_failed_events(limit=limit)

        return {
            'status': 'success',
            'count': len(events),
            'events': [event.to_dict() for event in events]
        }

    except Exception as e:
        logger.error(f"Error listing failed events: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing failed events: {str(e)}"
        )


@router.get("/statistics")
async def webhook_statistics(
    days: int = 7,
    admin_verified: bool = Depends(verify_admin_key)
):
    """
    Get webhook processing statistics (Admin only)

    Args:
        days: Number of days to look back (default: 7)

    Returns:
        Statistics by event type
    """
    try:
        stats = get_event_statistics(days=days)

        # Calculate totals
        total_events = sum(s['total'] for s in stats.values())
        total_processed = sum(s['processed'] for s in stats.values())
        total_failed = sum(s['failed'] for s in stats.values())
        total_pending = sum(s['pending'] for s in stats.values())

        return {
            'status': 'success',
            'period_days': days,
            'summary': {
                'total_events': total_events,
                'processed': total_processed,
                'failed': total_failed,
                'pending': total_pending,
                'success_rate': (total_processed / total_events * 100) if total_events > 0 else 0
            },
            'by_event_type': stats
        }

    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching statistics: {str(e)}"
        )


@router.post("/cleanup")
async def cleanup_webhook_events(
    days: int = 30,
    admin_verified: bool = Depends(verify_admin_key)
):
    """
    Clean up old processed webhook events (Admin only)

    Args:
        days: Delete events older than this many days (default: 30)

    Returns:
        Number of events deleted
    """
    try:
        deleted_count = cleanup_old_events(days=days)

        return {
            'status': 'success',
            'message': f'Deleted {deleted_count} old webhook events',
            'deleted_count': deleted_count,
            'older_than_days': days
        }

    except Exception as e:
        logger.error(f"Error cleaning up events: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error cleaning up events: {str(e)}"
        )


@router.get("/supported-events")
async def list_supported_events():
    """
    List supported Stripe webhook event types

    Returns:
        List of supported event types
    """
    return {
        'status': 'success',
        'supported_events': get_supported_event_types(),
        'count': len(get_supported_event_types())
    }


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Webhook Routes Test ===\n")

    print("Available endpoints:")
    print("  POST   /api/v1/webhooks/stripe - Main webhook endpoint")
    print("  GET    /api/v1/webhooks/health - Health check")
    print("  GET    /api/v1/webhooks/supported-events - List supported events")
    print("\nAdmin endpoints (require X-Admin-Key header):")
    print("  GET    /api/v1/webhooks/events/{event_id} - Get event details")
    print("  POST   /api/v1/webhooks/events/{event_id}/retry - Retry failed event")
    print("  GET    /api/v1/webhooks/events/failed/list - List failed events")
    print("  GET    /api/v1/webhooks/statistics - Get statistics")
    print("  POST   /api/v1/webhooks/cleanup - Clean up old events")

    print("\n✅ Webhook routes ready")
    print("\nTo include in main API:")
    print("  from api.webhooks.routes import router as webhook_router")
    print("  app.include_router(webhook_router)")
