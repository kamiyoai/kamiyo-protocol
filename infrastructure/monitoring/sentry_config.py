# -*- coding: utf-8 -*-
"""
Sentry Error Tracking Configuration
Captures and tracks errors in production
"""

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.redis import RedisIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
import logging

logger = logging.getLogger(__name__)


def init_sentry():
    """Initialize Sentry error tracking"""

    sentry_dsn = os.getenv('SENTRY_DSN')
    environment = os.getenv('ENVIRONMENT', 'development')

    if not sentry_dsn:
        logger.warning("SENTRY_DSN not set, error tracking disabled")
        return

    # Configure logging integration
    logging_integration = LoggingIntegration(
        level=logging.INFO,        # Capture info and above as breadcrumbs
        event_level=logging.ERROR  # Send errors as events
    )

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=environment,

        # Integrations
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
            RedisIntegration(),
            logging_integration
        ],

        # Performance monitoring
        traces_sample_rate=0.1,  # 10% of transactions
        profiles_sample_rate=0.1,  # 10% of profiling

        # Release tracking
        release=os.getenv('SENTRY_RELEASE', 'kamiyo@2.0.0'),

        # Error filtering
        before_send=before_send_filter,

        # Additional options
        attach_stacktrace=True,
        send_default_pii=False,  # Don't send PII (GDPR compliance)
        max_breadcrumbs=50,
        debug=False
    )

    logger.info(f"Sentry initialized for environment: {environment}")


def before_send_filter(event, hint):
    """
    Filter events before sending to Sentry

    Can be used to:
    - Remove sensitive data
    - Filter out known errors
    - Add custom context
    """

    # Filter out health check errors
    if 'request' in event:
        url = event['request'].get('url', '')
        if '/health' in url:
            return None

    # Filter out rate limit errors (they're expected)
    if 'exception' in event:
        for exception in event['exception'].get('values', []):
            if 'RateLimitExceeded' in exception.get('type', ''):
                return None

    # Add custom tags
    event['tags'] = event.get('tags', {})
    event['tags']['application'] = 'kamiyo'

    return event


def capture_exception(error: Exception, extra_context: dict = None):
    """
    Capture exception with additional context

    Args:
        error: Exception to capture
        extra_context: Additional context to include
    """

    if extra_context:
        with sentry_sdk.push_scope() as scope:
            for key, value in extra_context.items():
                scope.set_context(key, value)
            sentry_sdk.capture_exception(error)
    else:
        sentry_sdk.capture_exception(error)


def capture_message(message: str, level: str = 'info', extra_context: dict = None):
    """
    Capture message with context

    Args:
        message: Message to send
        level: Log level (debug, info, warning, error, fatal)
        extra_context: Additional context
    """

    if extra_context:
        with sentry_sdk.push_scope() as scope:
            for key, value in extra_context.items():
                scope.set_context(key, value)
            sentry_sdk.capture_message(message, level)
    else:
        sentry_sdk.capture_message(message, level)


def set_user_context(user_id: str, email: str = None, tier: str = None):
    """Set user context for error tracking"""

    sentry_sdk.set_user({
        "id": user_id,
        "email": email,
        "tier": tier
    })


def set_transaction_name(name: str):
    """Set transaction name for performance tracking"""

    with sentry_sdk.configure_scope() as scope:
        scope.transaction = name


def add_breadcrumb(message: str, category: str = 'default', level: str = 'info', data: dict = None):
    """Add breadcrumb for debugging context"""

    sentry_sdk.add_breadcrumb(
        message=message,
        category=category,
        level=level,
        data=data or {}
    )


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Sentry Configuration Test ===\n")

    # Set test DSN
    os.environ['SENTRY_DSN'] = 'https://examplePublicKey@o0.ingest.sentry.io/0'
    os.environ['ENVIRONMENT'] = 'test'

    print("1. Initializing Sentry...")
    init_sentry()

    print("\n2. Testing breadcrumb...")
    add_breadcrumb(
        message="User action",
        category="user",
        data={"action": "view_exploits"}
    )

    print("\n3. Testing user context...")
    set_user_context(
        user_id="test_123",
        email="test@example.com",
        tier="pro"
    )

    print("\n4. Testing exception capture...")
    try:
        raise ValueError("This is a test error")
    except Exception as e:
        capture_exception(e, extra_context={
            "test": "This is test context",
            "endpoint": "/test"
        })

    print("\n5. Testing message capture...")
    capture_message(
        "Test message",
        level="info",
        extra_context={"test": True}
    )

    print("\n✅ Sentry configuration ready")
    print("Set SENTRY_DSN environment variable to enable error tracking")
