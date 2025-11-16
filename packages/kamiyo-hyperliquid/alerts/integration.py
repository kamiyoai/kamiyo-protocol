"""
Alert Integration for Monitors
Integrates alert system with security monitors
"""

import logging
from typing import Optional
from .alert_manager import get_alert_manager, AlertLevel
from models.security import HLPVaultSnapshot, OracleDeviation, LiquidationPattern

logger = logging.getLogger(__name__)


def check_and_alert_hlp_health(health: Optional[HLPVaultSnapshot]):
    """
    Check HLP vault health and send alerts if issues detected

    Args:
        health: HLP vault health snapshot
    """
    if not health:
        return

    try:
        alert_mgr = get_alert_manager()

        # Alert on high anomaly scores
        if health.anomaly_score >= 30:
            alert_mgr.alert_hlp_vault_anomaly(
                anomaly_score=health.anomaly_score,
                account_value=float(health.account_value),
                pnl_24h=float(health.pnl_24h) if health.pnl_24h else 0,
                health_issues=health.health_issues or []
            )

        # Alert on large losses
        if health.pnl_24h and float(health.pnl_24h) < -1_000_000:
            alert_mgr.alert_large_loss(
                amount=abs(float(health.pnl_24h)),
                source="HLP Vault Monitor",
                description=f"HLP vault lost ${abs(float(health.pnl_24h)):,.2f} in 24 hours"
            )

    except Exception as e:
        logger.error(f"Error sending HLP health alert: {e}")


def check_and_alert_oracle_deviations(deviations: list):
    """
    Check oracle deviations and send alerts for significant ones

    Args:
        deviations: List of OracleDeviation objects
    """
    if not deviations:
        return

    try:
        alert_mgr = get_alert_manager()

        for deviation in deviations:
            if not isinstance(deviation, OracleDeviation):
                continue

            # Alert on significant deviations
            if deviation.max_deviation_pct >= 0.5:
                # Determine reference price
                ref_price = deviation.binance_price or deviation.coinbase_price
                if ref_price:
                    alert_mgr.alert_oracle_deviation(
                        asset=deviation.asset,
                        deviation_pct=float(deviation.max_deviation_pct),
                        hl_price=float(deviation.hyperliquid_price),
                        reference_price=float(ref_price),
                        duration=float(deviation.duration_seconds)
                    )

    except Exception as e:
        logger.error(f"Error sending oracle deviation alert: {e}")


def check_and_alert_liquidation_patterns(patterns: list):
    """
    Check liquidation patterns and send alerts for suspicious ones

    Args:
        patterns: List of LiquidationPattern objects
    """
    if not patterns:
        return

    try:
        alert_mgr = get_alert_manager()

        for pattern in patterns:
            if not isinstance(pattern, LiquidationPattern):
                continue

            # Alert on flash loan attacks
            if pattern.pattern_type == "flash_loan" and pattern.suspicion_score >= 70:
                alert_mgr.alert_flash_loan_attack(
                    total_usd=float(pattern.total_liquidated_usd),
                    duration=float(pattern.duration_seconds),
                    liquidation_count=len(pattern.liquidation_ids) if pattern.liquidation_ids else 0,
                    assets=pattern.assets_involved or []
                )

            # Alert on cascade liquidations
            elif pattern.pattern_type == "cascade" and pattern.suspicion_score >= 50:
                alert_mgr.alert_cascade_liquidation(
                    total_usd=float(pattern.total_liquidated_usd),
                    count=pattern.affected_users,
                    duration=float(pattern.duration_seconds),
                    price_impact=pattern.price_impact or {}
                )

    except Exception as e:
        logger.error(f"Error sending liquidation pattern alert: {e}")


def alert_monitor_failure(component: str, error: str):
    """
    Alert when a monitor fails

    Args:
        component: Monitor component name
        error: Error message
    """
    try:
        alert_mgr = get_alert_manager()
        alert_mgr.alert_system_health(
            component=component,
            status="down",
            error=error
        )
    except Exception as e:
        logger.error(f"Error sending monitor failure alert: {e}")


def alert_database_issue(error: str):
    """
    Alert when database has issues

    Args:
        error: Error message
    """
    try:
        alert_mgr = get_alert_manager()
        alert_mgr.alert_system_health(
            component="PostgreSQL Database",
            status="degraded",
            error=error
        )
    except Exception as e:
        logger.error(f"Error sending database alert: {e}")
