"""Payment analytics for PayAI vs native comparison."""

import logging
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PaymentMetrics:
    facilitator: str
    success_rate: float
    avg_latency_ms: float
    total_volume_usdc: Decimal
    unique_users: int
    total_transactions: int


class PaymentAnalytics:
    """Track payment method usage and conversion."""

    def __init__(self, db_session=None):
        self.db_session = db_session
        self.metrics_cache: Dict[str, List[Dict]] = {"payai": [], "kamiyo_native": []}

    async def record_payment_attempt(
        self,
        endpoint: str,
        facilitator: str,
        success: bool,
        latency_ms: int,
        amount_usdc: Optional[Decimal] = None,
        user_address: Optional[str] = None,
        error_reason: Optional[str] = None,
    ):
        record = {
            "timestamp": datetime.utcnow(),
            "endpoint": endpoint,
            "facilitator": facilitator,
            "success": success,
            "latency_ms": latency_ms,
            "amount_usdc": amount_usdc,
            "user_address": user_address,
            "error_reason": error_reason,
        }

        self.metrics_cache[facilitator].append(record)

        status = "OK" if success else "FAIL"
        logger.info(
            f"[{status}] {facilitator}: {endpoint} | {latency_ms}ms | {amount_usdc} USDC"
        )

    async def get_facilitator_performance(self, hours: int = 24) -> Dict[str, PaymentMetrics]:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        metrics = {}

        for facilitator in ["payai", "kamiyo_native"]:
            records = [
                r for r in self.metrics_cache[facilitator] if r["timestamp"] >= cutoff
            ]

            if not records:
                metrics[facilitator] = PaymentMetrics(
                    facilitator=facilitator,
                    success_rate=0.0,
                    avg_latency_ms=0.0,
                    total_volume_usdc=Decimal("0"),
                    unique_users=0,
                    total_transactions=0,
                )
                continue

            total = len(records)
            successes = sum(1 for r in records if r["success"])
            avg_latency = sum(r["latency_ms"] for r in records) / total

            total_volume = sum(
                r["amount_usdc"] for r in records if r["amount_usdc"] is not None
            ) or Decimal("0")

            unique_users = len(
                set(r["user_address"] for r in records if r["user_address"])
            )

            metrics[facilitator] = PaymentMetrics(
                facilitator=facilitator,
                success_rate=successes / total if total > 0 else 0.0,
                avg_latency_ms=avg_latency,
                total_volume_usdc=total_volume,
                unique_users=unique_users,
                total_transactions=total,
            )

        return metrics

    async def get_facilitator_split(self, hours: int = 24) -> Dict[str, float]:
        metrics = await self.get_facilitator_performance(hours)
        total = sum(m.total_transactions for m in metrics.values())

        if total == 0:
            return {"payai": 0.0, "kamiyo_native": 0.0}

        return {
            "payai": (metrics["payai"].total_transactions / total) * 100,
            "kamiyo_native": (metrics["kamiyo_native"].total_transactions / total) * 100,
        }


_analytics_instance: Optional[PaymentAnalytics] = None


def get_payment_analytics() -> PaymentAnalytics:
    global _analytics_instance
    if _analytics_instance is None:
        _analytics_instance = PaymentAnalytics()
    return _analytics_instance
