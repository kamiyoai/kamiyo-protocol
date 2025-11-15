# -*- coding: utf-8 -*-
"""
Monitoring Package Initialization
Integrates Prometheus, Sentry, Alerts, and Logging
"""

import os
import time
from .prometheus_metrics import (
    get_metrics,
    track_api_request,
    track_db_query,
    track_aggregator_fetch,
    set_app_info,
    update_uptime,
    update_database_metrics,
    update_source_health_metrics
)
from .sentry_config import (
    init_sentry,
    capture_exception,
    capture_message,
    set_user_context,
    add_breadcrumb
)
from .structured_logging import (
    setup_logging,
    get_logger,
    log_api_request,
    log_aggregator_fetch,
    log_exploit_detected,
    log_error
)
from .alerts import get_alert_manager, AlertLevel

# Application start time
APP_START_TIME = time.time()

def initialize_monitoring():
    """Initialize all monitoring systems"""

    # 1. Setup structured logging
    setup_logging(
        level=os.getenv('LOG_LEVEL', 'INFO'),
        format=os.getenv('LOG_FORMAT', 'json')
    )

    logger = get_logger(__name__, service='monitoring')
    logger.info("Initializing monitoring systems...")

    # 2. Initialize Sentry
    try:
        init_sentry()
        logger.info("✓ Sentry initialized")
    except Exception as e:
        logger.warning(f"Sentry initialization failed: {e}")

    # 3. Set app info for Prometheus
    try:
        set_app_info(
            version=os.getenv('APP_VERSION', '2.0.0'),
            environment=os.getenv('ENVIRONMENT', 'development'),
            commit=os.getenv('GIT_COMMIT', 'unknown')
        )
        logger.info("✓ Prometheus metrics configured")
    except Exception as e:
        logger.warning(f"Prometheus initialization failed: {e}")

    # 4. Initialize alert manager
    try:
        alert_mgr = get_alert_manager()
        logger.info(f"✓ Alert manager initialized: {alert_mgr.enabled_channels}")
    except Exception as e:
        logger.warning(f"Alert manager initialization failed: {e}")

    logger.info("Monitoring initialization complete")

__all__ = [
    # Metrics
    'get_metrics',
    'track_api_request',
    'track_db_query',
    'track_aggregator_fetch',
    'set_app_info',
    'update_uptime',
    'update_database_metrics',
    'update_source_health_metrics',

    # Sentry
    'init_sentry',
    'capture_exception',
    'capture_message',
    'set_user_context',
    'add_breadcrumb',

    # Logging
    'setup_logging',
    'get_logger',
    'log_api_request',
    'log_aggregator_fetch',
    'log_exploit_detected',
    'log_error',

    # Alerts
    'get_alert_manager',
    'AlertLevel',

    # Initialization
    'initialize_monitoring',
    'APP_START_TIME'
]
