"""Performance optimization for x402 payments."""

import asyncio
import logging
import time
from typing import Dict, List, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetrics:
    payment_verification_time: float
    token_validation_time: float
    cache_hit_rate: float
    concurrent_requests: int
    error_rate: float


class PerformanceOptimizer:
    """Caching and batch verification for payment system."""

    def __init__(self):
        self.cache: Dict[str, dict] = {}
        self.cache_ttl = 300
        self.cache_timestamps: Dict[str, float] = {}
        self.thread_pool = ThreadPoolExecutor(max_workers=10)
        self.metrics_history: List[PerformanceMetrics] = []
        self.max_history = 1000

    async def batch_verify_payments(self, requests: List[dict], verifier) -> List[dict]:
        start = time.time()

        cached, uncached = [], []
        for req in requests:
            key = self._cache_key(req)
            result = self._get_cached(key)
            if result:
                cached.append(result)
            else:
                uncached.append(req)

        tasks = [
            asyncio.create_task(self._verify_single(req, verifier)) for req in uncached
        ]
        results = await asyncio.gather(*tasks)

        for result in results:
            if result["is_valid"]:
                key = self._cache_key({"tx_hash": result["tx_hash"], "chain": result["chain"]})
                self._set_cached(key, result)

        self._record_metrics(
            verification_time=time.time() - start,
            cache_hit_rate=len(cached) / len(requests) if requests else 0,
            concurrent_requests=len(requests),
        )

        return cached + results

    async def _verify_single(self, req: dict, verifier) -> dict:
        try:
            result = await verifier.verify_payment(
                req["tx_hash"], req.get("chain", "base"), req.get("expected_amount")
            )
            return {
                "is_valid": result.is_valid,
                "tx_hash": result.tx_hash,
                "chain": result.chain,
                "amount_usdc": float(result.amount_usdc),
                "from_address": result.from_address,
                "risk_score": result.risk_score,
                "error_message": result.error_message,
            }
        except Exception as e:
            logger.error(f"Verification error for {req['tx_hash']}: {e}")
            return {
                "is_valid": False,
                "tx_hash": req["tx_hash"],
                "chain": req.get("chain", "base"),
                "amount_usdc": 0.0,
                "from_address": "",
                "risk_score": 1.0,
                "error_message": str(e),
            }

    def _cache_key(self, req: dict) -> str:
        return f"{req['tx_hash']}:{req.get('chain', 'base')}"

    def _get_cached(self, key: str) -> Optional[dict]:
        if key in self.cache:
            if time.time() - self.cache_timestamps.get(key, 0) < self.cache_ttl:
                return self.cache[key]
            del self.cache[key]
            del self.cache_timestamps[key]
        return None

    def _set_cached(self, key: str, result: dict):
        self.cache[key] = result
        self.cache_timestamps[key] = time.time()

        if len(self.cache) > 10000:
            self._cleanup_cache()

    def _cleanup_cache(self):
        now = time.time()
        expired = [k for k, ts in self.cache_timestamps.items() if now - ts > self.cache_ttl]
        for key in expired:
            del self.cache[key]
            del self.cache_timestamps[key]

    def _record_metrics(
        self,
        verification_time: float,
        cache_hit_rate: float,
        concurrent_requests: int,
        token_validation_time: float = 0.0,
        error_rate: float = 0.0,
    ):
        self.metrics_history.append(
            PerformanceMetrics(
                payment_verification_time=verification_time,
                token_validation_time=token_validation_time,
                cache_hit_rate=cache_hit_rate,
                concurrent_requests=concurrent_requests,
                error_rate=error_rate,
            )
        )
        if len(self.metrics_history) > self.max_history:
            self.metrics_history = self.metrics_history[-self.max_history :]

    def get_stats(self) -> dict:
        if not self.metrics_history:
            return {}

        recent = self.metrics_history[-100:]
        return {
            "avg_verification_time_ms": sum(m.payment_verification_time for m in recent)
            / len(recent)
            * 1000,
            "avg_cache_hit_rate": sum(m.cache_hit_rate for m in recent) / len(recent),
            "max_concurrent_requests": max(m.concurrent_requests for m in recent),
            "avg_error_rate": sum(m.error_rate for m in recent) / len(recent),
            "cache_size": len(self.cache),
        }

    def clear_cache(self):
        self.cache.clear()
        self.cache_timestamps.clear()


performance_optimizer = PerformanceOptimizer()
