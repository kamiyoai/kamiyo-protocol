"""
Feature Engineering for ML Models

Extracts features from monitoring data for anomaly detection and risk prediction.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """
    Feature engineering for Hyperliquid security monitoring

    Extracts features from:
    - HLP vault snapshots
    - Oracle price deviations
    - Liquidation events
    """

    def __init__(self):
        """Initialize feature engineer"""
        self.logger = logging.getLogger(__name__)

    def extract_hlp_features(self, snapshots: List[Dict[str, Any]]) -> pd.DataFrame:
        """
        Extract features from HLP vault snapshots

        Args:
            snapshots: List of HLP vault snapshots

        Returns:
            DataFrame with extracted features
        """
        if not snapshots or len(snapshots) < 2:
            return pd.DataFrame()

        try:
            df = pd.DataFrame(snapshots)

            # Ensure timestamp is datetime
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                df = df.sort_values('timestamp')

            # Convert Decimal to float for calculations
            numeric_cols = ['account_value', 'pnl_24h', 'all_time_pnl', 'sharpe_ratio', 'max_drawdown']
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = df[col].apply(lambda x: float(x) if isinstance(x, Decimal) else x)

            # Feature 1: Returns
            if 'account_value' in df.columns:
                df['return_1h'] = df['account_value'].pct_change()
                df['return_24h'] = df['account_value'].pct_change(periods=min(24, len(df)-1))
                df['return_7d'] = df['account_value'].pct_change(periods=min(168, len(df)-1))

            # Feature 2: Volatility (rolling std of returns)
            if 'return_1h' in df.columns:
                df['volatility_24h'] = df['return_1h'].rolling(window=min(24, len(df)), min_periods=1).std()
                df['volatility_7d'] = df['return_1h'].rolling(window=min(168, len(df)), min_periods=1).std()

            # Feature 3: PnL momentum
            if 'pnl_24h' in df.columns:
                df['pnl_momentum'] = df['pnl_24h'].diff()
                df['pnl_acceleration'] = df['pnl_momentum'].diff()

            # Feature 4: Drawdown features
            if 'max_drawdown' in df.columns:
                df['drawdown_change'] = df['max_drawdown'].diff()
                df['drawdown_velocity'] = df['drawdown_change'].diff()

            # Feature 5: Sharpe ratio trend
            if 'sharpe_ratio' in df.columns:
                df['sharpe_trend'] = df['sharpe_ratio'].diff()
                df['sharpe_ma_7d'] = df['sharpe_ratio'].rolling(window=min(168, len(df)), min_periods=1).mean()

            # Feature 6: Z-scores (statistical anomalies)
            if 'account_value' in df.columns and len(df) >= 30:
                mean_val = df['account_value'].mean()
                std_val = df['account_value'].std()
                if std_val > 0:
                    df['account_value_zscore'] = (df['account_value'] - mean_val) / std_val

            if 'pnl_24h' in df.columns and len(df) >= 30:
                mean_pnl = df['pnl_24h'].mean()
                std_pnl = df['pnl_24h'].std()
                if std_pnl > 0:
                    df['pnl_24h_zscore'] = (df['pnl_24h'] - mean_pnl) / std_pnl

            # Feature 7: Time-based features
            if 'timestamp' in df.columns:
                df['hour_of_day'] = df['timestamp'].dt.hour
                df['day_of_week'] = df['timestamp'].dt.dayofweek
                df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)

            # Fill NaN values
            df = df.fillna(0)

            return df

        except Exception as e:
            self.logger.error(f"Error extracting HLP features: {e}")
            return pd.DataFrame()

    def extract_oracle_features(self, deviations: Dict[str, List[Dict[str, Any]]]) -> pd.DataFrame:
        """
        Extract features from oracle price deviations

        Args:
            deviations: Dictionary mapping assets to lists of deviation events

        Returns:
            DataFrame with extracted features
        """
        if not deviations:
            return pd.DataFrame()

        try:
            features_list = []

            for asset, dev_list in deviations.items():
                if not dev_list:
                    continue

                df = pd.DataFrame(dev_list)

                if 'timestamp' in df.columns:
                    df['timestamp'] = pd.to_datetime(df['timestamp'])
                    df = df.sort_values('timestamp')

                # Convert numeric columns
                numeric_cols = ['hyperliquid_price', 'binance_price', 'coinbase_price',
                               'max_deviation_pct', 'risk_score']
                for col in numeric_cols:
                    if col in df.columns:
                        df[col] = df[col].apply(lambda x: float(x) if isinstance(x, (Decimal, str)) else x)

                # Feature 1: Deviation magnitude
                if 'max_deviation_pct' in df.columns:
                    df['deviation_mean_1h'] = df['max_deviation_pct'].rolling(window=min(60, len(df)), min_periods=1).mean()
                    df['deviation_max_1h'] = df['max_deviation_pct'].rolling(window=min(60, len(df)), min_periods=1).max()
                    df['deviation_std_1h'] = df['max_deviation_pct'].rolling(window=min(60, len(df)), min_periods=1).std()

                # Feature 2: Price velocity
                if 'hyperliquid_price' in df.columns:
                    df['price_velocity'] = df['hyperliquid_price'].diff()
                    df['price_acceleration'] = df['price_velocity'].diff()

                # Feature 3: Cross-exchange spread
                if all(col in df.columns for col in ['hyperliquid_price', 'binance_price']):
                    df['hl_binance_spread'] = abs(df['hyperliquid_price'] - df['binance_price']) / df['binance_price'] * 100

                if all(col in df.columns for col in ['binance_price', 'coinbase_price']):
                    df['binance_coinbase_spread'] = abs(df['binance_price'] - df['coinbase_price']) / df['coinbase_price'] * 100

                # Feature 4: Deviation persistence
                if 'max_deviation_pct' in df.columns:
                    df['high_deviation_count_1h'] = (df['max_deviation_pct'] > 0.5).rolling(window=min(60, len(df)), min_periods=1).sum()

                # Feature 5: Risk score trends
                if 'risk_score' in df.columns:
                    df['risk_score_ma'] = df['risk_score'].rolling(window=min(60, len(df)), min_periods=1).mean()
                    df['risk_score_trend'] = df['risk_score'].diff()

                df['asset'] = asset
                features_list.append(df)

            if features_list:
                result = pd.concat(features_list, ignore_index=True)
                result = result.fillna(0)
                return result

            return pd.DataFrame()

        except Exception as e:
            self.logger.error(f"Error extracting oracle features: {e}")
            return pd.DataFrame()

    def extract_liquidation_features(self, liquidations: List[Dict[str, Any]]) -> pd.DataFrame:
        """
        Extract features from liquidation events

        Args:
            liquidations: List of liquidation events

        Returns:
            DataFrame with liquidation features
        """
        if not liquidations or len(liquidations) < 2:
            return pd.DataFrame()

        try:
            df = pd.DataFrame(liquidations)

            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                df = df.sort_values('timestamp')

            # Convert numeric columns
            if 'value_usd' in df.columns:
                df['value_usd'] = df['value_usd'].apply(lambda x: float(x) if isinstance(x, (Decimal, str)) else x)

            # Feature 1: Liquidation count over time windows
            if 'timestamp' in df.columns:
                df = df.set_index('timestamp')
                df['liquidation_count_5min'] = df.rolling('5min').size()
                df['liquidation_count_1h'] = df.rolling('1h').size()
                df['liquidation_count_24h'] = df.rolling('24h').size()
                df = df.reset_index()

            # Feature 2: Liquidation value aggregates
            if 'value_usd' in df.columns and 'timestamp' in df.columns:
                df = df.set_index('timestamp')
                df['total_value_5min'] = df['value_usd'].rolling('5min').sum()
                df['total_value_1h'] = df['value_usd'].rolling('1h').sum()
                df['avg_value_1h'] = df['value_usd'].rolling('1h').mean()
                df['max_value_1h'] = df['value_usd'].rolling('1h').max()
                df = df.reset_index()

            # Feature 3: Liquidation size distribution
            if 'value_usd' in df.columns:
                df['value_zscore'] = (df['value_usd'] - df['value_usd'].mean()) / (df['value_usd'].std() + 1e-10)

            # Feature 4: Time between liquidations
            if 'timestamp' in df.columns:
                df['time_since_last'] = df['timestamp'].diff().dt.total_seconds()
                df['avg_time_between_5min'] = df['time_since_last'].rolling(window=min(5, len(df)), min_periods=1).mean()

            # Feature 5: Cascade indicators
            if 'liquidation_count_5min' in df.columns:
                df['is_cascade'] = (df['liquidation_count_5min'] >= 3).astype(int)

            # Fill NaN values
            df = df.fillna(0)

            return df

        except Exception as e:
            self.logger.error(f"Error extracting liquidation features: {e}")
            return pd.DataFrame()

    def create_training_features(
        self,
        hlp_data: Optional[List[Dict[str, Any]]] = None,
        oracle_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        liquidation_data: Optional[List[Dict[str, Any]]] = None
    ) -> pd.DataFrame:
        """
        Create unified feature set for model training

        Combines features from all data sources with temporal alignment

        Args:
            hlp_data: HLP vault snapshots
            oracle_data: Oracle deviation data by asset
            liquidation_data: Liquidation events

        Returns:
            Unified DataFrame with all features
        """
        try:
            features = {}

            # Extract features from each source
            if hlp_data:
                hlp_features = self.extract_hlp_features(hlp_data)
                if not hlp_features.empty:
                    features['hlp'] = hlp_features

            if oracle_data:
                oracle_features = self.extract_oracle_features(oracle_data)
                if not oracle_features.empty:
                    features['oracle'] = oracle_features

            if liquidation_data:
                liq_features = self.extract_liquidation_features(liquidation_data)
                if not liq_features.empty:
                    features['liquidation'] = liq_features

            if not features:
                self.logger.warning("No features extracted from any data source")
                return pd.DataFrame()

            # For now, return the HLP features as primary (can be extended to merge all sources)
            if 'hlp' in features:
                return features['hlp']
            elif 'oracle' in features:
                return features['oracle']
            elif 'liquidation' in features:
                return features['liquidation']

            return pd.DataFrame()

        except Exception as e:
            self.logger.error(f"Error creating training features: {e}")
            return pd.DataFrame()

    def get_feature_names(self) -> List[str]:
        """
        Get list of feature names used for training

        Returns:
            List of feature column names
        """
        return [
            # HLP features
            'account_value', 'pnl_24h', 'all_time_pnl', 'sharpe_ratio', 'max_drawdown',
            'return_1h', 'return_24h', 'return_7d',
            'volatility_24h', 'volatility_7d',
            'pnl_momentum', 'pnl_acceleration',
            'drawdown_change', 'drawdown_velocity',
            'sharpe_trend', 'sharpe_ma_7d',
            'account_value_zscore', 'pnl_24h_zscore',
            'hour_of_day', 'day_of_week', 'is_weekend',

            # Oracle features
            'max_deviation_pct', 'deviation_mean_1h', 'deviation_max_1h', 'deviation_std_1h',
            'price_velocity', 'price_acceleration',
            'hl_binance_spread', 'binance_coinbase_spread',
            'high_deviation_count_1h',
            'risk_score', 'risk_score_ma', 'risk_score_trend',

            # Liquidation features
            'liquidation_count_5min', 'liquidation_count_1h', 'liquidation_count_24h',
            'total_value_5min', 'total_value_1h',
            'avg_value_1h', 'max_value_1h',
            'value_zscore',
            'time_since_last', 'avg_time_between_5min',
            'is_cascade'
        ]
