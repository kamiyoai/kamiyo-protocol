"""
Database Wrapper for Monitors
Automatically persists monitoring data to database
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from models.security import HLPVaultSnapshot, OracleDeviation, LiquidationPattern
from database.integration import get_db_integration

logger = logging.getLogger(__name__)


class MonitorDatabaseWrapper:
    """
    Wraps monitor operations to automatically persist data

    Usage:
        wrapper = MonitorDatabaseWrapper()

        # Wrap HLP snapshot
        snapshot = hlp_monitor.get_current_health()
        wrapper.save_hlp_snapshot(snapshot)

        # Wrap oracle deviations
        deviations = oracle_monitor.check_all_deviations()
        wrapper.save_oracle_deviations(deviations)
    """

    def __init__(self, enabled: bool = True):
        """
        Initialize database wrapper

        Args:
            enabled: Whether to enable database persistence
        """
        self.enabled = enabled
        self.db = get_db_integration() if enabled else None

        if enabled:
            logger.info("Monitor database wrapper enabled")
        else:
            logger.info("Monitor database wrapper disabled")

    def save_hlp_snapshot(self, snapshot: Optional[HLPVaultSnapshot]) -> bool:
        """
        Save HLP vault snapshot

        Args:
            snapshot: HLP snapshot to save

        Returns:
            True if saved successfully
        """
        if not self.enabled or not snapshot:
            return False

        try:
            success = self.db.save_hlp_snapshot(snapshot)

            if success:
                # If snapshot is unhealthy, create security event
                if not snapshot.is_healthy:
                    self._create_hlp_security_event(snapshot)

            return success

        except Exception as e:
            logger.error(f"Error saving HLP snapshot: {e}")
            return False

    def save_oracle_deviations(
        self,
        deviations: List[OracleDeviation]
    ) -> int:
        """
        Save oracle deviations

        Args:
            deviations: List of oracle deviations to save

        Returns:
            Number of deviations saved
        """
        if not self.enabled or not deviations:
            return 0

        saved_count = 0

        for deviation in deviations:
            try:
                success = self.db.save_oracle_deviation(deviation)

                if success:
                    saved_count += 1

                    # Create security event for significant deviations
                    if deviation.max_deviation_pct >= 0.5:
                        self._create_oracle_security_event(deviation)

            except Exception as e:
                logger.error(f"Error saving oracle deviation: {e}")
                continue

        logger.debug(f"Saved {saved_count}/{len(deviations)} oracle deviations")
        return saved_count

    def save_liquidation_patterns(
        self,
        patterns: List[LiquidationPattern]
    ) -> int:
        """
        Save liquidation patterns

        Args:
            patterns: List of liquidation patterns to save

        Returns:
            Number of patterns saved
        """
        if not self.enabled or not patterns:
            return 0

        saved_count = 0

        for pattern in patterns:
            try:
                success = self.db.save_liquidation_pattern(pattern)

                if success:
                    saved_count += 1

                    # Create security event for suspicious patterns
                    if pattern.suspicion_score >= 50:
                        self._create_liquidation_security_event(pattern)

            except Exception as e:
                logger.error(f"Error saving liquidation pattern: {e}")
                continue

        logger.debug(f"Saved {saved_count}/{len(patterns)} liquidation patterns")
        return saved_count

    def _create_hlp_security_event(self, snapshot: HLPVaultSnapshot):
        """Create security event for unhealthy HLP vault"""
        try:
            # Determine severity based on anomaly score
            if snapshot.anomaly_score >= 70:
                severity = "critical"
                threat_type = "hlp_exploitation"
            elif snapshot.anomaly_score >= 50:
                severity = "high"
                threat_type = "hlp_anomaly"
            else:
                severity = "medium"
                threat_type = "hlp_anomaly"

            self.db.save_security_event(
                threat_type=threat_type,
                severity=severity,
                title=f"HLP Vault Health Issue (Score: {snapshot.anomaly_score:.1f})",
                description=f"HLP vault showing anomalous behavior. "
                           f"Account Value: ${float(snapshot.account_value):,.0f}, "
                           f"PnL 24h: ${float(snapshot.pnl_24h or 0):,.0f}",
                indicators={
                    'vault_address': snapshot.vault_address,
                    'anomaly_score': float(snapshot.anomaly_score),
                    'account_value': float(snapshot.account_value),
                    'pnl_24h': float(snapshot.pnl_24h or 0),
                    'health_issues': snapshot.health_issues or []
                },
                affected_addresses=[snapshot.vault_address]
            )

            logger.info(f"Created security event for unhealthy HLP vault")

        except Exception as e:
            logger.error(f"Error creating HLP security event: {e}")

    def _create_oracle_security_event(self, deviation: OracleDeviation):
        """Create security event for oracle deviation"""
        try:
            # Determine severity based on deviation
            if float(deviation.max_deviation_pct) >= 1.0:
                severity = "critical"
                threat_type = "oracle_manipulation"
            elif float(deviation.max_deviation_pct) >= 0.5:
                severity = "high"
                threat_type = "oracle_deviation"
            else:
                return  # Don't create event for small deviations

            self.db.save_security_event(
                threat_type=threat_type,
                severity=severity,
                title=f"Oracle Deviation: {deviation.asset} ({deviation.max_deviation_pct}%)",
                description=f"Price deviation detected for {deviation.asset}. "
                           f"Hyperliquid: ${float(deviation.hyperliquid_price):,.2f}, "
                           f"{deviation.max_deviation_source.title()}: "
                           f"${float(getattr(deviation, f'{deviation.max_deviation_source}_price') or 0):,.2f}",
                indicators={
                    'asset': deviation.asset,
                    'deviation_pct': float(deviation.max_deviation_pct),
                    'hyperliquid_price': float(deviation.hyperliquid_price),
                    'reference_price': float(
                        getattr(deviation, f'{deviation.max_deviation_source}_price') or 0
                    ),
                    'duration_seconds': float(deviation.duration_seconds),
                    'risk_score': float(deviation.risk_score)
                }
            )

            logger.info(f"Created security event for oracle deviation: {deviation.asset}")

        except Exception as e:
            logger.error(f"Error creating oracle security event: {e}")

    def _create_liquidation_security_event(self, pattern: LiquidationPattern):
        """Create security event for liquidation pattern"""
        try:
            # Determine severity and type based on pattern
            if pattern.pattern_type == "flash_loan":
                severity = "critical"
                threat_type = "flash_loan_attack"
                title = f"Flash Loan Attack Detected (${float(pattern.total_liquidated_usd):,.0f})"
            elif pattern.pattern_type == "cascade":
                severity = "high"
                threat_type = "cascade_liquidation"
                title = f"Cascade Liquidation ({pattern.affected_users} users, ${float(pattern.total_liquidated_usd):,.0f})"
            else:
                severity = "medium"
                threat_type = "suspicious_liquidation"
                title = f"Suspicious Liquidation Pattern ({pattern.pattern_type})"

            self.db.save_security_event(
                threat_type=threat_type,
                severity=severity,
                title=title,
                description=f"Liquidation pattern detected: {pattern.pattern_type}. "
                           f"Duration: {pattern.duration_seconds:.1f}s, "
                           f"Total: ${float(pattern.total_liquidated_usd):,.0f}, "
                           f"Affected: {pattern.affected_users} users",
                indicators={
                    'pattern_type': pattern.pattern_type,
                    'duration_seconds': float(pattern.duration_seconds),
                    'total_liquidated_usd': float(pattern.total_liquidated_usd),
                    'affected_users': pattern.affected_users,
                    'suspicion_score': float(pattern.suspicion_score),
                    'assets_involved': pattern.assets_involved or [],
                    'liquidation_count': len(pattern.liquidation_ids) if pattern.liquidation_ids else 0
                }
            )

            logger.info(f"Created security event for liquidation pattern: {pattern.pattern_type}")

        except Exception as e:
            logger.error(f"Error creating liquidation security event: {e}")

    def get_recent_hlp_snapshots(self, limit: int = 100):
        """Get recent HLP snapshots from database"""
        if not self.enabled:
            return []
        return self.db.get_recent_hlp_snapshots(limit)

    def get_oracle_deviations_by_asset(self, asset: str, hours: int = 24):
        """Get oracle deviations for asset from database"""
        if not self.enabled:
            return []
        return self.db.get_oracle_deviations_by_asset(asset, hours)

    def get_recent_liquidation_patterns(self, pattern_type: Optional[str] = None, limit: int = 50):
        """Get recent liquidation patterns from database"""
        if not self.enabled:
            return []
        return self.db.get_recent_liquidation_patterns(pattern_type, limit)

    def get_security_events(
        self,
        severity: Optional[str] = None,
        threat_type: Optional[str] = None,
        hours: int = 24
    ):
        """Get security events from database"""
        if not self.enabled:
            return []
        return self.db.get_security_events(severity, threat_type, hours)

    def get_hlp_statistics(self, days: int = 30):
        """Get HLP vault statistics from database"""
        if not self.enabled:
            return {}
        return self.db.get_hlp_statistics(days)


# Singleton instance
_monitor_db_wrapper = None


def get_monitor_db_wrapper(enabled: bool = True) -> MonitorDatabaseWrapper:
    """
    Get singleton monitor database wrapper

    Args:
        enabled: Whether to enable database persistence

    Returns:
        MonitorDatabaseWrapper instance
    """
    global _monitor_db_wrapper
    if _monitor_db_wrapper is None:
        _monitor_db_wrapper = MonitorDatabaseWrapper(enabled=enabled)
    return _monitor_db_wrapper
