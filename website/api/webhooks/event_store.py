# -*- coding: utf-8 -*-
"""
Webhook Event Store for Kamiyo
Manages persistence and retrieval of Stripe webhook events
"""

import os
import sys
import logging
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database.postgres_manager import get_db
from monitoring.prometheus_metrics import db_query_duration_seconds

logger = logging.getLogger(__name__)


class WebhookEvent:
    """Represents a webhook event"""

    def __init__(self, row: Dict[str, Any]):
        """
        Initialize webhook event from database row

        Args:
            row: Database row as dictionary
        """
        self.id = row.get('id')
        self.event_id = row.get('event_id')
        self.event_type = row.get('event_type')
        self.payload = row.get('payload')
        self.status = row.get('status')
        self.processing_attempts = row.get('processing_attempts', 0)
        self.created_at = row.get('created_at')
        self.processed_at = row.get('processed_at')

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'event_id': self.event_id,
            'event_type': self.event_type,
            'payload': self.payload,
            'status': self.status,
            'processing_attempts': self.processing_attempts,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }


def store_event(
    event_id: str,
    event_type: str,
    payload: Dict[str, Any],
    status: str = 'pending'
) -> Optional[WebhookEvent]:
    """
    Store a webhook event in the database

    Args:
        event_id: Stripe event ID (e.g., evt_...)
        event_type: Event type (e.g., customer.subscription.updated)
        payload: Full event payload from Stripe
        status: Initial status (default: pending)

    Returns:
        WebhookEvent object or None if already exists
    """
    db = get_db()

    try:
        # Check if event already exists (idempotency check)
        existing = get_event(event_id)
        if existing:
            logger.info(f"Webhook event {event_id} already exists - skipping duplicate")
            return existing

        # Store new event
        query = """
            INSERT INTO webhook_events (event_id, event_type, payload, status, processing_attempts)
            VALUES (%s, %s, %s, %s, 0)
            RETURNING id, event_id, event_type, payload, status, processing_attempts, created_at, processed_at
        """

        params = (event_id, event_type, json.dumps(payload) if isinstance(payload, dict) else payload, status)

        start_time = datetime.now()
        result = db.execute_with_retry(query, params, readonly=False)
        duration = (datetime.now() - start_time).total_seconds()

        # Track query duration
        db_query_duration_seconds.labels(query_type='insert_webhook').observe(duration)

        if not result:
            logger.error(f"Failed to store webhook event {event_id}")
            return None

        event = WebhookEvent(result[0])
        logger.info(f"Stored webhook event {event_id} (type: {event_type})")

        return event

    except Exception as e:
        logger.error(f"Error storing webhook event {event_id}: {e}")
        return None


def get_event(event_id: str) -> Optional[WebhookEvent]:
    """
    Get a webhook event by ID

    Args:
        event_id: Stripe event ID

    Returns:
        WebhookEvent object or None if not found
    """
    db = get_db()

    try:
        query = """
            SELECT id, event_id, event_type, payload, status, processing_attempts, created_at, processed_at
            FROM webhook_events
            WHERE event_id = %s
        """

        start_time = datetime.now()
        result = db.execute_with_retry(query, (event_id,), readonly=True)
        duration = (datetime.now() - start_time).total_seconds()

        # Track query duration
        db_query_duration_seconds.labels(query_type='select_webhook').observe(duration)

        if not result:
            return None

        return WebhookEvent(result[0])

    except Exception as e:
        logger.error(f"Error fetching webhook event {event_id}: {e}")
        return None


def mark_event_processed(event_id: str, status: str = 'processed') -> bool:
    """
    Mark a webhook event as processed

    Args:
        event_id: Stripe event ID
        status: Final status (processed or failed)

    Returns:
        True if updated successfully
    """
    db = get_db()

    try:
        query = """
            UPDATE webhook_events
            SET status = %s,
                processed_at = CURRENT_TIMESTAMP
            WHERE event_id = %s
        """

        params = (status, event_id)

        start_time = datetime.now()
        db.execute_with_retry(query, params, readonly=False)
        duration = (datetime.now() - start_time).total_seconds()

        # Track query duration
        db_query_duration_seconds.labels(query_type='update_webhook').observe(duration)

        logger.info(f"Marked webhook event {event_id} as {status}")

        return True

    except Exception as e:
        logger.error(f"Error marking event {event_id} as processed: {e}")
        return False


def mark_event_failed(event_id: str, error_message: str, error_type: str = None) -> bool:
    """
    Mark a webhook event as failed and store error details

    Args:
        event_id: Stripe event ID
        error_message: Error message
        error_type: Type of error (optional)

    Returns:
        True if updated successfully
    """
    db = get_db()

    try:
        # Update event status
        query = """
            UPDATE webhook_events
            SET status = 'failed',
                processing_attempts = processing_attempts + 1
            WHERE event_id = %s
        """

        db.execute_with_retry(query, (event_id,), readonly=False)

        # Store failure details
        failure_query = """
            INSERT INTO webhook_failures (event_id, error_message, error_type, retry_count, last_retry_at, next_retry_at)
            VALUES (%s, %s, %s, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
        """

        params = (event_id, error_message, error_type)

        db.execute_with_retry(failure_query, params, readonly=False)

        logger.error(f"Marked webhook event {event_id} as failed: {error_message}")

        return True

    except Exception as e:
        logger.error(f"Error marking event {event_id} as failed: {e}")
        return False


def get_failed_events(limit: int = 100) -> List[WebhookEvent]:
    """
    Get failed webhook events that should be retried

    Args:
        limit: Maximum number of events to return

    Returns:
        List of WebhookEvent objects
    """
    db = get_db()

    try:
        query = """
            SELECT DISTINCT we.id, we.event_id, we.event_type, we.payload,
                   we.status, we.processing_attempts, we.created_at, we.processed_at
            FROM webhook_events we
            JOIN webhook_failures wf ON we.event_id = wf.event_id
            WHERE we.status = 'failed'
              AND wf.retry_count < 5
              AND (wf.next_retry_at IS NULL OR wf.next_retry_at <= CURRENT_TIMESTAMP)
            ORDER BY we.created_at ASC
            LIMIT %s
        """

        result = db.execute_with_retry(query, (limit,), readonly=True)

        if not result:
            return []

        events = [WebhookEvent(row) for row in result]

        logger.info(f"Found {len(events)} failed webhook events to retry")

        return events

    except Exception as e:
        logger.error(f"Error fetching failed webhook events: {e}")
        return []


def retry_failed_event(event_id: str) -> bool:
    """
    Reset a failed event for retry

    Args:
        event_id: Stripe event ID

    Returns:
        True if reset successfully
    """
    db = get_db()

    try:
        # Use the database function to reset the event
        query = "SELECT reset_failed_webhook_for_retry(%s)"

        result = db.execute_with_retry(query, (event_id,), readonly=False)

        if result and result[0][0]:
            logger.info(f"Reset webhook event {event_id} for retry")
            return True
        else:
            logger.warning(f"Could not reset webhook event {event_id} - not found or not failed")
            return False

    except Exception as e:
        logger.error(f"Error retrying webhook event {event_id}: {e}")
        return False


def log_processing_attempt(
    event_id: str,
    processor_name: str,
    status: str,
    duration_ms: int,
    message: str = None,
    metadata: Dict[str, Any] = None
) -> bool:
    """
    Log a webhook processing attempt

    Args:
        event_id: Stripe event ID
        processor_name: Name of processor that handled the event
        status: Processing status (success, failure, skipped)
        duration_ms: Processing duration in milliseconds
        message: Optional log message
        metadata: Optional metadata dictionary

    Returns:
        True if logged successfully
    """
    db = get_db()

    try:
        query = """
            INSERT INTO webhook_processing_log (event_id, processor_name, status, duration_ms, message, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
        """

        params = (
            event_id,
            processor_name,
            status,
            duration_ms,
            message,
            json.dumps(metadata) if metadata else None
        )

        db.execute_with_retry(query, params, readonly=False)

        return True

    except Exception as e:
        logger.error(f"Error logging processing attempt for {event_id}: {e}")
        return False


def get_event_statistics(days: int = 7) -> Dict[str, Any]:
    """
    Get webhook event statistics for the last N days

    Args:
        days: Number of days to look back

    Returns:
        Statistics dictionary
    """
    db = get_db()

    try:
        query = """
            SELECT
                event_type,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'processed') as processed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000)::numeric, 2) as avg_processing_time_ms
            FROM webhook_events
            WHERE created_at > NOW() - INTERVAL '%s days'
            GROUP BY event_type
            ORDER BY total DESC
        """

        result = db.execute_with_retry(query, (days,), readonly=True)

        if not result:
            return {}

        stats = {}
        for row in result:
            stats[row['event_type']] = {
                'total': row['total'],
                'processed': row['processed'],
                'failed': row['failed'],
                'pending': row['pending'],
                'avg_processing_time_ms': float(row['avg_processing_time_ms']) if row['avg_processing_time_ms'] else 0
            }

        return stats

    except Exception as e:
        logger.error(f"Error fetching event statistics: {e}")
        return {}


def cleanup_old_events(days: int = 30) -> int:
    """
    Clean up old processed webhook events

    Args:
        days: Delete events older than this many days

    Returns:
        Number of events deleted
    """
    db = get_db()

    try:
        query = "SELECT cleanup_old_webhook_events()"

        result = db.execute_with_retry(query, (), readonly=False)

        deleted_count = result[0][0] if result else 0

        logger.info(f"Cleaned up {deleted_count} old webhook events")

        return deleted_count

    except Exception as e:
        logger.error(f"Error cleaning up old events: {e}")
        return 0


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Webhook Event Store Test ===\n")

    # Test event data
    test_event_id = 'evt_test_123'
    test_event_type = 'customer.subscription.updated'
    test_payload = {
        'id': test_event_id,
        'type': test_event_type,
        'data': {
            'object': {
                'id': 'sub_123',
                'customer': 'cus_123'
            }
        }
    }

    print("1. Testing store_event...")
    event = store_event(test_event_id, test_event_type, test_payload)
    if event:
        print(f"   ✓ Event stored: {event.event_id}")
    else:
        print("   ✗ Failed to store event")

    print("\n2. Testing get_event...")
    retrieved = get_event(test_event_id)
    if retrieved:
        print(f"   ✓ Event retrieved: {retrieved.event_id} (status: {retrieved.status})")
    else:
        print("   ✗ Event not found")

    print("\n3. Testing mark_event_processed...")
    success = mark_event_processed(test_event_id)
    print(f"   {'✓' if success else '✗'} Mark as processed: {success}")

    print("\n4. Testing get_event_statistics...")
    stats = get_event_statistics(7)
    print(f"   Statistics for last 7 days:")
    for event_type, data in stats.items():
        print(f"   - {event_type}: {data['total']} events, {data['processed']} processed")

    print("\n✅ Event store ready")
