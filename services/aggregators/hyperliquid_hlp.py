# -*- coding: utf-8 -*-
"""
Hyperliquid HLP Vault Monitor Aggregator
Monitors HLP vault for exploitation and security incidents
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import statistics
import hashlib

from aggregators.base import BaseAggregator

logger = logging.getLogger(__name__)


class HyperliquidHLPAggregator(BaseAggregator):
    """
    Monitors Hyperliquid's HLP vault for:
    - Unusual PnL patterns (potential exploitation)
    - Large single losses (>$1M in short period)
    - Abnormal drawdowns (>3 sigma from historical mean)
    - Suspicious withdrawal patterns
    """

    HLP_VAULT_ADDRESS = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303"
    API_URL = "https://api.hyperliquid.xyz/info"

    # Thresholds for anomaly detection
    CRITICAL_LOSS_1H = 2000000      # $2M loss in 1 hour = CRITICAL
    HIGH_LOSS_1H = 1000000          # $1M loss in 1 hour = HIGH
    SIGMA_THRESHOLD = 3.0           # 3-sigma deviation = anomaly
    DRAWDOWN_CRITICAL_PCT = 10.0    # 10% drawdown = CRITICAL

    def __init__(self):
        super().__init__("hyperliquid_hlp")
        self.historical_snapshots: List[Dict[str, Any]] = []
        self.last_alert_time: Dict[str, datetime] = {}

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Detect exploits targeting the HLP vault
        Returns list of detected exploits in KAMIYO format
        """
        exploits = []

        try:
            # Get current vault state
            vault_data = self._fetch_vault_details()
            if not vault_data:
                return exploits

            # Create snapshot
            snapshot = self._create_snapshot(vault_data)
            self.historical_snapshots.append(snapshot)

            # Analyze for anomalies
            events = self._detect_anomalies(snapshot)

            # Convert critical events to exploits in KAMIYO format
            for event in events:
                if event['severity'] in ['critical', 'high']:
                    exploit = self._event_to_kamiyo_format(event)
                    exploits.append(exploit)

            self.logger.info(f"HLP Vault Monitor: {len(events)} events, {len(exploits)} exploits")

        except Exception as e:
            self.logger.error(f"Error monitoring HLP vault: {e}", exc_info=True)

        return exploits

    def _fetch_vault_details(self) -> Optional[Dict[str, Any]]:
        """Fetch vault details from Hyperliquid API"""
        payload = {
            "type": "vaultDetails",
            "vaultAddress": self.HLP_VAULT_ADDRESS
        }

        response = self.make_request(
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

    def _create_snapshot(self, vault_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create vault snapshot from API data"""
        # Extract portfolio data - API returns nested array structure
        portfolio_raw = vault_data.get('portfolio', [])
        portfolio = []

        if isinstance(portfolio_raw, list) and len(portfolio_raw) > 0:
            for period_data in portfolio_raw:
                if isinstance(period_data, list) and len(period_data) >= 2:
                    period_name = period_data[0]
                    if period_name == "day":
                        history_data = period_data[1]
                        if isinstance(history_data, dict):
                            account_value_history = history_data.get('accountValueHistory', [])
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

        # Calculate performance metrics
        max_dd = self._calculate_max_drawdown(portfolio)

        snapshot = {
            'timestamp': datetime.now(),
            'vault_address': self.HLP_VAULT_ADDRESS,
            'account_value': account_value,
            'pnl_24h': pnl_24h,
            'pnl_7d': pnl_7d,
            'max_drawdown': max_dd,
            'anomaly_score': 0.0,
            'is_healthy': True
        }

        return snapshot

    def _calculate_pnl(self, portfolio: List[Dict], hours: int) -> float:
        """Calculate PnL over specified time period"""
        if not portfolio or len(portfolio) < 2:
            return 0.0

        try:
            cutoff_time = datetime.now() - timedelta(hours=hours)
            current_value = float(portfolio[-1].get('accountValue', 0))

            # Find oldest value within period
            start_value = current_value
            for entry in portfolio:
                timestamp_ms = entry.get('timestamp', 0)
                entry_time = datetime.fromtimestamp(timestamp_ms / 1000)

                if entry_time >= cutoff_time:
                    start_value = float(entry.get('accountValue', current_value))
                    break

            return current_value - start_value

        except Exception as e:
            self.logger.error(f"Error calculating PnL: {e}")
            return 0.0

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

    def _detect_anomalies(self, snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Analyze snapshot for anomalies and generate events"""
        events = []

        # Check for large losses in short period
        if snapshot['pnl_24h'] < -self.CRITICAL_LOSS_1H:
            event = self._create_large_loss_event(snapshot, severity='critical')
            events.append(event)
        elif snapshot['pnl_24h'] < -self.HIGH_LOSS_1H:
            event = self._create_large_loss_event(snapshot, severity='high')
            events.append(event)

        # Check for abnormal drawdown
        if snapshot['max_drawdown'] and snapshot['max_drawdown'] > self.DRAWDOWN_CRITICAL_PCT:
            event = self._create_drawdown_event(snapshot)
            events.append(event)

        # Check for statistical anomalies (if enough historical data)
        if len(self.historical_snapshots) >= 100:
            anomaly_event = self._check_statistical_anomaly(snapshot)
            if anomaly_event:
                events.append(anomaly_event)

        # Calculate overall anomaly score
        snapshot['anomaly_score'] = self._calculate_anomaly_score(snapshot)
        if snapshot['anomaly_score'] > 70:
            snapshot['is_healthy'] = False

        return events

    def _create_large_loss_event(self, snapshot: Dict[str, Any], severity: str) -> Dict[str, Any]:
        """Create event for large loss"""
        event_id = self._generate_event_id("large_loss", snapshot['timestamp'])

        return {
            'event_id': event_id,
            'timestamp': snapshot['timestamp'],
            'severity': severity,
            'threat_type': 'hlp_exploitation',
            'title': f"HLP Vault Large Loss Detected: ${abs(snapshot['pnl_24h']):,.0f}",
            'description': (
                f"The HLP vault has experienced a significant loss of "
                f"${abs(snapshot['pnl_24h']):,.0f} in the last 24 hours. "
                f"This may indicate exploitation, market manipulation, or extreme market conditions."
            ),
            'affected_assets': ['HLP'],
            'estimated_loss_usd': abs(snapshot['pnl_24h']),
            'source': self.name
        }

    def _create_drawdown_event(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """Create event for abnormal drawdown"""
        event_id = self._generate_event_id("drawdown", snapshot['timestamp'])

        return {
            'event_id': event_id,
            'timestamp': snapshot['timestamp'],
            'severity': 'high',
            'threat_type': 'hlp_exploitation',
            'title': f"HLP Vault Excessive Drawdown: {snapshot['max_drawdown']:.1f}%",
            'description': (
                f"The HLP vault is experiencing a {snapshot['max_drawdown']:.1f}% drawdown from peak. "
                f"This exceeds normal operating parameters and may indicate systematic issues."
            ),
            'affected_assets': ['HLP'],
            'estimated_loss_usd': 0,
            'source': self.name
        }

    def _check_statistical_anomaly(self, snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check for statistical anomalies using historical data"""
        try:
            recent_pnls = [s['pnl_24h'] for s in self.historical_snapshots[-100:]]

            mean_pnl = statistics.mean(recent_pnls)
            std_pnl = statistics.stdev(recent_pnls)

            if std_pnl == 0:
                return None

            z_score = (snapshot['pnl_24h'] - mean_pnl) / std_pnl

            if abs(z_score) > self.SIGMA_THRESHOLD:
                event_id = self._generate_event_id("statistical_anomaly", snapshot['timestamp'])
                severity = 'high' if abs(z_score) > 4 else 'medium'

                return {
                    'event_id': event_id,
                    'timestamp': snapshot['timestamp'],
                    'severity': severity,
                    'threat_type': 'hlp_exploitation',
                    'title': f"HLP Vault Statistical Anomaly: {abs(z_score):.1f}σ deviation",
                    'description': (
                        f"The HLP vault's 24h PnL (${snapshot['pnl_24h']:,.0f}) is "
                        f"{abs(z_score):.1f} standard deviations from the historical mean. "
                        f"This is highly unusual and warrants investigation."
                    ),
                    'affected_assets': ['HLP'],
                    'estimated_loss_usd': abs(snapshot['pnl_24h']) if snapshot['pnl_24h'] < 0 else 0,
                    'source': self.name
                }

        except Exception as e:
            self.logger.error(f"Error checking statistical anomaly: {e}")

        return None

    def _calculate_anomaly_score(self, snapshot: Dict[str, Any]) -> float:
        """Calculate overall anomaly score (0-100)"""
        score = 0.0

        # Large loss component (0-40 points)
        if snapshot['pnl_24h'] < 0:
            loss_ratio = abs(snapshot['pnl_24h']) / self.CRITICAL_LOSS_1H
            score += min(40, loss_ratio * 40)

        # Drawdown component (0-30 points)
        if snapshot['max_drawdown']:
            drawdown_ratio = snapshot['max_drawdown'] / self.DRAWDOWN_CRITICAL_PCT
            score += min(30, drawdown_ratio * 30)

        # Volatility component (0-30 points)
        if len(self.historical_snapshots) >= 10:
            recent_pnls = [abs(s['pnl_24h']) for s in self.historical_snapshots[-10:]]
            avg_volatility = statistics.mean(recent_pnls)

            if avg_volatility > 0:
                current_volatility = abs(snapshot['pnl_24h'])
                volatility_ratio = current_volatility / (avg_volatility * 2)
                score += min(30, volatility_ratio * 30)

        return min(100, score)

    def _event_to_kamiyo_format(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Convert security event to KAMIYO exploit format"""
        return {
            'tx_hash': event['event_id'],
            'chain': 'Hyperliquid',
            'protocol': 'HLP Vault',
            'amount_usd': event.get('estimated_loss_usd', 0),
            'timestamp': event['timestamp'],
            'source': self.name,
            'source_url': f"https://app.hyperliquid.xyz/vaults/{self.HLP_VAULT_ADDRESS}",
            'category': 'vault_exploitation',
            'description': event['description'],
            'recovery_status': 'monitoring'
        }

    def _generate_event_id(self, event_type: str, timestamp: datetime) -> str:
        """Generate unique event ID"""
        data = f"{event_type}_{timestamp.isoformat()}_{self.HLP_VAULT_ADDRESS}"
        return "hlp-" + hashlib.sha256(data.encode()).hexdigest()[:16]
