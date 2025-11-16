# -*- coding: utf-8 -*-
"""
Kamiyo Stripe Webhook Handlers
Processes Stripe webhook events for subscriptions and payments
"""

from .stripe_handler import handle_webhook_event
from .processors import (
    process_customer_created,
    process_customer_updated,
    process_customer_deleted,
    process_subscription_created,
    process_subscription_updated,
    process_subscription_deleted,
    process_payment_succeeded,
    process_payment_failed
)
from .event_store import (
    store_event,
    get_event,
    mark_event_processed,
    get_failed_events,
    retry_failed_event
)
from .notifications import (
    notify_subscription_created,
    notify_subscription_cancelled,
    notify_payment_succeeded,
    notify_payment_failed
)

__all__ = [
    # Main handler
    'handle_webhook_event',

    # Event processors
    'process_customer_created',
    'process_customer_updated',
    'process_customer_deleted',
    'process_subscription_created',
    'process_subscription_updated',
    'process_subscription_deleted',
    'process_payment_succeeded',
    'process_payment_failed',

    # Event storage
    'store_event',
    'get_event',
    'mark_event_processed',
    'get_failed_events',
    'retry_failed_event',

    # Notifications
    'notify_subscription_created',
    'notify_subscription_cancelled',
    'notify_payment_succeeded',
    'notify_payment_failed'
]
