"""
Observability and Monitoring

Provides Prometheus metrics, structured logging, and health checks
for production monitoring.
"""

import time
import logging
from typing import Dict, Any, Optional, Callable
from functools import wraps
from datetime import datetime, timezone
from collections import defaultdict, deque

# Prometheus-compatible metrics (compatible with prometheus_client if installed)
try:
    from prometheus_client import Counter, Histogram, Gauge, Info
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    # Fallback: In-memory metrics for development
    class MetricBase:
        def __init__(self, name, description, labelnames=None):
            self.name = name
            self.description = description
            self.labelnames = labelnames or []
            self.values = defaultdict(float)

        def labels(self, **labels):
            return self

    class Counter(MetricBase):
        def inc(self, amount=1):
            self.values['total'] += amount

    class Histogram(MetricBase):
        def observe(self, amount):
            self.values['sum'] += amount
            self.values['count'] += 1

    class Gauge(MetricBase):
        def set(self, value):
            self.values['current'] = value

        def inc(self, amount=1):
            self.values['current'] += amount

        def dec(self, amount=1):
            self.values['current'] -= amount

    class Info(MetricBase):
        def info(self, data):
            self.values.update(data)


logger = logging.getLogger(__name__)


# ===== API Metrics =====

# Request metrics
api_requests_total = Counter(
    'api_requests_total',
    'Total API requests',
    labelnames=['endpoint', 'method', 'status']
)

api_request_duration = Histogram(
    'api_request_duration_seconds',
    'API request duration',
    labelnames=['endpoint', 'method']
)

api_errors_total = Counter(
    'api_errors_total',
    'Total API errors',
    labelnames=['endpoint', 'error_type']
)


# ===== Detection Metrics =====

# Exploit detection
exploits_detected_total = Counter(
    'exploits_detected_total',
    'Total exploits detected',
    labelnames=['monitor', 'severity', 'category']
)

detection_latency = Histogram(
    'detection_latency_seconds',
    'Time from event to detection',
    labelnames=['monitor']
)

false_positive_rate = Gauge(
    'false_positive_rate',
    'Estimated false positive rate',
    labelnames=['monitor']
)

# Alert metrics
alerts_sent_total = Counter(
    'alerts_sent_total',
    'Total alerts sent',
    labelnames=['channel', 'severity']
)

alert_delivery_failures = Counter(
    'alert_delivery_failures',
    'Failed alert deliveries',
    labelnames=['channel', 'reason']
)


# ===== Monitor Metrics =====

# Monitor health
monitor_runs_total = Counter(
    'monitor_runs_total',
    'Total monitor executions',
    labelnames=['monitor', 'status']
)

monitor_runtime = Histogram(
    'monitor_runtime_seconds',
    'Monitor execution time',
    labelnames=['monitor']
)

monitor_last_run = Gauge(
    'monitor_last_run_timestamp',
    'Timestamp of last monitor run',
    labelnames=['monitor']
)


# ===== ML Metrics =====

# Model performance
ml_predictions_total = Counter(
    'ml_predictions_total',
    'Total ML predictions',
    labelnames=['model', 'prediction_type']
)

ml_model_score = Gauge(
    'ml_model_score',
    'Model quality score (0-1)',
    labelnames=['model', 'metric']
)

ml_feature_importance = Gauge(
    'ml_feature_importance',
    'Feature importance scores',
    labelnames=['model', 'feature']
)


# ===== Data Source Metrics =====

# External API calls
external_api_calls_total = Counter(
    'external_api_calls_total',
    'Total external API calls',
    labelnames=['source', 'status']
)

external_api_latency = Histogram(
    'external_api_latency_seconds',
    'External API response time',
    labelnames=['source']
)

external_api_errors = Counter(
    'external_api_errors_total',
    'External API errors',
    labelnames=['source', 'error_type']
)


# ===== System Metrics =====

# System info
system_info = Info(
    'system_info',
    'System information'
)

# Database metrics
database_connections = Gauge(
    'database_connections_active',
    'Active database connections'
)

database_query_duration = Histogram(
    'database_query_duration_seconds',
    'Database query duration',
    labelnames=['query_type']
)


# ===== Health Status =====

class HealthStatus:
    """Track system health status"""

    def __init__(self):
        self.components = {}
        self.checks = {}

    def register_component(self, name: str, check_func: Callable):
        """Register a health check for a component"""
        self.checks[name] = check_func

    def check_health(self) -> Dict[str, Any]:
        """
        Run all health checks

        Returns:
            Health status dictionary
        """
        results = {}
        overall_healthy = True

        for name, check_func in self.checks.items():
            try:
                status = check_func()
                results[name] = status
                if not status.get('healthy', True):
                    overall_healthy = False
            except Exception as e:
                results[name] = {
                    'healthy': False,
                    'error': str(e)
                }
                overall_healthy = False

        return {
            'healthy': overall_healthy,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'components': results
        }


# Global health checker
health_checker = HealthStatus()


# ===== Decorators =====

def track_time(metric: Histogram, labels: Optional[Dict[str, str]] = None):
    """Decorator to track function execution time"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.time()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start
                if labels:
                    metric.labels(**labels).observe(duration)
                else:
                    metric.observe(duration)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start
                if labels:
                    metric.labels(**labels).observe(duration)
                else:
                    metric.observe(duration)

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def count_calls(metric: Counter, labels: Optional[Dict[str, str]] = None):
    """Decorator to count function calls"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                result = await func(*args, **kwargs)
                if labels:
                    metric.labels(**labels).inc()
                else:
                    metric.inc()
                return result
            except Exception as e:
                if labels:
                    error_labels = {**labels, 'status': 'error'}
                    metric.labels(**error_labels).inc()
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                if labels:
                    metric.labels(**labels).inc()
                else:
                    metric.inc()
                return result
            except Exception as e:
                if labels:
                    error_labels = {**labels, 'status': 'error'}
                    metric.labels(**error_labels).inc()
                raise

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


# ===== Structured Logging =====

class StructuredLogger:
    """
    Structured logging for better observability

    Outputs JSON-formatted logs with consistent fields
    """

    def __init__(self, name: str):
        self.logger = logging.getLogger(name)

    def log(self, level: str, message: str, **context):
        """
        Log with structured context

        Args:
            level: Log level (info, warning, error, etc.)
            message: Log message
            **context: Additional context fields
        """
        # Add standard fields
        log_data = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'message': message,
            **context
        }

        # Format as JSON-like string
        log_str = ' '.join(f"{k}={v}" for k, v in log_data.items())

        # Log at appropriate level
        getattr(self.logger, level.lower())(log_str)

    def info(self, message: str, **context):
        self.log('info', message, **context)

    def warning(self, message: str, **context):
        self.log('warning', message, **context)

    def error(self, message: str, **context):
        self.log('error', message, **context)

    def critical(self, message: str, **context):
        self.log('critical', message, **context)


# ===== Performance Tracking =====

class PerformanceTracker:
    """Track performance metrics over time"""

    def __init__(self, window_size: int = 1000):
        self.window_size = window_size
        self.metrics = defaultdict(lambda: deque(maxlen=window_size))

    def record(self, metric_name: str, value: float):
        """Record a metric value"""
        self.metrics[metric_name].append({
            'value': value,
            'timestamp': time.time()
        })

    def get_stats(self, metric_name: str) -> Dict[str, float]:
        """Get statistics for a metric"""
        values = [m['value'] for m in self.metrics[metric_name]]

        if not values:
            return {}

        import statistics

        return {
            'count': len(values),
            'mean': statistics.mean(values),
            'median': statistics.median(values),
            'stdev': statistics.stdev(values) if len(values) > 1 else 0,
            'min': min(values),
            'max': max(values)
        }


# Global performance tracker
perf_tracker = PerformanceTracker()


# ===== Utility Functions =====

def get_metrics_summary() -> Dict[str, Any]:
    """
    Get summary of all metrics

    Returns:
        Dictionary of metric values
    """
    summary = {}

    if PROMETHEUS_AVAILABLE:
        summary['prometheus_enabled'] = True
        summary['note'] = 'Metrics available at /metrics endpoint'
    else:
        summary['prometheus_enabled'] = False
        summary['note'] = 'Using in-memory metrics (dev mode)'

    # Add performance stats
    summary['performance'] = {
        name: perf_tracker.get_stats(name)
        for name in list(perf_tracker.metrics.keys())[:10]  # Limit to 10
    }

    return summary


def initialize_observability(app_name: str = 'kamiyo-hyperliquid'):
    """
    Initialize observability system

    Args:
        app_name: Application name for metrics
    """
    # Set system info
    system_info.info({
        'app': app_name,
        'version': '1.0.0',
        'python_version': '3.10+',
        'prometheus_enabled': str(PROMETHEUS_AVAILABLE)
    })

    # Register default health checks
    health_checker.register_component('system', lambda: {
        'healthy': True,
        'timestamp': datetime.now(timezone.utc).isoformat()
    })

    logger.info(f"Observability initialized for {app_name}")


# Auto-initialize
initialize_observability()
