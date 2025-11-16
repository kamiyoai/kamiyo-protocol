"""
Database Integration for Monitors
Automatically persists monitoring data to PostgreSQL
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from decimal import Decimal

from database.connection import get_database
from database.models import (
    HLPVaultSnapshot as HLPSnapshot,
    OracleDeviation as DBOracleDeviation,
    LiquidationPattern as DBLiquidationPattern,
    SecurityEvent
)
from models.security import (
    HLPVaultSnapshot,
    OracleDeviation,
    LiquidationPattern
)

logger = logging.getLogger(__name__)


class DatabaseIntegration:
    """
    Database integration for monitoring data

    Automatically saves monitoring data to PostgreSQL for:
    - Historical analysis
    - Trend detection
    - Incident forensics
    - Performance tracking
    """

    def __init__(self):
        """Initialize database integration"""
        self.db = get_database()
        logger.info("Database integration initialized")

    def save_hlp_snapshot(self, snapshot: HLPVaultSnapshot) -> bool:
        """
        Save HLP vault snapshot to database

        Args:
            snapshot: HLP vault snapshot to save

        Returns:
            True if saved successfully, False otherwise
        """
        try:
            session = self.db.get_session()

            db_snapshot = HLPSnapshot(
                vault_address=snapshot.vault_address,
                timestamp=snapshot.timestamp,
                account_value=snapshot.account_value,
                pnl_24h=snapshot.pnl_24h,
                all_time_pnl=snapshot.all_time_pnl,
                sharpe_ratio=Decimal(str(snapshot.sharpe_ratio)) if snapshot.sharpe_ratio else None,
                max_drawdown=Decimal(str(snapshot.max_drawdown)),
                anomaly_score=Decimal(str(snapshot.anomaly_score)),
                is_healthy=snapshot.is_healthy,
                health_issues=snapshot.health_issues or []
            )

            session.add(db_snapshot)
            session.commit()

            logger.debug(f"Saved HLP snapshot: {snapshot.vault_address} at {snapshot.timestamp}")
            return True

        except Exception as e:
            logger.error(f"Failed to save HLP snapshot: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def save_oracle_deviation(self, deviation: OracleDeviation) -> bool:
        """
        Save oracle deviation to database

        Args:
            deviation: Oracle deviation to save

        Returns:
            True if saved successfully, False otherwise
        """
        try:
            session = self.db.get_session()

            db_deviation = DBOracleDeviation(
                asset=deviation.asset,
                timestamp=deviation.timestamp,
                hyperliquid_price=deviation.hyperliquid_price,
                binance_price=deviation.binance_price,
                coinbase_price=deviation.coinbase_price,
                max_deviation_pct=deviation.max_deviation_pct,
                max_deviation_source=deviation.max_deviation_source,
                risk_score=Decimal(str(deviation.risk_score)),
                severity=deviation.severity,
                duration_seconds=Decimal(str(deviation.duration_seconds))
            )

            session.add(db_deviation)
            session.commit()

            logger.debug(f"Saved oracle deviation: {deviation.asset} - {deviation.max_deviation_pct}%")
            return True

        except Exception as e:
            logger.error(f"Failed to save oracle deviation: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def save_liquidation_pattern(self, pattern: LiquidationPattern) -> bool:
        """
        Save liquidation pattern to database

        Args:
            pattern: Liquidation pattern to save

        Returns:
            True if saved successfully, False otherwise
        """
        try:
            session = self.db.get_session()

            db_pattern = DBLiquidationPattern(
                pattern_type=pattern.pattern_type,
                start_time=pattern.start_time,
                end_time=pattern.end_time,
                duration_seconds=Decimal(str(pattern.duration_seconds)),
                total_liquidated_usd=pattern.total_liquidated_usd,
                affected_users=pattern.affected_users,
                assets_involved=pattern.assets_involved or [],
                suspicion_score=Decimal(str(pattern.suspicion_score)),
                liquidation_ids=pattern.liquidation_ids or [],
                price_impact=pattern.price_impact or {}
            )

            session.add(db_pattern)
            session.commit()

            logger.debug(
                f"Saved liquidation pattern: {pattern.pattern_type} - "
                f"${pattern.total_liquidated_usd:,.0f}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to save liquidation pattern: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def save_security_event(
        self,
        threat_type: str,
        severity: str,
        title: str,
        description: str,
        indicators: Optional[Dict[str, Any]] = None,
        affected_addresses: Optional[List[str]] = None
    ) -> bool:
        """
        Save security event to database

        Args:
            threat_type: Type of threat (oracle_manipulation, flash_loan, etc.)
            severity: Severity level (critical, high, medium, low, info)
            title: Event title
            description: Event description
            indicators: Dict of threat indicators
            affected_addresses: List of affected wallet addresses

        Returns:
            True if saved successfully, False otherwise
        """
        try:
            session = self.db.get_session()

            # Generate event ID
            import hashlib
            import json
            event_data = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'threat_type': threat_type,
                'title': title
            }
            event_id = hashlib.sha256(json.dumps(event_data, sort_keys=True).encode()).hexdigest()[:16]

            db_event = SecurityEvent(
                event_id=event_id,
                timestamp=datetime.now(timezone.utc),
                threat_type=threat_type,
                severity=severity.lower(),  # Ensure lowercase
                title=title,
                description=description,
                indicators=indicators or {},
                related_addresses=affected_addresses or [],
                source='monitor_integration'
            )

            session.add(db_event)
            session.commit()

            logger.info(f"Saved security event: {title} ({severity})")
            return True

        except Exception as e:
            logger.error(f"Failed to save security event: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def get_recent_hlp_snapshots(self, limit: int = 100) -> List[HLPSnapshot]:
        """
        Get recent HLP snapshots from database

        Args:
            limit: Maximum number of snapshots to return

        Returns:
            List of HLP snapshots
        """
        try:
            session = self.db.get_session()

            snapshots = session.query(HLPSnapshot)\
                .order_by(HLPSnapshot.timestamp.desc())\
                .limit(limit)\
                .all()

            return snapshots

        except Exception as e:
            logger.error(f"Failed to get recent HLP snapshots: {e}")
            return []
        finally:
            session.close()

    def get_oracle_deviations_by_asset(
        self,
        asset: str,
        hours: int = 24
    ) -> List[DBOracleDeviation]:
        """
        Get oracle deviations for specific asset

        Args:
            asset: Asset symbol (e.g., "BTC")
            hours: Hours of history to retrieve

        Returns:
            List of oracle deviations
        """
        try:
            session = self.db.get_session()

            cutoff = datetime.now(timezone.utc).replace(
                hour=datetime.now(timezone.utc).hour - hours
            )

            deviations = session.query(DBOracleDeviation)\
                .filter(DBOracleDeviation.asset == asset)\
                .filter(DBOracleDeviation.timestamp >= cutoff)\
                .order_by(DBOracleDeviation.timestamp.desc())\
                .all()

            return deviations

        except Exception as e:
            logger.error(f"Failed to get oracle deviations for {asset}: {e}")
            return []
        finally:
            session.close()

    def get_recent_liquidation_patterns(
        self,
        pattern_type: Optional[str] = None,
        limit: int = 50
    ) -> List[DBLiquidationPattern]:
        """
        Get recent liquidation patterns

        Args:
            pattern_type: Filter by pattern type (flash_loan, cascade, etc.)
            limit: Maximum number of patterns to return

        Returns:
            List of liquidation patterns
        """
        try:
            session = self.db.get_session()

            query = session.query(DBLiquidationPattern)

            if pattern_type:
                query = query.filter(DBLiquidationPattern.pattern_type == pattern_type)

            patterns = query.order_by(DBLiquidationPattern.start_time.desc())\
                .limit(limit)\
                .all()

            return patterns

        except Exception as e:
            logger.error(f"Failed to get recent liquidation patterns: {e}")
            return []
        finally:
            session.close()

    def get_security_events(
        self,
        severity: Optional[str] = None,
        threat_type: Optional[str] = None,
        hours: int = 24,
        limit: int = 100
    ) -> List[SecurityEvent]:
        """
        Get security events with filters

        Args:
            severity: Filter by severity
            threat_type: Filter by threat type
            hours: Hours of history to retrieve
            limit: Maximum number of events to return

        Returns:
            List of security events
        """
        try:
            session = self.db.get_session()

            cutoff = datetime.now(timezone.utc).replace(
                hour=datetime.now(timezone.utc).hour - hours
            )

            query = session.query(SecurityEvent)\
                .filter(SecurityEvent.timestamp >= cutoff)

            if severity:
                query = query.filter(SecurityEvent.severity == severity.lower())

            if threat_type:
                query = query.filter(SecurityEvent.threat_type == threat_type)

            events = query.order_by(SecurityEvent.timestamp.desc())\
                .limit(limit)\
                .all()

            return events

        except Exception as e:
            logger.error(f"Failed to get security events: {e}")
            return []
        finally:
            session.close()

    def get_hlp_statistics(self, days: int = 30) -> Dict[str, Any]:
        """
        Get HLP vault statistics

        Args:
            days: Number of days to analyze

        Returns:
            Dict with statistics
        """
        try:
            session = self.db.get_session()

            cutoff = datetime.now(timezone.utc).replace(
                day=datetime.now(timezone.utc).day - days
            )

            snapshots = session.query(HLPSnapshot)\
                .filter(HLPSnapshot.timestamp >= cutoff)\
                .all()

            if not snapshots:
                return {}

            # Calculate statistics
            values = [float(s.account_value) for s in snapshots]
            anomaly_scores = [float(s.anomaly_score) for s in snapshots]
            unhealthy_count = sum(1 for s in snapshots if not s.is_healthy)

            return {
                'total_snapshots': len(snapshots),
                'avg_account_value': sum(values) / len(values),
                'max_account_value': max(values),
                'min_account_value': min(values),
                'avg_anomaly_score': sum(anomaly_scores) / len(anomaly_scores),
                'max_anomaly_score': max(anomaly_scores),
                'unhealthy_snapshots': unhealthy_count,
                'health_rate': (len(snapshots) - unhealthy_count) / len(snapshots) * 100
            }

        except Exception as e:
            logger.error(f"Failed to get HLP statistics: {e}")
            return {}
        finally:
            session.close()


# Singleton instance
_db_integration = None


def get_db_integration() -> DatabaseIntegration:
    """Get singleton database integration instance"""
    global _db_integration
    if _db_integration is None:
        _db_integration = DatabaseIntegration()
    return _db_integration
