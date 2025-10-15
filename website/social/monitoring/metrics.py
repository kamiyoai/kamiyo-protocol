# -*- coding: utf-8 -*-
"""
Prometheus Metrics for Social Media Posting
Tracks performance, errors, and platform health
"""

import time
from contextlib import contextmanager
from typing import Optional
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    CollectorRegistry,
    generate_latest,
    CONTENT_TYPE_LATEST
)

# Create registry for metrics
registry = CollectorRegistry()

# Counter: Total posts by platform and status
posts_total = Counter(
    'social_posts_total',
    'Total number of social media posts',
    ['platform', 'status'],
    registry=registry
)

# Histogram: Post generation duration
post_generation_duration_seconds = Histogram(
    'social_post_generation_duration_seconds',
    'Time taken to generate post content',
    ['platform'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
    registry=registry
)

# Histogram: Post API call duration
post_api_duration_seconds = Histogram(
    'social_post_api_duration_seconds',
    'Time taken for platform API calls',
    ['platform'],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
    registry=registry
)

# Gauge: Platform authentication status
platform_authenticated = Gauge(
    'social_platform_authenticated',
    'Whether platform is currently authenticated (1=yes, 0=no)',
    ['platform'],
    registry=registry
)

# Counter: API errors by platform and error type
api_errors_total = Counter(
    'social_api_errors_total',
    'Total number of API errors by platform',
    ['platform', 'error_type'],
    registry=registry
)

# Gauge: Rate limit remaining
rate_limit_remaining = Gauge(
    'social_rate_limit_remaining',
    'Remaining rate limit for platform',
    ['platform'],
    registry=registry
)

# Counter: Retries by platform
retries_total = Counter(
    'social_retries_total',
    'Total number of retry attempts',
    ['platform'],
    registry=registry
)

# Histogram: Queue processing time
queue_processing_duration_seconds = Histogram(
    'social_queue_processing_duration_seconds',
    'Time taken to process exploit from queue',
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0],
    registry=registry
)

# Gauge: Posts in queue
posts_in_queue = Gauge(
    'social_posts_in_queue',
    'Number of posts waiting in queue',
    ['status'],
    registry=registry
)

# Counter: Content validation failures
validation_failures_total = Counter(
    'social_validation_failures_total',
    'Total number of content validation failures',
    ['platform', 'reason'],
    registry=registry
)


class MetricsCollector:
    """Helper class for collecting metrics"""

    def __init__(self):
        self.registry = registry

    @contextmanager
    def track_post_generation(self, platform: str):
        """
        Context manager to track post generation duration

        Args:
            platform: Platform name (reddit, discord, telegram, x_twitter)
        """
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            post_generation_duration_seconds.labels(platform=platform).observe(duration)

    @contextmanager
    def track_api_call(self, platform: str):
        """
        Context manager to track API call duration

        Args:
            platform: Platform name
        """
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            post_api_duration_seconds.labels(platform=platform).observe(duration)

    @contextmanager
    def track_queue_processing(self):
        """Context manager to track queue processing duration"""
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            queue_processing_duration_seconds.observe(duration)

    def record_post(self, platform: str, status: str):
        """
        Record a post attempt

        Args:
            platform: Platform name
            status: Post status (success, failed, rate_limited, validation_failed)
        """
        posts_total.labels(platform=platform, status=status).inc()

    def record_api_error(self, platform: str, error_type: str):
        """
        Record an API error

        Args:
            platform: Platform name
            error_type: Type of error (auth_failed, rate_limit, api_error, timeout, network_error)
        """
        api_errors_total.labels(platform=platform, error_type=error_type).inc()

    def record_retry(self, platform: str):
        """
        Record a retry attempt

        Args:
            platform: Platform name
        """
        retries_total.labels(platform=platform).inc()

    def record_validation_failure(self, platform: str, reason: str):
        """
        Record a content validation failure

        Args:
            platform: Platform name
            reason: Validation failure reason (too_long, invalid_format, missing_field)
        """
        validation_failures_total.labels(platform=platform, reason=reason).inc()

    def set_authentication_status(self, platform: str, authenticated: bool):
        """
        Set platform authentication status

        Args:
            platform: Platform name
            authenticated: Whether authenticated
        """
        platform_authenticated.labels(platform=platform).set(1 if authenticated else 0)

    def set_rate_limit(self, platform: str, remaining: int):
        """
        Set remaining rate limit for platform

        Args:
            platform: Platform name
            remaining: Number of requests remaining
        """
        rate_limit_remaining.labels(platform=platform).set(remaining)

    def set_queue_size(self, status: str, count: int):
        """
        Set number of posts in queue by status

        Args:
            status: Post status (pending, in_progress, failed)
            count: Number of posts
        """
        posts_in_queue.labels(status=status).set(count)

    def get_metrics(self) -> bytes:
        """
        Get Prometheus metrics in text format

        Returns:
            Metrics in Prometheus text format
        """
        return generate_latest(self.registry)

    def get_content_type(self) -> str:
        """Get content type for metrics endpoint"""
        return CONTENT_TYPE_LATEST


# Global metrics collector instance
metrics = MetricsCollector()


# Convenience functions for backward compatibility
def track_post(platform: str, status: str):
    """Record a post attempt"""
    metrics.record_post(platform, status)


@contextmanager
def track_post_generation(platform: str):
    """Track post generation duration"""
    with metrics.track_post_generation(platform):
        yield


@contextmanager
def track_api_call(platform: str):
    """Track API call duration"""
    with metrics.track_api_call(platform):
        yield


def track_api_error(platform: str, error_type: str):
    """Record an API error"""
    metrics.record_api_error(platform, error_type)


def set_platform_authentication(platform: str, authenticated: bool):
    """Set platform authentication status"""
    metrics.set_authentication_status(platform, authenticated)


def set_rate_limit_remaining(platform: str, remaining: int):
    """Set remaining rate limit"""
    metrics.set_rate_limit(platform, remaining)


def track_retry(platform: str):
    """Record a retry attempt"""
    metrics.record_retry(platform)


def record_generation_duration(operation: str, duration: float):
    """
    Record duration of a generation operation

    Args:
        operation: Operation name (report_analysis, post_generation, etc.)
        duration: Duration in seconds
    """
    # Use a generic platform label for non-platform-specific operations
    post_generation_duration_seconds.labels(platform=operation).observe(duration)


def record_api_duration(platform: str, duration: float):
    """
    Record duration of an API call

    Args:
        platform: Platform name
        duration: Duration in seconds
    """
    post_api_duration_seconds.labels(platform=platform).observe(duration)


# Metrics endpoint handler for Flask/FastAPI
def metrics_endpoint():
    """
    Handler for /metrics endpoint
    Returns Prometheus metrics

    Example usage with Flask:
        @app.route('/metrics')
        def metrics():
            return Response(metrics_endpoint(), mimetype=metrics.get_content_type())

    Example usage with FastAPI:
        @app.get('/metrics')
        def metrics():
            return Response(content=metrics_endpoint(), media_type=metrics.get_content_type())
    """
    return metrics.get_metrics()
