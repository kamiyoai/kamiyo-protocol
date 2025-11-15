# -*- coding: utf-8 -*-
"""
Kamiyo Response Metrics
Tracks API response performance: compression, size, optimization

Metrics tracked:
- Response size (before/after compression)
- Compression ratio by algorithm
- Compression time
- Optimization ratio
- Bandwidth savings
- Response time by size

Integrates with Prometheus for monitoring
"""

import time
import logging
from typing import Dict, Any, Optional
from collections import defaultdict
from datetime import datetime, timedelta

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

# Response size metrics
response_size_bytes = Histogram(
    'kamiyo_response_size_bytes',
    'Response size in bytes',
    ['type'],  # 'original' or 'compressed'
    buckets=[100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]
)

# Compression metrics
compression_ratio = Histogram(
    'kamiyo_compression_ratio',
    'Compression ratio (original/compressed)',
    ['algorithm'],  # 'gzip' or 'brotli'
    buckets=[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 8.0, 10.0]
)

compression_time_ms = Histogram(
    'kamiyo_compression_time_milliseconds',
    'Time spent compressing response',
    ['algorithm'],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0]
)

compression_enabled_total = Counter(
    'kamiyo_compression_enabled_total',
    'Total responses with compression enabled',
    ['algorithm']
)

compression_skipped_total = Counter(
    'kamiyo_compression_skipped_total',
    'Total responses where compression was skipped',
    ['reason']  # 'too_small', 'already_compressed', 'wrong_type'
)

# Optimization metrics
optimization_ratio = Histogram(
    'kamiyo_optimization_ratio',
    'Response optimization ratio (original/optimized)',
    buckets=[1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0, 2.5, 3.0]
)

field_filtering_enabled_total = Counter(
    'kamiyo_field_filtering_enabled_total',
    'Total responses with field filtering enabled'
)

# Bandwidth savings
bandwidth_saved_bytes = Counter(
    'kamiyo_bandwidth_saved_bytes_total',
    'Total bandwidth saved through compression and optimization',
    ['type']  # 'compression' or 'optimization'
)

# Response time by size
response_time_by_size_seconds = Histogram(
    'kamiyo_response_time_by_size_seconds',
    'Response time correlated with response size',
    ['size_bucket'],  # 'small', 'medium', 'large', 'xlarge'
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
)

# Streaming metrics
streaming_responses_total = Counter(
    'kamiyo_streaming_responses_total',
    'Total streaming responses',
    ['type']  # 'json', 'csv', 'sse'
)

streaming_items_total = Counter(
    'kamiyo_streaming_items_total',
    'Total items streamed',
    ['type']
)

streaming_duration_seconds = Summary(
    'kamiyo_streaming_duration_seconds',
    'Duration of streaming responses',
    ['type']
)

# ============================================================================
# In-memory statistics (for dashboard/debugging)
# ============================================================================

class ResponseStats:
    """In-memory response statistics"""

    def __init__(self):
        """Initialize response stats"""
        self.reset()

    def reset(self):
        """Reset all statistics"""
        self.total_responses = 0
        self.compressed_responses = 0
        self.optimized_responses = 0

        # Size tracking
        self.total_original_bytes = 0
        self.total_compressed_bytes = 0
        self.total_optimized_bytes = 0

        # Compression algorithm usage
        self.compression_algorithm_count = defaultdict(int)

        # Compression ratio stats
        self.compression_ratios = []

        # Optimization ratio stats
        self.optimization_ratios = []

        # Response time stats
        self.response_times = []

        # Last reset time
        self.reset_time = datetime.utcnow()

    def get_summary(self) -> Dict[str, Any]:
        """
        Get statistics summary

        Returns:
            Dictionary with summary statistics
        """
        # Calculate averages
        avg_compression_ratio = (
            sum(self.compression_ratios) / len(self.compression_ratios)
            if self.compression_ratios else 0
        )

        avg_optimization_ratio = (
            sum(self.optimization_ratios) / len(self.optimization_ratios)
            if self.optimization_ratios else 0
        )

        avg_response_time = (
            sum(self.response_times) / len(self.response_times)
            if self.response_times else 0
        )

        # Calculate bandwidth savings
        compression_savings = self.total_original_bytes - self.total_compressed_bytes
        optimization_savings = self.total_original_bytes - self.total_optimized_bytes

        return {
            'total_responses': self.total_responses,
            'compressed_responses': self.compressed_responses,
            'optimized_responses': self.optimized_responses,
            'compression_rate': (
                self.compressed_responses / self.total_responses
                if self.total_responses > 0 else 0
            ),
            'total_original_bytes': self.total_original_bytes,
            'total_compressed_bytes': self.total_compressed_bytes,
            'total_optimized_bytes': self.total_optimized_bytes,
            'compression_savings_bytes': compression_savings,
            'optimization_savings_bytes': optimization_savings,
            'total_savings_bytes': compression_savings + optimization_savings,
            'avg_compression_ratio': round(avg_compression_ratio, 2),
            'avg_optimization_ratio': round(avg_optimization_ratio, 2),
            'avg_response_time_ms': round(avg_response_time * 1000, 2),
            'compression_algorithm_count': dict(self.compression_algorithm_count),
            'time_period_hours': (datetime.utcnow() - self.reset_time).total_seconds() / 3600
        }


# Global stats instance
_stats = ResponseStats()


# ============================================================================
# Tracking functions
# ============================================================================

def track_response_size(size_type: str, size_bytes: int):
    """
    Track response size

    Args:
        size_type: 'original' or 'compressed'
        size_bytes: Size in bytes
    """
    response_size_bytes.labels(type=size_type).observe(size_bytes)

    if size_type == 'original':
        _stats.total_original_bytes += size_bytes
    elif size_type == 'compressed':
        _stats.total_compressed_bytes += size_bytes


def track_compression_ratio(algorithm: str, ratio: float):
    """
    Track compression ratio

    Args:
        algorithm: 'gzip' or 'brotli'
        ratio: Compression ratio (original/compressed)
    """
    compression_ratio.labels(algorithm=algorithm).observe(ratio)
    compression_enabled_total.labels(algorithm=algorithm).inc()

    _stats.compressed_responses += 1
    _stats.compression_algorithm_count[algorithm] += 1
    _stats.compression_ratios.append(ratio)


def track_compression_time(algorithm: str, time_ms: float):
    """
    Track compression time

    Args:
        algorithm: 'gzip' or 'brotli'
        time_ms: Time in milliseconds
    """
    compression_time_ms.labels(algorithm=algorithm).observe(time_ms)


def track_compression_skipped(reason: str):
    """
    Track skipped compression

    Args:
        reason: Reason for skipping ('too_small', 'already_compressed', 'wrong_type')
    """
    compression_skipped_total.labels(reason=reason).inc()


def track_optimization_ratio(ratio: float):
    """
    Track response optimization ratio

    Args:
        ratio: Optimization ratio (original/optimized)
    """
    optimization_ratio.observe(ratio)

    _stats.optimized_responses += 1
    _stats.optimization_ratios.append(ratio)


def track_field_filtering():
    """Track field filtering usage"""
    field_filtering_enabled_total.inc()


def track_bandwidth_saved(save_type: str, bytes_saved: int):
    """
    Track bandwidth savings

    Args:
        save_type: 'compression' or 'optimization'
        bytes_saved: Bytes saved
    """
    bandwidth_saved_bytes.labels(type=save_type).inc(bytes_saved)


def track_response_time(response_time_seconds: float, response_size_bytes: int):
    """
    Track response time by size bucket

    Args:
        response_time_seconds: Response time in seconds
        response_size_bytes: Response size in bytes
    """
    # Determine size bucket
    if response_size_bytes < 1000:
        size_bucket = 'small'
    elif response_size_bytes < 10000:
        size_bucket = 'medium'
    elif response_size_bytes < 100000:
        size_bucket = 'large'
    else:
        size_bucket = 'xlarge'

    response_time_by_size_seconds.labels(size_bucket=size_bucket).observe(response_time_seconds)

    _stats.total_responses += 1
    _stats.response_times.append(response_time_seconds)


def track_streaming_response(stream_type: str):
    """
    Track streaming response

    Args:
        stream_type: 'json', 'csv', or 'sse'
    """
    streaming_responses_total.labels(type=stream_type).inc()


def track_streaming_items(stream_type: str, item_count: int):
    """
    Track items streamed

    Args:
        stream_type: 'json', 'csv', or 'sse'
        item_count: Number of items streamed
    """
    streaming_items_total.labels(type=stream_type).inc(item_count)


def track_streaming_duration(stream_type: str, duration_seconds: float):
    """
    Track streaming duration

    Args:
        stream_type: 'json', 'csv', or 'sse'
        duration_seconds: Duration in seconds
    """
    streaming_duration_seconds.labels(type=stream_type).observe(duration_seconds)


# ============================================================================
# Statistics retrieval
# ============================================================================

def get_compression_stats() -> Dict[str, Any]:
    """
    Get compression statistics

    Returns:
        Dictionary with compression stats
    """
    return _stats.get_summary()


def reset_stats():
    """Reset all statistics"""
    _stats.reset()
    logger.info("Response statistics reset")


def get_bandwidth_savings(hours: int = 24) -> Dict[str, Any]:
    """
    Calculate bandwidth savings over time period

    Args:
        hours: Time period in hours

    Returns:
        Dictionary with bandwidth savings
    """
    summary = _stats.get_summary()

    # Calculate hourly rates
    time_period_hours = summary['time_period_hours']
    if time_period_hours == 0:
        return {
            'period_hours': hours,
            'compression_savings_bytes': 0,
            'optimization_savings_bytes': 0,
            'total_savings_bytes': 0,
            'compression_savings_mb': 0,
            'optimization_savings_mb': 0,
            'total_savings_mb': 0
        }

    # Extrapolate to requested time period
    factor = hours / time_period_hours

    compression_savings = int(summary['compression_savings_bytes'] * factor)
    optimization_savings = int(summary['optimization_savings_bytes'] * factor)
    total_savings = compression_savings + optimization_savings

    return {
        'period_hours': hours,
        'compression_savings_bytes': compression_savings,
        'optimization_savings_bytes': optimization_savings,
        'total_savings_bytes': total_savings,
        'compression_savings_mb': round(compression_savings / (1024 * 1024), 2),
        'optimization_savings_mb': round(optimization_savings / (1024 * 1024), 2),
        'total_savings_mb': round(total_savings / (1024 * 1024), 2)
    }


# ============================================================================
# Context managers for timing
# ============================================================================

class CompressionTimer:
    """Context manager for timing compression"""

    def __init__(self, algorithm: str):
        """
        Initialize compression timer

        Args:
            algorithm: 'gzip' or 'brotli'
        """
        self.algorithm = algorithm
        self.start_time = None

    def __enter__(self):
        """Start timer"""
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop timer and track metrics"""
        if self.start_time:
            elapsed_ms = (time.time() - self.start_time) * 1000
            track_compression_time(self.algorithm, elapsed_ms)


class ResponseTimer:
    """Context manager for timing response processing"""

    def __init__(self, response_size_bytes: int):
        """
        Initialize response timer

        Args:
            response_size_bytes: Response size for correlation
        """
        self.response_size_bytes = response_size_bytes
        self.start_time = None

    def __enter__(self):
        """Start timer"""
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop timer and track metrics"""
        if self.start_time:
            elapsed_seconds = time.time() - self.start_time
            track_response_time(elapsed_seconds, self.response_size_bytes)


class StreamingTimer:
    """Context manager for timing streaming responses"""

    def __init__(self, stream_type: str):
        """
        Initialize streaming timer

        Args:
            stream_type: 'json', 'csv', or 'sse'
        """
        self.stream_type = stream_type
        self.start_time = None

    def __enter__(self):
        """Start timer"""
        self.start_time = time.time()
        track_streaming_response(self.stream_type)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop timer and track metrics"""
        if self.start_time:
            elapsed_seconds = time.time() - self.start_time
            track_streaming_duration(self.stream_type, elapsed_seconds)
