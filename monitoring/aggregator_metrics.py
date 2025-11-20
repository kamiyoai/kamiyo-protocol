# -*- coding: utf-8 -*-
"""
Kamiyo Aggregator Performance Metrics
Tracks aggregator execution performance and reliability

Metrics tracked:
- Execution duration per source
- Success/failure rate per source
- Exploits discovered per source
- Circuit breaker state tracking
- Aggregation cycle time
- Source reliability scores

Integrates with Prometheus for monitoring
"""

import logging
from typing import Dict, Any
from datetime import datetime

from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    Summary
)

logger = logging.getLogger(__name__)

# ============================================================================
# Prometheus Metrics
# ============================================================================

# Aggregator execution metrics
aggregator_execution_duration_seconds = Histogram(
    'kamiyo_aggregator_execution_duration_seconds',
    'Aggregator execution duration',
    ['source_name'],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0, 60.0]
)

aggregator_success_total = Counter(
    'kamiyo_aggregator_success_total',
    'Total successful aggregator executions',
    ['source_name']
)

aggregator_failure_total = Counter(
    'kamiyo_aggregator_failure_total',
    'Total failed aggregator executions',
    ['source_name', 'reason']
)

aggregator_exploits_found = Histogram(
    'kamiyo_aggregator_exploits_found',
    'Number of exploits found per execution',
    ['source_name'],
    buckets=[0, 1, 2, 5, 10, 20, 50, 100]
)

# Circuit breaker metrics
circuit_breaker_state = Gauge(
    'kamiyo_circuit_breaker_state',
    'Circuit breaker state (0=closed, 1=half_open, 2=open)',
    ['source_name']
)

circuit_breaker_transitions_total = Counter(
    'kamiyo_circuit_breaker_transitions_total',
    'Total circuit breaker state transitions',
    ['source_name', 'from_state', 'to_state']
)

circuit_breaker_open_duration_seconds = Summary(
    'kamiyo_circuit_breaker_open_duration_seconds',
    'Duration circuit breaker spent in OPEN state',
    ['source_name']
)

# Aggregation cycle metrics
aggregation_cycle_duration_seconds = Histogram(
    'kamiyo_aggregation_cycle_duration_seconds',
    'Full aggregation cycle duration',
    buckets=[5.0, 10.0, 15.0, 20.0, 30.0, 45.0, 60.0, 90.0, 120.0]
)

aggregation_cycle_total = Counter(
    'kamiyo_aggregation_cycle_total',
    'Total aggregation cycles executed'
)

# Source reliability
source_reliability_score = Gauge(
    'kamiyo_source_reliability_score',
    'Source reliability score (0-100)',
    ['source_name']
)

# Rate limiting metrics
rate_limit_hits_total = Counter(
    'kamiyo_rate_limit_hits_total',
    'Total rate limit hits',
    ['source_name']
)

rate_limit_backoff_duration_seconds = Summary(
    'kamiyo_rate_limit_backoff_duration_seconds',
    'Duration of rate limit backoff',
    ['source_name']
)

# Deduplication metrics
duplicate_exploits_filtered_total = Counter(
    'kamiyo_duplicate_exploits_filtered_total',
    'Total duplicate exploits filtered',
    ['method']  # 'exact', 'fuzzy'
)

# ============================================================================
# Tracking functions
# ============================================================================

def track_aggregator_execution(source_name: str, duration: float):
    """
    Track aggregator execution duration

    Args:
        source_name: Name of aggregation source
        duration: Execution duration in seconds
    """
    aggregator_execution_duration_seconds.labels(source_name=source_name).observe(duration)


def track_aggregator_success(source_name: str, exploits_found: int):
    """
    Track successful aggregator execution

    Args:
        source_name: Name of aggregation source
        exploits_found: Number of exploits found
    """
    aggregator_success_total.labels(source_name=source_name).inc()
    aggregator_exploits_found.labels(source_name=source_name).observe(exploits_found)


def track_aggregator_failure(source_name: str, reason: str):
    """
    Track failed aggregator execution

    Args:
        source_name: Name of aggregation source
        reason: Failure reason ('timeout', 'error', etc.)
    """
    aggregator_failure_total.labels(source_name=source_name, reason=reason).inc()


def track_circuit_breaker_state_change(source_name: str, from_state: str, to_state: str):
    """
    Track circuit breaker state transition

    Args:
        source_name: Name of aggregation source
        from_state: Previous state
        to_state: New state
    """
    circuit_breaker_transitions_total.labels(
        source_name=source_name,
        from_state=from_state,
        to_state=to_state
    ).inc()

    # Update state gauge
    state_value = {'closed': 0, 'half_open': 1, 'open': 2}.get(to_state, -1)
    circuit_breaker_state.labels(source_name=source_name).set(state_value)


def track_circuit_breaker_open_time(source_name: str, duration: float):
    """
    Track time circuit breaker spent in OPEN state

    Args:
        source_name: Name of aggregation source
        duration: Duration in seconds
    """
    circuit_breaker_open_duration_seconds.labels(source_name=source_name).observe(duration)


def track_aggregation_cycle_time(duration: float):
    """
    Track full aggregation cycle time

    Args:
        duration: Duration in seconds
    """
    aggregation_cycle_duration_seconds.observe(duration)
    aggregation_cycle_total.inc()


def track_source_reliability(source_name: str, score: float):
    """
    Track source reliability score

    Args:
        source_name: Name of aggregation source
        score: Reliability score (0-100)
    """
    source_reliability_score.labels(source_name=source_name).set(score)


def track_rate_limit_hit(source_name: str):
    """
    Track rate limit hit

    Args:
        source_name: Name of aggregation source
    """
    rate_limit_hits_total.labels(source_name=source_name).inc()


def track_rate_limit_backoff(source_name: str, duration: float):
    """
    Track rate limit backoff duration

    Args:
        source_name: Name of aggregation source
        duration: Backoff duration in seconds
    """
    rate_limit_backoff_duration_seconds.labels(source_name=source_name).observe(duration)


def track_duplicate_filtered(method: str):
    """
    Track duplicate exploit filtered

    Args:
        method: Deduplication method ('exact', 'fuzzy')
    """
    duplicate_exploits_filtered_total.labels(method=method).inc()


# ============================================================================
# Statistics retrieval
# ============================================================================

def get_aggregator_stats() -> Dict[str, Any]:
    """
    Get aggregator statistics summary

    Returns:
        Dictionary with statistics
    """
    # Note: This is a placeholder. In production, you would query Prometheus
    # or maintain in-memory statistics
    return {
        'note': 'Query Prometheus for detailed metrics',
        'metrics_available': [
            'kamiyo_aggregator_execution_duration_seconds',
            'kamiyo_aggregator_success_total',
            'kamiyo_aggregator_failure_total',
            'kamiyo_aggregator_exploits_found',
            'kamiyo_circuit_breaker_state',
            'kamiyo_aggregation_cycle_duration_seconds',
            'kamiyo_source_reliability_score'
        ]
    }
