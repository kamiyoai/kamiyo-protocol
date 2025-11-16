"""
Unit tests for Feature Engineering
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml_models.feature_engineering import FeatureEngineer


class TestFeatureEngineer:
    """Test suite for FeatureEngineer class"""

    @pytest.fixture
    def feature_engineer(self):
        """Create a FeatureEngineer instance"""
        return FeatureEngineer()

    @pytest.fixture
    def sample_hlp_snapshots(self):
        """Create sample HLP vault snapshots for testing"""
        base_time = datetime.now(timezone.utc)
        snapshots = []

        for i in range(50):
            snapshots.append({
                'timestamp': base_time + timedelta(hours=i),
                'account_value': Decimal('577000000') + Decimal(i * 10000),
                'pnl_24h': Decimal(i * 1000 - 50000),
                'all_time_pnl': Decimal(i * 5000),
                'sharpe_ratio': 1.5 + (i * 0.01),
                'max_drawdown': 0.05 + (i * 0.001)
            })

        return snapshots

    @pytest.fixture
    def sample_oracle_deviations(self):
        """Create sample oracle deviation data - grouped by asset"""
        base_time = datetime.now(timezone.utc)

        # Format expected by extract_oracle_features: dict with asset as key
        deviations = {
            'BTC': [],
            'ETH': []
        }

        for i in range(15):
            deviations['BTC'].append({
                'timestamp': base_time + timedelta(minutes=i),
                'max_deviation_pct': 0.1 + (i * 0.01),
                'duration_sec': 10 + i,
                'risk_score': 20 + i,
                'hyperliquid_price': 50000 + i * 100,
                'binance_price': 50050 + i * 100
            })

            deviations['ETH'].append({
                'timestamp': base_time + timedelta(minutes=i),
                'max_deviation_pct': 0.1 + (i * 0.01),
                'duration_sec': 10 + i,
                'risk_score': 20 + i,
                'hyperliquid_price': 3000 + i * 10,
                'binance_price': 3005 + i * 10
            })

        return deviations

    @pytest.fixture
    def sample_liquidations(self):
        """Create sample liquidation events"""
        base_time = datetime.now(timezone.utc)
        liquidations = []

        for i in range(20):
            liquidations.append({
                'timestamp': base_time + timedelta(minutes=i * 5),
                'amount_usd': 100000 + (i * 10000),
                'liquidation_price': 50000 + (i * 100),
                'asset': 'BTC'
            })

        return liquidations

    def test_init(self, feature_engineer):
        """Test FeatureEngineer initialization"""
        assert feature_engineer is not None
        assert hasattr(feature_engineer, 'logger')

    def test_extract_hlp_features_empty_input(self, feature_engineer):
        """Test extract_hlp_features with empty input"""
        result = feature_engineer.extract_hlp_features([])
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_extract_hlp_features_single_snapshot(self, feature_engineer):
        """Test extract_hlp_features with single snapshot (insufficient data)"""
        snapshot = [{
            'timestamp': datetime.now(timezone.utc),
            'account_value': Decimal('577000000'),
            'pnl_24h': Decimal('-50000')
        }]
        result = feature_engineer.extract_hlp_features(snapshot)
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_extract_hlp_features_success(self, feature_engineer, sample_hlp_snapshots):
        """Test successful HLP feature extraction"""
        result = feature_engineer.extract_hlp_features(sample_hlp_snapshots)

        assert isinstance(result, pd.DataFrame)
        assert len(result) > 0

        # Check for expected feature columns
        expected_features = [
            'return_1h', 'return_24h', 'return_7d',
            'volatility_24h', 'volatility_7d',
            'pnl_momentum', 'pnl_acceleration'
        ]

        for feature in expected_features:
            assert feature in result.columns, f"Missing feature: {feature}"

    def test_extract_hlp_features_decimal_conversion(self, feature_engineer):
        """Test that Decimal values are properly converted to float"""
        snapshots = [
            {
                'timestamp': datetime.now(timezone.utc),
                'account_value': Decimal('1000000'),
                'pnl_24h': Decimal('5000')
            },
            {
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=1),
                'account_value': Decimal('1010000'),
                'pnl_24h': Decimal('6000')
            }
        ]

        result = feature_engineer.extract_hlp_features(snapshots)

        # Check that numeric columns are float, not Decimal
        if 'account_value' in result.columns:
            assert result['account_value'].dtype in [np.float64, np.float32, np.int64]

    def test_extract_oracle_features_empty_input(self, feature_engineer):
        """Test extract_oracle_features with empty input"""
        result = feature_engineer.extract_oracle_features({})
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_extract_oracle_features_success(self, feature_engineer, sample_oracle_deviations):
        """Test successful oracle feature extraction"""
        result = feature_engineer.extract_oracle_features(sample_oracle_deviations)

        assert isinstance(result, pd.DataFrame)
        assert len(result) > 0

    def test_extract_liquidation_features_empty_input(self, feature_engineer):
        """Test extract_liquidation_features with empty input"""
        result = feature_engineer.extract_liquidation_features([])
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_extract_liquidation_features_success(self, feature_engineer, sample_liquidations):
        """Test successful liquidation feature extraction"""
        result = feature_engineer.extract_liquidation_features(sample_liquidations)

        assert isinstance(result, pd.DataFrame)
        assert len(result) > 0

    def test_feature_extraction_with_missing_columns(self, feature_engineer):
        """Test feature extraction handles missing columns gracefully"""
        incomplete_snapshots = [
            {'timestamp': datetime.now(timezone.utc)},
            {'timestamp': datetime.now(timezone.utc) + timedelta(hours=1)}
        ]

        # Should not raise exception
        result = feature_engineer.extract_hlp_features(incomplete_snapshots)
        assert isinstance(result, pd.DataFrame)

    def test_feature_extraction_with_nan_values(self, feature_engineer):
        """Test feature extraction handles NaN values"""
        snapshots = [
            {
                'timestamp': datetime.now(timezone.utc),
                'account_value': None,
                'pnl_24h': Decimal('5000')
            },
            {
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=1),
                'account_value': Decimal('1000000'),
                'pnl_24h': None
            }
        ]

        result = feature_engineer.extract_hlp_features(snapshots)
        assert isinstance(result, pd.DataFrame)

    def test_timestamp_sorting(self, feature_engineer):
        """Test that snapshots are sorted by timestamp"""
        snapshots = [
            {
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=2),
                'account_value': Decimal('1000000')
            },
            {
                'timestamp': datetime.now(timezone.utc),
                'account_value': Decimal('1000000')
            },
            {
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=1),
                'account_value': Decimal('1000000')
            }
        ]

        result = feature_engineer.extract_hlp_features(snapshots)

        if len(result) > 0 and 'timestamp' in result.columns:
            # Check that timestamps are sorted
            timestamps = result['timestamp'].tolist()
            assert timestamps == sorted(timestamps)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
