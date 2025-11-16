"""
DeFi-Specific Feature Engineering

Enhances generic ML features with DeFi and Hyperliquid-specific signals
to reduce false positives and improve detection accuracy.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class DeFiFeatureEngineer:
    """
    Adds DeFi-specific features to enhance anomaly detection

    Features added:
    - Market context (volatility, correlation)
    - Hyperliquid-specific (HLP metrics, oracle health)
    - Cross-protocol signals (recent exploits, market stress)
    """

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

        # Market state cache (to avoid repeated API calls)
        self.market_cache = {}
        self.cache_ttl = timedelta(minutes=5)

    def add_defi_features(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Add DeFi-specific features to existing feature set

        Args:
            features: Base features from FeatureEngineer

        Returns:
            Enhanced features with DeFi-specific columns
        """
        enhanced = features.copy()

        try:
            # Market context features
            enhanced = self._add_market_context(enhanced)

            # Hyperliquid-specific features
            enhanced = self._add_hyperliquid_features(enhanced)

            # Cross-protocol signals
            enhanced = self._add_cross_protocol_signals(enhanced)

            # Temporal features
            enhanced = self._add_temporal_features(enhanced)

            self.logger.info(f"Added DeFi features: {enhanced.shape[1] - features.shape[1]} new columns")

        except Exception as e:
            self.logger.error(f"Error adding DeFi features: {e}")
            # Return original features if enhancement fails
            return features

        return enhanced

    def _add_market_context(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Add market context features

        Features:
        - market_volatility_index: Crypto market volatility (VIX equivalent)
        - btc_correlation: Correlation with BTC (indicates market-wide vs. protocol-specific)
        - funding_rate_stress: Abnormal funding rates (manipulation indicator)
        """
        # Crypto Volatility Index (simplified - could use real CVX data)
        features['market_volatility_index'] = self._get_market_volatility()

        # BTC correlation (high correlation = market-wide event, low = protocol-specific)
        features['btc_correlation'] = self._get_btc_correlation()

        # Funding rate stress (extreme funding = potential manipulation)
        features['funding_rate_stress'] = self._get_funding_rate_stress()

        return features

    def _add_hyperliquid_features(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Add Hyperliquid-specific features

        Features:
        - hlp_concentration_risk: Position concentration in HLP vault
        - oracle_source_count: Number of active oracle sources
        - oracle_deviation_max: Max deviation across oracles
        - liquidation_cascade_risk: Risk of cascading liquidations
        """
        # HLP position concentration
        features['hlp_concentration_risk'] = self._calculate_concentration_risk()

        # Oracle health metrics
        oracle_metrics = self._get_oracle_health()
        features['oracle_source_count'] = oracle_metrics['source_count']
        features['oracle_deviation_max'] = oracle_metrics['max_deviation']
        features['oracle_health_score'] = oracle_metrics['health_score']

        # Liquidation cascade risk
        features['liquidation_cascade_risk'] = self._calculate_cascade_risk()

        return features

    def _add_cross_protocol_signals(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Add cross-protocol security signals

        Features:
        - recent_defi_exploits_24h: Count of exploits in last 24h
        - market_stress_index: Overall DeFi market stress
        - similar_protocol_incidents: Incidents on similar protocols
        """
        # Recent DeFi exploits (from our own database or external)
        features['recent_defi_exploits_24h'] = self._count_recent_exploits(hours=24)

        # Market stress (TVL outflows, gas prices, etc.)
        features['market_stress_index'] = self._calculate_market_stress()

        # Similar protocol incidents
        features['similar_protocol_incidents'] = self._count_similar_incidents()

        return features

    def _add_temporal_features(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Add time-based features

        Features:
        - is_weekend: Weekend activity (lower liquidity)
        - is_market_hours: Traditional market hours (correlation with TradFi)
        - hour_of_day: Circadian patterns
        """
        now = datetime.now(timezone.utc)

        # Weekend indicator (lower liquidity, higher manipulation risk)
        features['is_weekend'] = float(now.weekday() >= 5)

        # Market hours (9:30 AM - 4:00 PM EST)
        est_hour = (now.hour - 5) % 24  # Convert UTC to EST
        features['is_market_hours'] = float(9.5 <= est_hour <= 16)

        # Hour of day (some attacks happen at specific times)
        features['hour_of_day'] = now.hour

        # Time since last major event (recency matters)
        features['hours_since_last_exploit'] = self._hours_since_last_event()

        return features

    # ===== Helper methods (simplified implementations) =====

    def _get_market_volatility(self) -> float:
        """
        Get crypto market volatility index

        In production: Use real CVX (Crypto Volatility Index) or calculate from BTC/ETH
        """
        cache_key = 'market_volatility'
        if self._is_cached(cache_key):
            return self.market_cache[cache_key]['value']

        # Simplified: Return moderate volatility
        # Real implementation would fetch from crypto VIX equivalent
        volatility = 30.0  # Baseline moderate volatility

        self._cache_value(cache_key, volatility)
        return volatility

    def _get_btc_correlation(self) -> float:
        """
        Calculate correlation with BTC price movement

        High correlation = market-wide movement (less suspicious)
        Low correlation = protocol-specific (more suspicious)
        """
        # Simplified: Return moderate correlation
        # Real implementation would calculate actual correlation
        return 0.7  # 70% correlation with BTC

    def _get_funding_rate_stress(self) -> float:
        """
        Measure funding rate abnormality

        Extreme funding rates can indicate manipulation
        """
        # Simplified: Return normal funding
        # Real implementation would fetch actual funding rates
        return 0.1  # Normal funding rate stress

    def _calculate_concentration_risk(self) -> float:
        """
        Calculate HLP vault position concentration

        High concentration = higher risk if position goes wrong
        """
        # Simplified: Return moderate concentration
        # Real implementation would analyze actual HLP positions
        return 0.25  # 25% concentration in largest position

    def _get_oracle_health(self) -> Dict[str, float]:
        """
        Get oracle system health metrics
        """
        # Simplified: Return healthy oracle state
        # Real implementation would query actual oracle sources
        return {
            'source_count': 3.0,      # Using 3 oracle sources
            'max_deviation': 0.1,     # 0.1% max deviation
            'health_score': 95.0      # 95/100 health
        }

    def _calculate_cascade_risk(self) -> float:
        """
        Calculate risk of liquidation cascades

        High risk when many positions near liquidation price
        """
        # Simplified: Return low cascade risk
        # Real implementation would analyze position distribution
        return 0.15  # 15% cascade risk

    def _count_recent_exploits(self, hours: int = 24) -> float:
        """
        Count DeFi exploits in recent time window

        Recent exploits indicate heightened risk period
        """
        # Simplified: Return baseline
        # Real implementation would query exploit database
        return 0.0  # No recent exploits

    def _calculate_market_stress(self) -> float:
        """
        Calculate overall DeFi market stress index

        Combines TVL flows, gas prices, volatility, etc.
        """
        # Simplified: Return moderate stress
        # Real implementation would combine multiple signals
        return 30.0  # 30/100 stress level

    def _count_similar_incidents(self) -> float:
        """
        Count incidents on similar protocols

        Similar protocols (other perp DEXs) having issues = higher risk
        """
        # Simplified: Return baseline
        # Real implementation would track similar protocols
        return 0.0  # No similar incidents

    def _hours_since_last_event(self) -> float:
        """
        Hours since last major security event

        Recent events = heightened vigilance needed
        """
        # Simplified: Return moderate recency
        # Real implementation would query event database
        return 72.0  # 3 days since last event

    # ===== Cache management =====

    def _is_cached(self, key: str) -> bool:
        """Check if value is in cache and not expired"""
        if key not in self.market_cache:
            return False

        cached = self.market_cache[key]
        age = datetime.now(timezone.utc) - cached['timestamp']

        return age < self.cache_ttl

    def _cache_value(self, key: str, value: Any):
        """Cache a value with timestamp"""
        self.market_cache[key] = {
            'value': value,
            'timestamp': datetime.now(timezone.utc)
        }

    def get_feature_names(self) -> List[str]:
        """
        Get list of DeFi-specific feature names

        Returns:
            List of feature names added by this engineer
        """
        return [
            # Market context
            'market_volatility_index',
            'btc_correlation',
            'funding_rate_stress',

            # Hyperliquid-specific
            'hlp_concentration_risk',
            'oracle_source_count',
            'oracle_deviation_max',
            'oracle_health_score',
            'liquidation_cascade_risk',

            # Cross-protocol
            'recent_defi_exploits_24h',
            'market_stress_index',
            'similar_protocol_incidents',

            # Temporal
            'is_weekend',
            'is_market_hours',
            'hour_of_day',
            'hours_since_last_exploit'
        ]

    def get_feature_importance_explanation(self) -> Dict[str, str]:
        """
        Get human-readable explanations for each feature

        Returns:
            Dictionary mapping feature names to explanations
        """
        return {
            'market_volatility_index': 'Higher crypto market volatility = more normal price swings',
            'btc_correlation': 'High BTC correlation = market-wide event (less suspicious)',
            'funding_rate_stress': 'Extreme funding rates can indicate manipulation',
            'hlp_concentration_risk': 'High position concentration = higher impact if wrong',
            'oracle_source_count': 'Fewer oracle sources = higher manipulation risk',
            'oracle_deviation_max': 'Large oracle deviations indicate price feed issues',
            'oracle_health_score': 'Overall oracle system health (0-100)',
            'liquidation_cascade_risk': 'Risk of cascading liquidations amplifying moves',
            'recent_defi_exploits_24h': 'Recent exploits = heightened risk period',
            'market_stress_index': 'Overall DeFi market stress level (0-100)',
            'similar_protocol_incidents': 'Issues on similar protocols = elevated risk',
            'is_weekend': 'Weekend = lower liquidity, higher manipulation risk',
            'is_market_hours': 'Traditional market hours = different behavior patterns',
            'hour_of_day': 'Time of day patterns (some attacks at specific times)',
            'hours_since_last_exploit': 'Recency of last security event'
        }
