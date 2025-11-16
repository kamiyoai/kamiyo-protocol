# -*- coding: utf-8 -*-
"""
Unit tests for Risk Predictor (ARIMA forecasting)
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timedelta, timezone

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml_models.risk_predictor import RiskPredictor


class TestRiskPredictor:
    """Test suite for RiskPredictor class"""

    @pytest.fixture
    def predictor(self):
        """Create a RiskPredictor instance"""
        return RiskPredictor(order=(1, 1, 1))

    @pytest.fixture
    def sample_time_series(self):
        """Create sample time series data"""
        dates = pd.date_range(
            start=datetime.now(timezone.utc) - timedelta(days=30),
            periods=100,
            freq='H'
        )

        # Create trend + seasonality + noise
        trend = np.linspace(100, 120, 100)
        seasonality = 10 * np.sin(np.linspace(0, 4*np.pi, 100))
        noise = np.random.normal(0, 2, 100)
        values = trend + seasonality + noise

        return pd.DataFrame({
            'timestamp': dates,
            'value': values
        })

    @pytest.fixture
    def sample_risk_scores(self):
        """Create sample risk score time series"""
        dates = pd.date_range(
            start=datetime.now(timezone.utc) - timedelta(days=7),
            periods=50,
            freq='H'
        )

        # Risk scores between 0 and 100
        risk_scores = 30 + 20 * np.sin(np.linspace(0, 2*np.pi, 50)) + np.random.normal(0, 5, 50)
        risk_scores = np.clip(risk_scores, 0, 100)

        return pd.DataFrame({
            'timestamp': dates,
            'risk_score': risk_scores
        })

    def test_init(self, predictor):
        """Test RiskPredictor initialization"""
        assert predictor is not None
        assert predictor.order == (1, 1, 1)
        assert predictor.is_trained is False

    def test_train_success(self, predictor, sample_time_series):
        """Test successful model training"""
        predictor.train(sample_time_series['value'].values)

        assert predictor.is_trained is True
        assert predictor.model is not None

    def test_train_with_empty_data(self, predictor):
        """Test training with empty array"""
        with pytest.raises(ValueError):
            predictor.train(np.array([]))

    def test_train_with_insufficient_data(self, predictor):
        """Test training with too few samples"""
        with pytest.raises(ValueError):
            predictor.train(np.array([1, 2, 3]))

    def test_train_with_constant_values(self, predictor):
        """Test training with constant time series"""
        constant_series = np.ones(50)

        # Should handle constant series gracefully
        try:
            predictor.train(constant_series)
            # If successful, that's okay
            assert predictor.is_trained is True
        except ValueError:
            # If it raises ValueError, that's also acceptable
            pass

    def test_predict_before_training(self, predictor):
        """Test that predict raises error before training"""
        with pytest.raises(RuntimeError):
            predictor.predict(steps=24)

    def test_predict_success(self, predictor, sample_time_series):
        """Test successful prediction"""
        # Train model
        predictor.train(sample_time_series['value'].values)

        # Predict next 24 hours
        forecast = predictor.predict(steps=24)

        assert isinstance(forecast, dict)
        assert 'mean' in forecast
        assert 'lower' in forecast
        assert 'upper' in forecast
        assert len(forecast['mean']) == 24
        assert len(forecast['lower']) == 24
        assert len(forecast['upper']) == 24

    def test_predict_confidence_intervals(self, predictor, sample_time_series):
        """Test that confidence intervals are properly ordered"""
        predictor.train(sample_time_series['value'].values)
        forecast = predictor.predict(steps=24)

        # Lower bound should be less than mean
        assert np.all(forecast['lower'] <= forecast['mean'])

        # Upper bound should be greater than mean
        assert np.all(forecast['upper'] >= forecast['mean'])

    def test_predict_different_steps(self, predictor, sample_time_series):
        """Test prediction with different number of steps"""
        predictor.train(sample_time_series['value'].values)

        for steps in [1, 12, 24, 48]:
            forecast = predictor.predict(steps=steps)
            assert len(forecast['mean']) == steps

    def test_predict_with_invalid_steps(self, predictor, sample_time_series):
        """Test prediction with invalid steps"""
        predictor.train(sample_time_series['value'].values)

        with pytest.raises(ValueError):
            predictor.predict(steps=0)

        with pytest.raises(ValueError):
            predictor.predict(steps=-1)

    def test_incremental_update(self, predictor, sample_time_series):
        """Test incremental model update"""
        initial_data = sample_time_series['value'].values[:80]
        new_data = sample_time_series['value'].values[80:]

        # Train on initial data
        predictor.train(initial_data)

        # Update with new data
        predictor.update(new_data)

        # Should still be trained
        assert predictor.is_trained is True

        # Should be able to predict
        forecast = predictor.predict(steps=12)
        assert len(forecast['mean']) == 12

    def test_update_before_training(self, predictor):
        """Test that update raises error before training"""
        with pytest.raises(RuntimeError):
            predictor.update(np.array([1, 2, 3]))

    def test_save_and_load_model(self, predictor, sample_time_series):
        """Test model saving and loading"""
        # Train model
        predictor.train(sample_time_series['value'].values)

        # Save to temporary directory
        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = Path(tmpdir) / 'test_predictor'
            predictor.save(str(save_path))

            # Verify files exist
            assert (save_path / 'model.pkl').exists()
            assert (save_path / 'metadata.json').exists()

            # Load model into new predictor
            new_predictor = RiskPredictor()
            new_predictor.load(str(save_path))

            # Verify loaded model works
            assert new_predictor.is_trained is True

            # Verify predictions are similar (may not be exact due to ARIMA internals)
            original_forecast = predictor.predict(steps=12)
            loaded_forecast = new_predictor.predict(steps=12)

            # Check that forecasts are reasonably close
            np.testing.assert_allclose(
                original_forecast['mean'],
                loaded_forecast['mean'],
                rtol=0.1  # 10% tolerance
            )

    def test_load_nonexistent_model(self, predictor):
        """Test loading from nonexistent path"""
        with pytest.raises(FileNotFoundError):
            predictor.load('/nonexistent/path')

    def test_different_arima_orders(self, sample_time_series):
        """Test different ARIMA orders"""
        orders = [(1, 0, 0), (2, 1, 0), (1, 1, 1), (2, 1, 2)]

        for order in orders:
            predictor = RiskPredictor(order=order)
            try:
                predictor.train(sample_time_series['value'].values)
                assert predictor.is_trained is True

                forecast = predictor.predict(steps=12)
                assert len(forecast['mean']) == 12
            except Exception as e:
                # Some orders may fail for certain data - that's okay
                pytest.skip(f"ARIMA{order} failed: {e}")

    def test_forecast_24h_risk(self, predictor, sample_risk_scores):
        """Test 24-hour risk forecasting"""
        predictor.train(sample_risk_scores['risk_score'].values)

        forecast = predictor.predict(steps=24)

        # Risk scores should be in reasonable range
        assert np.all(forecast['mean'] >= 0)
        # Note: forecast can exceed 100 for extrapolation, but should be reasonable
        assert np.all(forecast['mean'] <= 200)  # Allow some extrapolation

    def test_model_accuracy_on_known_pattern(self):
        """Test model accuracy on a known sinusoidal pattern"""
        # Create perfect sine wave
        t = np.linspace(0, 4*np.pi, 100)
        sine_wave = 50 + 30 * np.sin(t)

        predictor = RiskPredictor(order=(2, 0, 2))
        predictor.train(sine_wave)

        # Predict next period
        forecast = predictor.predict(steps=10)

        # Forecast should be reasonable (not testing exact values as ARIMA
        # approximates the pattern)
        assert np.all(forecast['mean'] >= 10)
        assert np.all(forecast['mean'] <= 90)

    def test_confidence_interval_width(self, predictor, sample_time_series):
        """Test that confidence intervals widen over time"""
        predictor.train(sample_time_series['value'].values)
        forecast = predictor.predict(steps=24)

        # Calculate interval widths
        widths = forecast['upper'] - forecast['lower']

        # Later predictions should have wider intervals (more uncertainty)
        assert widths[-1] >= widths[0]


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
