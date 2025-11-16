"""
HLP Vault Health Monitor
Real-time monitoring and anomaly detection for Hyperliquid's HLP vault
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta, timezone
import statistics
import hashlib

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from config.hyperliquid import HyperliquidConfig
from models.security import (
    HLPVaultSnapshot,
    SecurityEvent,
    SecurityAlert,
    ThreatSeverity,
    ThreatType
)
from aggregators.base import BaseAggregator

# Try to import ML models (optional)
try:
    from ml_models import get_model_manager, FeatureEngineer, DeFiFeatureEngineer
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

logger = logging.getLogger(__name__)


class HLPVaultMonitor(BaseAggregator):
    """
    Monitors Hyperliquid's HLP vault for:
    - Unusual PnL patterns (potential exploitation)
    - Large single losses (>$1M in short period)
    - Abnormal drawdowns (>3 sigma from historical mean)
    - Suspicious withdrawal patterns
    """

    HLP_VAULT_ADDRESS = HyperliquidConfig.HLP_MAIN_VAULT
    API_URL = HyperliquidConfig.API_URL

    # Thresholds for anomaly detection
    CRITICAL_LOSS_1H = 2_000_000      # $2M loss in 1 hour = CRITICAL
    HIGH_LOSS_1H = 1_000_000          # $1M loss in 1 hour = HIGH
    SIGMA_THRESHOLD = 3.0              # 3-sigma deviation = anomaly
    DRAWDOWN_CRITICAL_PCT = 10.0       # 10% drawdown = CRITICAL

    def __init__(self):
        super().__init__("hlp_vault_monitor")
        self.historical_snapshots: List[HLPVaultSnapshot] = []
        self.last_alert_time: Dict[str, datetime] = {}

        # Initialize ML models if available
        self.ml_model_manager = None
        self.ml_feature_engineer = None
        self.defi_feature_engineer = None
        self.ml_enabled = False

        if ML_AVAILABLE:
            try:
                self.ml_model_manager = get_model_manager()
                self.ml_feature_engineer = FeatureEngineer()
                self.defi_feature_engineer = DeFiFeatureEngineer()
                self.ml_model_manager.load_all_models()

                # Check if models are actually loaded
                if (self.ml_model_manager.anomaly_detector and
                    self.ml_model_manager.anomaly_detector.is_trained):
                    self.ml_enabled = True
                    self.logger.info("ML anomaly detection with DeFi features enabled for HLP monitor")
                else:
                    self.logger.info("ML models not trained. Using rule-based detection only.")
            except Exception as e:
                self.logger.warning(f"ML models not loaded: {e}. Using rule-based detection only.")

    async def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Detect exploits targeting the HLP vault
        Returns list of detected exploits
        """
        exploits = []

        try:
            # Get current vault state
            vault_data = await self._fetch_vault_details()
            if not vault_data:
                return exploits

            # Create snapshot
            snapshot = self._create_snapshot(vault_data)
            self.historical_snapshots.append(snapshot)

            # Analyze for anomalies
            events = self._detect_anomalies(snapshot)

            # Convert critical events to exploits
            for event in events:
                if event.severity in [ThreatSeverity.CRITICAL, ThreatSeverity.HIGH]:
                    exploit = self._event_to_exploit(event)
                    exploits.append(exploit)

            self.logger.info(f"HLP Vault Monitor: {len(events)} events, {len(exploits)} exploits")

        except Exception as e:
            self.logger.error(f"Error monitoring HLP vault: {e}", exc_info=True)

        return exploits

    async def _fetch_vault_details(self) -> Optional[Dict[str, Any]]:
        """
        Fetch vault details from Hyperliquid API

        Returns:
            Vault data dictionary or None on failure
        """
        payload = {
            "type": "vaultDetails",
            "vaultAddress": self.HLP_VAULT_ADDRESS
        }

        response = await self.make_request(
            self.API_URL,
            method='POST',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )

        if not response:
            return None

        try:
            return response.json()
        except Exception as e:
            self.logger.error(f"Failed to parse vault details: {e}")
            return None

    def _create_snapshot(self, vault_data: Dict[str, Any]) -> HLPVaultSnapshot:
        """
        Create vault snapshot from API data

        Args:
            vault_data: Raw vault data from API

        Returns:
            HLPVaultSnapshot object
        """
        # Extract portfolio data
        # API returns: {"portfolio": [["day", {"accountValueHistory": [[ts, val], ...]}], ...]}
        portfolio_raw = vault_data.get('portfolio', [])

        # Convert to flat list of entries for processing
        portfolio = []
        if isinstance(portfolio_raw, list) and len(portfolio_raw) > 0:
            # Find the 'day' period data (most granular)
            for period_data in portfolio_raw:
                if isinstance(period_data, list) and len(period_data) >= 2:
                    period_name = period_data[0]
                    if period_name == "day":
                        # Extract accountValueHistory
                        history_data = period_data[1]
                        if isinstance(history_data, dict):
                            account_value_history = history_data.get('accountValueHistory', [])
                            # Convert to our format: [{'timestamp': ms, 'accountValue': str}, ...]
                            for entry in account_value_history:
                                if isinstance(entry, list) and len(entry) >= 2:
                                    portfolio.append({
                                        'timestamp': entry[0],
                                        'accountValue': entry[1]
                                    })
                        break

        # Get latest account value
        account_value = 0.0
        if portfolio and len(portfolio) > 0:
            latest = portfolio[-1]
            account_value = float(latest.get('accountValue', 0))

        # Calculate PnL periods
        pnl_24h = self._calculate_pnl(portfolio, hours=24)
        pnl_7d = self._calculate_pnl(portfolio, hours=24*7)
        pnl_30d = self._calculate_pnl(portfolio, hours=24*30)

        # Calculate performance metrics
        sharpe = self._calculate_sharpe_ratio(portfolio)
        max_dd = self._calculate_max_drawdown(portfolio)

        # Create snapshot
        snapshot = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc),
            vault_address=self.HLP_VAULT_ADDRESS,
            total_value_locked=account_value,  # Simplified
            account_value=account_value,
            pnl_24h=pnl_24h,
            pnl_7d=pnl_7d,
            pnl_30d=pnl_30d,
            sharpe_ratio=sharpe,
            max_drawdown=max_dd,
            health_issues=[]
        )

        return snapshot

    def _calculate_pnl(self, portfolio: List[Dict], hours: int) -> float:
        """Calculate PnL over specified time period"""
        if not portfolio or len(portfolio) < 2:
            return 0.0

        try:
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)

            # Find values at start and end of period
            current_value = float(portfolio[-1].get('accountValue', 0))

            # Find oldest value within period
            start_value = current_value
            for entry in portfolio:
                timestamp_ms = entry.get('timestamp', 0)
                entry_time = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)

                if entry_time >= cutoff_time:
                    start_value = float(entry.get('accountValue', current_value))
                    break

            return current_value - start_value

        except Exception as e:
            self.logger.error(f"Error calculating PnL: {e}")
            return 0.0

    def _calculate_sharpe_ratio(self, portfolio: List[Dict]) -> Optional[float]:
        """Calculate Sharpe ratio from portfolio history"""
        if not portfolio or len(portfolio) < 30:
            return None

        try:
            # Get daily returns
            returns = []
            for i in range(1, len(portfolio)):
                prev_value = float(portfolio[i-1].get('accountValue', 0))
                curr_value = float(portfolio[i].get('accountValue', 0))

                if prev_value > 0:
                    daily_return = (curr_value - prev_value) / prev_value
                    returns.append(daily_return)

            if len(returns) < 30:
                return None

            # Calculate Sharpe (annualized, assuming risk-free rate = 0)
            mean_return = statistics.mean(returns)
            std_return = statistics.stdev(returns)

            if std_return == 0:
                return None

            sharpe = (mean_return * 365) / (std_return * (365 ** 0.5))
            return sharpe

        except Exception as e:
            self.logger.error(f"Error calculating Sharpe ratio: {e}")
            return None

    def _calculate_max_drawdown(self, portfolio: List[Dict]) -> Optional[float]:
        """Calculate maximum drawdown percentage"""
        if not portfolio or len(portfolio) < 2:
            return None

        try:
            values = [float(p.get('accountValue', 0)) for p in portfolio]

            max_value = values[0]
            max_dd = 0.0

            for value in values:
                if value > max_value:
                    max_value = value

                drawdown = (max_value - value) / max_value if max_value > 0 else 0
                max_dd = max(max_dd, drawdown)

            return max_dd * 100  # Convert to percentage

        except Exception as e:
            self.logger.error(f"Error calculating max drawdown: {e}")
            return None

    def _detect_anomalies(self, snapshot: HLPVaultSnapshot) -> List[SecurityEvent]:
        """
        Analyze snapshot for anomalies and generate security events
        Uses both rule-based and ML-based detection (if available)

        Args:
            snapshot: Current vault snapshot

        Returns:
            List of detected security events
        """
        events = []

        # ML-based anomaly detection (if enabled and enough data)
        ml_anomaly_score = None
        if self.ml_enabled and len(self.historical_snapshots) >= 10:
            try:
                ml_event = self._detect_ml_anomaly(snapshot)
                if ml_event:
                    events.append(ml_event)
                    # Store ML score for later use
                    ml_anomaly_score = ml_event.indicators.get('ml_anomaly_score', 0)
            except Exception as e:
                self.logger.warning(f"ML anomaly detection failed: {e}")

        # Rule-based detection (always runs as fallback)

        # Check for large losses in short period
        if snapshot.pnl_24h < -self.CRITICAL_LOSS_1H:
            event = self._create_large_loss_event(snapshot, severity=ThreatSeverity.CRITICAL)
            events.append(event)
        elif snapshot.pnl_24h < -self.HIGH_LOSS_1H:
            event = self._create_large_loss_event(snapshot, severity=ThreatSeverity.HIGH)
            events.append(event)

        # Check for abnormal drawdown
        if snapshot.max_drawdown and snapshot.max_drawdown > self.DRAWDOWN_CRITICAL_PCT:
            event = self._create_drawdown_event(snapshot)
            events.append(event)

        # Check for statistical anomalies (if enough historical data)
        if len(self.historical_snapshots) >= 100:
            anomaly_event = self._check_statistical_anomaly(snapshot)
            if anomaly_event:
                events.append(anomaly_event)

        # Calculate overall anomaly score (blends rule-based + ML)
        snapshot.anomaly_score = self._calculate_anomaly_score(snapshot, ml_score=ml_anomaly_score)
        if snapshot.anomaly_score > 70:
            snapshot.is_healthy = False
            snapshot.health_issues = ["High anomaly score detected"]

        return events

    def _create_large_loss_event(
        self,
        snapshot: HLPVaultSnapshot,
        severity: ThreatSeverity
    ) -> SecurityEvent:
        """Create security event for large loss"""
        event_id = self._generate_event_id("large_loss", snapshot.timestamp)

        return SecurityEvent(
            event_id=event_id,
            timestamp=snapshot.timestamp,
            severity=severity,
            threat_type=ThreatType.HLP_EXPLOITATION,
            title=f"HLP Vault Large Loss Detected: ${abs(snapshot.pnl_24h):,.0f}",
            description=(
                f"The HLP vault has experienced a significant loss of "
                f"${abs(snapshot.pnl_24h):,.0f} in the last 24 hours. "
                f"This may indicate exploitation, market manipulation, or extreme market conditions."
            ),
            affected_assets=["HLP"],
            indicators={
                'pnl_24h': snapshot.pnl_24h,
                'pnl_7d': snapshot.pnl_7d,
                'account_value': snapshot.account_value,
                'max_drawdown': snapshot.max_drawdown
            },
            recommended_action=(
                "CRITICAL: Consider pausing HLP deposits. Investigate recent large liquidations. "
                "Monitor for coordinated attacks or oracle manipulation."
            ),
            source="hlp_vault_monitor",
            estimated_loss_usd=abs(snapshot.pnl_24h)
        )

    def _create_drawdown_event(self, snapshot: HLPVaultSnapshot) -> SecurityEvent:
        """Create security event for abnormal drawdown"""
        event_id = self._generate_event_id("drawdown", snapshot.timestamp)

        return SecurityEvent(
            event_id=event_id,
            timestamp=snapshot.timestamp,
            severity=ThreatSeverity.HIGH,
            threat_type=ThreatType.HLP_EXPLOITATION,
            title=f"HLP Vault Excessive Drawdown: {snapshot.max_drawdown:.1f}%",
            description=(
                f"The HLP vault is experiencing a {snapshot.max_drawdown:.1f}% drawdown from peak. "
                f"This exceeds normal operating parameters and may indicate systematic issues."
            ),
            affected_assets=["HLP"],
            indicators={
                'max_drawdown_pct': snapshot.max_drawdown,
                'account_value': snapshot.account_value,
                'pnl_24h': snapshot.pnl_24h
            },
            recommended_action=(
                "Monitor closely. Review recent market making activity and liquidations. "
                "Consider reducing exposure if drawdown increases."
            ),
            source="hlp_vault_monitor"
        )

    def _detect_ml_anomaly(self, snapshot: HLPVaultSnapshot) -> Optional[SecurityEvent]:
        """
        Use ML model to detect anomalies

        Args:
            snapshot: Current vault snapshot

        Returns:
            Security event if ML detects anomaly, None otherwise
        """
        if not self.ml_enabled or not self.ml_feature_engineer:
            return None

        try:
            # Prepare snapshot data for feature extraction
            snapshot_data = [{
                'timestamp': snapshot.timestamp,
                'account_value': snapshot.account_value,
                'pnl_24h': snapshot.pnl_24h,
                'pnl_7d': snapshot.pnl_7d,
                'pnl_30d': snapshot.pnl_30d,
                'sharpe_ratio': snapshot.sharpe_ratio,
                'max_drawdown': snapshot.max_drawdown,
                'anomaly_score': snapshot.anomaly_score,
                'is_healthy': snapshot.is_healthy
            }]

            # Extract base features
            features_df = self.ml_feature_engineer.extract_hlp_features(snapshot_data)

            if features_df.empty:
                self.logger.debug("Not enough data for ML feature extraction")
                return None

            # Enhance with DeFi-specific features
            if self.defi_feature_engineer:
                try:
                    features_df = self.defi_feature_engineer.add_defi_features(features_df)
                    self.logger.debug(f"Enhanced features with DeFi context: {features_df.shape[1]} total features")
                except Exception as e:
                    self.logger.warning(f"Failed to add DeFi features: {e}. Using base features only.")

            # Get ML prediction
            predictions = self.ml_model_manager.anomaly_detector.predict(features_df)

            if predictions.empty:
                return None

            prediction = predictions.iloc[0].to_dict()

            # Only create event if ML detected anomaly with high confidence
            if prediction.get('is_anomaly') and prediction.get('anomaly_score', 0) > 70:
                event_id = self._generate_event_id("ml_anomaly", snapshot.timestamp)

                # Determine severity based on ML score
                ml_score = prediction['anomaly_score']
                if ml_score > 90:
                    severity = ThreatSeverity.CRITICAL
                elif ml_score > 80:
                    severity = ThreatSeverity.HIGH
                else:
                    severity = ThreatSeverity.MEDIUM

                # Get contributing features
                contributing_features = prediction.get('contributing_features', [])
                top_features = contributing_features[:3] if contributing_features else []

                return SecurityEvent(
                    event_id=event_id,
                    timestamp=snapshot.timestamp,
                    severity=severity,
                    threat_type=ThreatType.HLP_EXPLOITATION,
                    title=f"ML Anomaly Detected: {ml_score:.1f}/100 confidence",
                    description=(
                        f"Machine learning model detected unusual patterns in HLP vault behavior. "
                        f"Anomaly score: {ml_score:.1f}/100. "
                        f"This may indicate exploitation, market manipulation, or unusual market conditions."
                    ),
                    affected_assets=["HLP"],
                    indicators={
                        'ml_anomaly_score': ml_score,
                        'top_features': [f['feature'] for f in top_features],
                        'pnl_24h': snapshot.pnl_24h,
                        'account_value': snapshot.account_value,
                        'max_drawdown': snapshot.max_drawdown
                    },
                    recommended_action=(
                        f"ML-detected anomaly. Investigate: {', '.join([f['feature'] for f in top_features])}. "
                        f"Cross-check with rule-based alerts and market conditions."
                    ),
                    source="hlp_vault_monitor_ml"
                )

        except Exception as e:
            self.logger.error(f"Error in ML anomaly detection: {e}", exc_info=True)

        return None

    def _check_statistical_anomaly(self, snapshot: HLPVaultSnapshot) -> Optional[SecurityEvent]:
        """Check for statistical anomalies using historical data"""
        try:
            # Get recent PnL values
            recent_pnls = [s.pnl_24h for s in self.historical_snapshots[-100:]]

            mean_pnl = statistics.mean(recent_pnls)
            std_pnl = statistics.stdev(recent_pnls)

            if std_pnl == 0:
                return None

            # Calculate z-score
            z_score = (snapshot.pnl_24h - mean_pnl) / std_pnl

            # Check if beyond threshold
            if abs(z_score) > self.SIGMA_THRESHOLD:
                event_id = self._generate_event_id("statistical_anomaly", snapshot.timestamp)

                severity = ThreatSeverity.HIGH if abs(z_score) > 4 else ThreatSeverity.MEDIUM

                return SecurityEvent(
                    event_id=event_id,
                    timestamp=snapshot.timestamp,
                    severity=severity,
                    threat_type=ThreatType.HLP_EXPLOITATION,
                    title=f"HLP Vault Statistical Anomaly: {abs(z_score):.1f}σ deviation",
                    description=(
                        f"The HLP vault's 24h PnL (${snapshot.pnl_24h:,.0f}) is "
                        f"{abs(z_score):.1f} standard deviations from the historical mean. "
                        f"This is highly unusual and warrants investigation."
                    ),
                    affected_assets=["HLP"],
                    indicators={
                        'z_score': z_score,
                        'pnl_24h': snapshot.pnl_24h,
                        'mean_pnl': mean_pnl,
                        'std_pnl': std_pnl
                    },
                    recommended_action="Investigate cause of unusual PnL. Review recent liquidations and trades.",
                    source="hlp_vault_monitor"
                )

        except Exception as e:
            self.logger.error(f"Error checking statistical anomaly: {e}")

        return None

    def _calculate_anomaly_score(self, snapshot: HLPVaultSnapshot, ml_score: Optional[float] = None) -> float:
        """
        Calculate overall anomaly score (0-100)
        Blends rule-based and ML scores when available

        Args:
            snapshot: Current vault snapshot
            ml_score: Optional ML anomaly score (0-100)

        Returns:
            Combined anomaly score (0-100)
        """
        # Rule-based score (0-100)
        rule_score = 0.0

        # Large loss component (0-40 points)
        if snapshot.pnl_24h < 0:
            loss_ratio = abs(snapshot.pnl_24h) / self.CRITICAL_LOSS_1H
            rule_score += min(40, loss_ratio * 40)

        # Drawdown component (0-30 points)
        if snapshot.max_drawdown:
            drawdown_ratio = snapshot.max_drawdown / self.DRAWDOWN_CRITICAL_PCT
            rule_score += min(30, drawdown_ratio * 30)

        # Volatility component (0-30 points)
        if len(self.historical_snapshots) >= 10:
            recent_pnls = [abs(s.pnl_24h) for s in self.historical_snapshots[-10:]]
            avg_volatility = statistics.mean(recent_pnls)

            if avg_volatility > 0:
                current_volatility = abs(snapshot.pnl_24h)
                volatility_ratio = current_volatility / (avg_volatility * 2)
                rule_score += min(30, volatility_ratio * 30)

        rule_score = min(100, rule_score)

        # Blend with ML score if available (70% rule-based, 30% ML)
        # This ensures rule-based detection remains primary with ML as enhancement
        if ml_score is not None and self.ml_enabled:
            final_score = (0.7 * rule_score) + (0.3 * ml_score)
            self.logger.debug(f"Blended score: rule={rule_score:.1f}, ml={ml_score:.1f}, final={final_score:.1f}")
            return min(100, final_score)

        return rule_score

    def _event_to_exploit(self, event: SecurityEvent) -> Dict[str, Any]:
        """Convert security event to exploit format for KAMIYO aggregation"""
        return {
            'tx_hash': event.event_id,
            'chain': 'Hyperliquid',
            'protocol': 'HLP Vault',
            'amount_usd': event.estimated_loss_usd or 0,
            'timestamp': event.timestamp,
            'source': self.name,
            'source_url': f"https://app.hyperliquid.xyz/vaults/{self.HLP_VAULT_ADDRESS}",
            'category': 'vault_exploitation',
            'description': event.description,
            'recovery_status': 'monitoring'
        }

    def _generate_event_id(self, event_type: str, timestamp: datetime) -> str:
        """Generate unique event ID"""
        data = f"{event_type}_{timestamp.isoformat()}_{self.HLP_VAULT_ADDRESS}"
        return "hlp-" + hashlib.sha256(data.encode()).hexdigest()[:16]

    def get_current_health(self) -> Optional[HLPVaultSnapshot]:
        """
        Get current health snapshot of HLP vault

        Returns:
            Latest vault snapshot or None
        """
        try:
            vault_data = self._fetch_vault_details()
            if vault_data:
                return self._create_snapshot(vault_data)
        except Exception as e:
            self.logger.error(f"Error getting vault health: {e}")

        return None
