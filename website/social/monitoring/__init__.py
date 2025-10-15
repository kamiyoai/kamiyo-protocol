# -*- coding: utf-8 -*-
"""
Social Media Monitoring Module
Provides metrics, logging, health checks, and alerting for social media posting
"""

from social.monitoring.metrics import (
    metrics,
    track_post,
    track_post_generation,
    track_api_error,
    set_platform_authentication,
    set_rate_limit_remaining
)

from social.monitoring.structured_logging import (
    get_logger,
    configure_logging,
    log_context
)

from social.monitoring.health_check import (
    HealthChecker,
    check_health
)

from social.monitoring.alerting import (
    AlertManager,
    AlertSeverity,
    Alert
)

__all__ = [
    'metrics',
    'track_post',
    'track_post_generation',
    'track_api_error',
    'set_platform_authentication',
    'set_rate_limit_remaining',
    'get_logger',
    'configure_logging',
    'log_context',
    'HealthChecker',
    'check_health',
    'AlertManager',
    'AlertSeverity',
    'Alert',
]
