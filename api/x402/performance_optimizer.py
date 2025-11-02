#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO x402 Performance Optimizer
Optimize payment verification and tracking performance
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

@dataclass
class PerformanceMetrics:
    """Performance metrics for x402 system"""
    payment_verification_time: float
    token_validation_time: float
    cache_hit_rate: float
    concurrent_requests: int
    error_rate: float

class PerformanceOptimizer:
    """
    Performance optimization for x402 payment system

    Features:
    - Connection pooling for blockchain RPC
    - Caching for payment verification results
    - Batch processing for multiple payments
    - Rate limiting and throttling
    - Performance monitoring
    """

    def __init__(self):
        self.cache: Dict[str, dict] = {}
        self.cache_ttl = 300  # 5 minutes
        self.cache_timestamps: Dict[str, float] = {}
        self.thread_pool = ThreadPoolExecutor(max_workers=10)
        self.metrics_history: List[PerformanceMetrics] = []
        self.max_history_size = 1000

    async def batch_verify_payments(
        self,
        payment_requests: List[dict],
        verifier
    ) -> List[dict]:
        """
        Batch verify multiple payments for efficiency

        Args:
            payment_requests: List of payment verification requests
            verifier: PaymentVerifier instance

        Returns:
            List of verification results
        """
        start_time = time.time()

        # Check cache first
        cached_results = []
        uncached_requests = []

        for request in payment_requests:
            cache_key = self._get_cache_key(request)
            cached_result = self._get_cached_result(cache_key)

            if cached_result:
                cached_results.append(cached_result)
            else:
                uncached_requests.append(request)

        # Verify uncached payments
        verification_tasks = []
        for request in uncached_requests:
            task = asyncio.create_task(
                self._verify_single_payment(request, verifier)
            )
            verification_tasks.append(task)

        # Wait for all verifications to complete
        verification_results = await asyncio.gather(*verification_tasks)

        # Cache new results
        for result in verification_results:
            if result['is_valid']:
                cache_key = self._get_cache_key({
                    'tx_hash': result['tx_hash'],
                    'chain': result['chain']
                })
                self._cache_result(cache_key, result)

        # Combine cached and new results
        all_results = cached_results + verification_results

        # Record metrics
        verification_time = time.time() - start_time
        cache_hit_rate = len(cached_results) / len(payment_requests)

        self._record_metrics(
            payment_verification_time=verification_time,
            cache_hit_rate=cache_hit_rate,
            concurrent_requests=len(payment_requests)
        )

        logger.info(
            f"Batch verified {len(payment_requests)} payments in {verification_time:.2f}s "
            f"(cache hit rate: {cache_hit_rate:.1%})"
        )

        return all_results

    async def _verify_single_payment(self, request: dict, verifier) -> dict:
        """Verify a single payment"""
        try:
            result = await verifier.verify_payment(
                request['tx_hash'],
                request.get('chain', 'base'),
                request.get('expected_amount')
            )

            return {
                'is_valid': result.is_valid,
                'tx_hash': result.tx_hash,
                'chain': result.chain,
                'amount_usdc': float(result.amount_usdc),
                'from_address': result.from_address,
                'risk_score': result.risk_score,
                'error_message': result.error_message
            }
        except Exception as e:
            logger.error(f"Error verifying payment {request['tx_hash']}: {e}")
            return {
                'is_valid': False,
                'tx_hash': request['tx_hash'],
                'chain': request.get('chain', 'base'),
                'amount_usdc': 0.0,
                'from_address': '',
                'risk_score': 1.0,
                'error_message': str(e)
            }

    def _get_cache_key(self, request: dict) -> str:
        """Generate cache key for payment verification"""
        return f"{request['tx_hash']}:{request.get('chain', 'base')}"

    def _get_cached_result(self, cache_key: str) -> Optional[dict]:
        """Get cached verification result"""
        if cache_key in self.cache:
            timestamp = self.cache_timestamps.get(cache_key, 0)
            if time.time() - timestamp < self.cache_ttl:
                return self.cache[cache_key]
            else:
                # Remove expired cache entry
                del self.cache[cache_key]
                del self.cache_timestamps[cache_key]
        return None

    def _cache_result(self, cache_key: str, result: dict):
        """Cache verification result"""
        self.cache[cache_key] = result
        self.cache_timestamps[cache_key] = time.time()

        # Clean up old cache entries if needed
        if len(self.cache) > 10000:  # Max 10k cached entries
            self._cleanup_cache()

    def _cleanup_cache(self):
        """Clean up old cache entries"""
        current_time = time.time()
        expired_keys = [
            key for key, timestamp in self.cache_timestamps.items()
            if current_time - timestamp > self.cache_ttl
        ]

        for key in expired_keys:
            del self.cache[key]
            del self.cache_timestamps[key]

        logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")

    def _record_metrics(
        self,
        payment_verification_time: float,
        cache_hit_rate: float,
        concurrent_requests: int,
        token_validation_time: float = 0.0,
        error_rate: float = 0.0
    ):
        """Record performance metrics"""
        metrics = PerformanceMetrics(
            payment_verification_time=payment_verification_time,
            token_validation_time=token_validation_time,
            cache_hit_rate=cache_hit_rate,
            concurrent_requests=concurrent_requests,
            error_rate=error_rate
        )

        self.metrics_history.append(metrics)

        # Keep history size manageable
        if len(self.metrics_history) > self.max_history_size:
            self.metrics_history = self.metrics_history[-self.max_history_size:]

    def get_performance_stats(self) -> dict:
        """Get current performance statistics"""
        if not self.metrics_history:
            return {}

        recent_metrics = self.metrics_history[-100:]  # Last 100 measurements

        avg_verification_time = sum(
            m.payment_verification_time for m in recent_metrics
        ) / len(recent_metrics)

        avg_cache_hit_rate = sum(
            m.cache_hit_rate for m in recent_metrics
        ) / len(recent_metrics)

        max_concurrent = max(
            m.concurrent_requests for m in recent_metrics
        )

        avg_error_rate = sum(
            m.error_rate for m in recent_metrics
        ) / len(recent_metrics)

        return {
            'avg_verification_time_ms': avg_verification_time * 1000,
            'avg_cache_hit_rate': avg_cache_hit_rate,
            'max_concurrent_requests': max_concurrent,
            'avg_error_rate': avg_error_rate,
            'cache_size': len(self.cache),
            'metrics_history_size': len(self.metrics_history)
        }

    def optimize_cache_settings(self):
        """Dynamically optimize cache settings based on usage patterns"""
        stats = self.get_performance_stats()

        if not stats:
            return

        cache_hit_rate = stats['avg_cache_hit_rate']
        cache_size = stats['cache_size']

        # Adjust cache TTL based on hit rate
        if cache_hit_rate < 0.3 and self.cache_ttl > 60:
            # Low hit rate, reduce TTL to free memory
            self.cache_ttl = max(60, self.cache_ttl // 2)
            logger.info(f"Reduced cache TTL to {self.cache_ttl}s (hit rate: {cache_hit_rate:.1%})")
        elif cache_hit_rate > 0.7 and self.cache_ttl < 1800:
            # High hit rate, increase TTL
            self.cache_ttl = min(1800, self.cache_ttl * 2)
            logger.info(f"Increased cache TTL to {self.cache_ttl}s (hit rate: {cache_hit_rate:.1%})")

        # Clean cache if it's getting too large
        if cache_size > 15000:
            self._cleanup_cache()

    async def warm_cache(self, verifier, common_tx_hashes: List[dict]):
        """Warm cache with common transaction hashes"""
        logger.info(f"Warming cache with {len(common_tx_hashes)} common transactions")

        await self.batch_verify_payments(common_tx_hashes, verifier)

        stats = self.get_performance_stats()
        logger.info(f"Cache warmup complete. Cache size: {stats.get('cache_size', 0)}")

    def clear_cache(self):
        """Clear all cached data"""
        cache_size = len(self.cache)
        self.cache.clear()
        self.cache_timestamps.clear()

        logger.info(f"Cleared cache ({cache_size} entries)")


# Global instance for easy access
performance_optimizer = PerformanceOptimizer()
