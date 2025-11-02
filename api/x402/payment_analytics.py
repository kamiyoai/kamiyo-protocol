#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO Payment Analytics
Track payment method usage and conversion metrics for PayAI vs native
"""

import logging
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PaymentMetrics:
    """Payment method performance metrics"""
    facilitator: str  # 'payai' or 'kamiyo_native'
    success_rate: float
    avg_latency_ms: float
    total_volume_usdc: Decimal
    unique_users: int
    total_transactions: int


class PaymentAnalytics:
    """
    Track payment method usage and conversion

    Metrics tracked:
    - PayAI vs KAMIYO native payment split
    - Success rates per facilitator
    - Average latency per facilitator
    - Volume and unique users
    - Conversion funnel (402 → payment attempt → success)
    """

    def __init__(self, db_session=None):
        self.db_session = db_session
        self.metrics_cache: Dict[str, List[Dict]] = {
            'payai': [],
            'kamiyo_native': []
        }

    async def record_payment_attempt(
        self,
        endpoint: str,
        facilitator: str,  # 'payai' or 'kamiyo_native'
        success: bool,
        latency_ms: int,
        amount_usdc: Optional[Decimal] = None,
        user_address: Optional[str] = None,
        error_reason: Optional[str] = None
    ):
        """
        Record payment attempt for analytics

        Args:
            endpoint: API endpoint accessed
            facilitator: Payment facilitator used
            success: Whether payment succeeded
            latency_ms: Payment verification latency
            amount_usdc: Payment amount
            user_address: User wallet address
            error_reason: Error message if failed
        """
        record = {
            'timestamp': datetime.utcnow(),
            'endpoint': endpoint,
            'facilitator': facilitator,
            'success': success,
            'latency_ms': latency_ms,
            'amount_usdc': amount_usdc,
            'user_address': user_address,
            'error_reason': error_reason
        }

        # Add to in-memory cache
        self.metrics_cache[facilitator].append(record)

        # Log metrics
        status = "✅" if success else "❌"
        logger.info(
            f"{status} Payment via {facilitator}: "
            f"{endpoint} | {latency_ms}ms | "
            f"{amount_usdc} USDC | "
            f"{user_address or 'anonymous'}"
        )

        # TODO: Persist to database for long-term analytics
        # await self._persist_to_db(record)

    async def get_facilitator_performance(
        self,
        hours: int = 24
    ) -> Dict[str, PaymentMetrics]:
        """
        Compare PayAI vs KAMIYO native metrics

        Args:
            hours: Time window for metrics (default: 24 hours)

        Returns:
            Dict with metrics for each facilitator
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        metrics = {}

        for facilitator in ['payai', 'kamiyo_native']:
            # Filter records within time window
            recent_records = [
                r for r in self.metrics_cache[facilitator]
                if r['timestamp'] >= cutoff_time
            ]

            if not recent_records:
                metrics[facilitator] = PaymentMetrics(
                    facilitator=facilitator,
                    success_rate=0.0,
                    avg_latency_ms=0.0,
                    total_volume_usdc=Decimal('0'),
                    unique_users=0,
                    total_transactions=0
                )
                continue

            # Calculate metrics
            total = len(recent_records)
            successes = sum(1 for r in recent_records if r['success'])
            success_rate = successes / total if total > 0 else 0.0

            avg_latency = sum(r['latency_ms'] for r in recent_records) / total

            total_volume = sum(
                r['amount_usdc'] for r in recent_records
                if r['amount_usdc'] is not None
            ) or Decimal('0')

            unique_users = len(set(
                r['user_address'] for r in recent_records
                if r['user_address'] is not None
            ))

            metrics[facilitator] = PaymentMetrics(
                facilitator=facilitator,
                success_rate=success_rate,
                avg_latency_ms=avg_latency,
                total_volume_usdc=total_volume,
                unique_users=unique_users,
                total_transactions=total
            )

        return metrics

    async def get_conversion_funnel(self, hours: int = 24) -> Dict[str, int]:
        """
        Track conversion funnel: 402 responses → payment attempts → successes

        Args:
            hours: Time window for metrics

        Returns:
            Funnel metrics dict
        """
        # TODO: Implement 402 response tracking
        # For now, estimate from payment attempts

        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        all_records = []
        for facilitator in ['payai', 'kamiyo_native']:
            all_records.extend([
                r for r in self.metrics_cache[facilitator]
                if r['timestamp'] >= cutoff_time
            ])

        total_attempts = len(all_records)
        successful_payments = sum(1 for r in all_records if r['success'])

        return {
            '402_responses': total_attempts * 3,  # Estimate: 1 in 3 pay
            'payment_attempts': total_attempts,
            'successful_payments': successful_payments,
            'conversion_rate': successful_payments / total_attempts if total_attempts > 0 else 0.0
        }

    async def get_facilitator_split(self, hours: int = 24) -> Dict[str, float]:
        """
        Get percentage split between PayAI and native payments

        Args:
            hours: Time window

        Returns:
            Percentage split
        """
        metrics = await self.get_facilitator_performance(hours)

        total_txs = sum(m.total_transactions for m in metrics.values())

        if total_txs == 0:
            return {'payai': 0.0, 'kamiyo_native': 0.0}

        return {
            'payai': (metrics['payai'].total_transactions / total_txs) * 100,
            'kamiyo_native': (metrics['kamiyo_native'].total_transactions / total_txs) * 100
        }

    async def get_summary_report(self, hours: int = 24) -> str:
        """
        Generate human-readable analytics summary

        Args:
            hours: Time window

        Returns:
            Markdown-formatted report
        """
        metrics = await self.get_facilitator_performance(hours)
        split = await self.get_facilitator_split(hours)
        funnel = await self.get_conversion_funnel(hours)

        report = f"""
# Payment Analytics Report ({hours}h)

## Facilitator Performance

### PayAI Network
- Success Rate: {metrics['payai'].success_rate:.1%}
- Avg Latency: {metrics['payai'].avg_latency_ms:.0f}ms
- Volume: ${metrics['payai'].total_volume_usdc:.2f} USDC
- Unique Users: {metrics['payai'].unique_users}
- Transactions: {metrics['payai'].total_transactions}

### KAMIYO Native
- Success Rate: {metrics['kamiyo_native'].success_rate:.1%}
- Avg Latency: {metrics['kamiyo_native'].avg_latency_ms:.0f}ms
- Volume: ${metrics['kamiyo_native'].total_volume_usdc:.2f} USDC
- Unique Users: {metrics['kamiyo_native'].unique_users}
- Transactions: {metrics['kamiyo_native'].total_transactions}

## Payment Method Split
- PayAI: {split['payai']:.1f}%
- Native: {split['kamiyo_native']:.1f}%

## Conversion Funnel
- 402 Responses: {funnel['402_responses']}
- Payment Attempts: {funnel['payment_attempts']}
- Successful Payments: {funnel['successful_payments']}
- Conversion Rate: {funnel['conversion_rate']:.1%}

## Recommendations
"""

        # Add recommendations based on metrics
        if metrics['payai'].success_rate > 0.95:
            report += "- ✅ PayAI performing well (>95% success)\n"
        elif metrics['payai'].success_rate > 0:
            report += "- ⚠️  PayAI success rate below target (<95%)\n"

        if metrics['payai'].avg_latency_ms < 2000:
            report += "- ✅ PayAI latency under target (<2s)\n"
        elif metrics['payai'].avg_latency_ms > 0:
            report += "- ⚠️  PayAI latency above target (>2s)\n"

        if split['payai'] > 30:
            report += "- ✅ PayAI adoption healthy (>30%)\n"
        elif split['payai'] > 0:
            report += "- 📈 PayAI adoption growing\n"

        return report


# Global analytics instance
_analytics_instance: Optional[PaymentAnalytics] = None


def get_payment_analytics() -> PaymentAnalytics:
    """Get or create payment analytics singleton"""
    global _analytics_instance

    if _analytics_instance is None:
        _analytics_instance = PaymentAnalytics()

    return _analytics_instance
