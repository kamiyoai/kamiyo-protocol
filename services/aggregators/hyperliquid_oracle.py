# -*- coding: utf-8 -*-
"""
Hyperliquid Oracle Deviation Monitor Aggregator
Detects potential oracle manipulation by comparing Hyperliquid prices with external sources
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import hashlib

from aggregators.base import BaseAggregator

logger = logging.getLogger(__name__)


class HyperliquidOracleAggregator(BaseAggregator):
    """
    Monitors Hyperliquid oracle prices for deviations from external sources
    Detects potential price manipulation attacks
    """

    HYPERLIQUID_API = "https://api.hyperliquid.xyz/info"
    BINANCE_API = "https://api.binance.com/api/v3"
    COINBASE_API = "https://api.coinbase.com/v2"

    # Deviation thresholds
    WARNING_THRESHOLD_PCT = 0.5     # 0.5% deviation = warning
    CRITICAL_THRESHOLD_PCT = 1.0    # 1.0% deviation = critical
    DURATION_THRESHOLD_SEC = 30     # Sustained for 30+ seconds

    # Assets to monitor (most liquid pairs)
    MONITORED_ASSETS = ['BTC', 'ETH', 'SOL', 'MATIC', 'AVAX', 'OP', 'ARB']

    def __init__(self):
        super().__init__("hyperliquid_oracle")
        self.active_deviations: Dict[str, Dict[str, Any]] = {}
        self.price_history: Dict[str, List[Dict[str, Any]]] = {}

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Detect oracle manipulation exploits
        Returns list of detected exploits in KAMIYO format
        """
        exploits = []

        try:
            # Fetch prices from all sources
            hl_prices = self._fetch_hyperliquid_prices()
            binance_prices = self._fetch_binance_prices()
            coinbase_prices = self._fetch_coinbase_prices()

            if not hl_prices:
                self.logger.warning("Could not fetch Hyperliquid prices")
                return exploits

            # Check for deviations in monitored assets
            for asset in self.MONITORED_ASSETS:
                hl_price = hl_prices.get(asset)
                binance_price = binance_prices.get(asset)
                coinbase_price = coinbase_prices.get(asset)

                if not hl_price:
                    continue

                deviation = self._analyze_deviation(
                    asset, hl_price, binance_price, coinbase_price
                )

                if deviation and deviation['severity'] in ['critical', 'high']:
                    exploit = self._deviation_to_kamiyo_format(deviation)
                    exploits.append(exploit)

            self.logger.info(f"Oracle Monitor: {len(exploits)} critical deviations detected")

        except Exception as e:
            self.logger.error(f"Error monitoring oracle: {e}", exc_info=True)

        return exploits

    def _fetch_hyperliquid_prices(self) -> Dict[str, float]:
        """Fetch prices from Hyperliquid"""
        payload = {"type": "allMids"}
        response = self.make_request(
            self.HYPERLIQUID_API,
            method='POST',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )

        if not response:
            return {}

        try:
            data = response.json()
            prices = {}
            for asset, price_str in data.items():
                try:
                    prices[asset] = float(price_str)
                except (ValueError, TypeError):
                    continue
            return prices
        except Exception as e:
            self.logger.error(f"Error parsing Hyperliquid prices: {e}")
            return {}

    def _fetch_binance_prices(self) -> Dict[str, float]:
        """Fetch prices from Binance"""
        prices = {}

        for asset in self.MONITORED_ASSETS:
            symbol = f"{asset}USDT"
            url = f"{self.BINANCE_API}/ticker/price"

            response = self.make_request(
                url,
                params={'symbol': symbol}
            )

            if response:
                try:
                    data = response.json()
                    prices[asset] = float(data['price'])
                except Exception as e:
                    self.logger.debug(f"Could not get Binance price for {asset}: {e}")

        return prices

    def _fetch_coinbase_prices(self) -> Dict[str, float]:
        """Fetch prices from Coinbase"""
        prices = {}

        for asset in self.MONITORED_ASSETS:
            pair = f"{asset}-USD"
            url = f"{self.COINBASE_API}/prices/{pair}/spot"

            response = self.make_request(url)

            if response:
                try:
                    data = response.json()
                    price_data = data.get('data', {})
                    prices[asset] = float(price_data.get('amount', 0))
                except Exception as e:
                    self.logger.debug(f"Could not get Coinbase price for {asset}: {e}")

        return prices

    def _analyze_deviation(
        self,
        asset: str,
        hl_price: float,
        binance_price: Optional[float],
        coinbase_price: Optional[float]
    ) -> Optional[Dict[str, Any]]:
        """Analyze price deviation for a single asset"""
        if not binance_price and not coinbase_price:
            return None

        # Calculate deviations
        deviations = []

        if binance_price:
            binance_dev = abs(hl_price - binance_price) / binance_price * 100
            deviations.append(('Binance', binance_price, binance_dev))

        if coinbase_price:
            coinbase_dev = abs(hl_price - coinbase_price) / coinbase_price * 100
            deviations.append(('Coinbase', coinbase_price, coinbase_dev))

        # Get max deviation
        max_deviation = max(deviations, key=lambda x: x[2])
        source_name, external_price, deviation_pct = max_deviation

        # Check if exceeds thresholds
        if deviation_pct < self.WARNING_THRESHOLD_PCT:
            # Remove from active deviations if it was there
            if asset in self.active_deviations:
                del self.active_deviations[asset]
            return None

        # Track deviation duration
        now = datetime.now()
        if asset in self.active_deviations:
            # Existing deviation - update
            deviation_data = self.active_deviations[asset]
            duration = (now - deviation_data['first_seen']).total_seconds()
            deviation_data['last_seen'] = now
            deviation_data['duration_sec'] = duration
            deviation_data['max_deviation_pct'] = max(
                deviation_data['max_deviation_pct'],
                deviation_pct
            )
        else:
            # New deviation - track it
            deviation_data = {
                'asset': asset,
                'hyperliquid_price': hl_price,
                'external_source': source_name,
                'external_price': external_price,
                'max_deviation_pct': deviation_pct,
                'first_seen': now,
                'last_seen': now,
                'duration_sec': 0
            }
            self.active_deviations[asset] = deviation_data

        # Only alert if sustained for threshold duration
        if deviation_data['duration_sec'] < self.DURATION_THRESHOLD_SEC:
            return None

        # Determine severity
        if deviation_pct >= self.CRITICAL_THRESHOLD_PCT:
            severity = 'critical'
        else:
            severity = 'high'

        # Calculate risk score
        risk_score = min(100, deviation_pct * 50 + (deviation_data['duration_sec'] / 60) * 10)

        return {
            'asset': asset,
            'severity': severity,
            'hyperliquid_price': hl_price,
            'external_source': source_name,
            'external_price': external_price,
            'deviation_pct': deviation_pct,
            'duration_sec': deviation_data['duration_sec'],
            'risk_score': risk_score,
            'first_seen': deviation_data['first_seen'],
            'timestamp': now
        }

    def _deviation_to_kamiyo_format(self, deviation: Dict[str, Any]) -> Dict[str, Any]:
        """Convert deviation to KAMIYO exploit format"""
        event_id = self._generate_event_id(deviation['asset'], deviation['timestamp'])

        # Estimate potential impact (very rough)
        # Assume $100M daily volume per major asset, 1% deviation = $1M potential manipulation
        estimated_impact = deviation['deviation_pct'] * 1000000

        return {
            'tx_hash': event_id,
            'chain': 'Hyperliquid',
            'protocol': 'Oracle',
            'amount_usd': estimated_impact,
            'timestamp': deviation['timestamp'],
            'source': self.name,
            'source_url': 'https://app.hyperliquid.xyz',
            'category': 'oracle_manipulation',
            'description': (
                f"Oracle price deviation detected for {deviation['asset']}. "
                f"Hyperliquid price (${deviation['hyperliquid_price']:,.2f}) deviates "
                f"{deviation['deviation_pct']:.2f}% from {deviation['external_source']} "
                f"(${deviation['external_price']:,.2f}). "
                f"Deviation sustained for {deviation['duration_sec']:.0f} seconds. "
                f"Risk Score: {deviation['risk_score']:.1f}/100"
            ),
            'recovery_status': 'monitoring'
        }

    def _generate_event_id(self, asset: str, timestamp: datetime) -> str:
        """Generate unique event ID"""
        data = f"oracle_{asset}_{timestamp.isoformat()}"
        return "oracle-" + hashlib.sha256(data.encode()).hexdigest()[:16]
