"""
Unit tests for ML Anomaly Detector
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path
import sys
import tempfile
import os

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml_models.anomaly_detector import AnomalyDetector


class TestAnomalyDetector:
    """Test suite for AnomalyDetector class"""

    @pytest.fixture
    def detector(self):
        """Create an AnomalyDetector instance"""
        return AnomalyDetector(contamination=0.1, n_estimators=50, random_state=42)

    @pytest.fixture
    def sample_training_data(self):
        """Create sample training data"""
        np.random.seed(42)

        # Generate normal data
        normal_data = pd.DataFrame({
            'feature1': np.random.normal(0, 1, 100),
            'feature2': np.random.normal(5, 2, 100),
            'feature3': np.random.normal(10, 3, 100)
        })

        return normal_data

    @pytest.fixture
    def sample_test_data_with_anomalies(self):
        """Create test data with clear anomalies"""
        np.random.seed(42)

        # Normal data
        normal = pd.DataFrame({
            'feature1': np.random.normal(0, 1, 20),
            'feature2': np.random.normal(5, 2, 20),
            'feature3': np.random.normal(10, 3, 20)
        })

        # Anomalous data (far from normal distribution)
        anomalies = pd.DataFrame({
            'feature1': [50, -50],
            'feature2': [100, -100],
            'feature3': [200, -200]
        })

        return pd.concat([normal, anomalies], ignore_index=True)

    def test_init(self, detector):
        """Test AnomalyDetector initialization"""
        assert detector is not None
        assert detector.contamination == 0.1
        assert detector.n_estimators == 50
        assert detector.random_state == 42
        assert detector.is_trained is False
        assert len(detector.feature_names) == 0

    def test_train_success(self, detector, sample_training_data):
        """Test successful model training"""
        detector.train(sample_training_data)

        assert detector.is_trained is True
        assert len(detector.feature_names) == 3
        assert detector.feature_names == ['feature1', 'feature2', 'feature3']

    def test_train_with_empty_data(self, detector):
        """Test training with empty DataFrame"""
        empty_df = pd.DataFrame()

        with pytest.raises(ValueError):
            detector.train(empty_df)

    def test_train_with_insufficient_data(self, detector):
        """Test training with too few samples"""
        small_df = pd.DataFrame({
            'feature1': [1],
            'feature2': [2]
        })

        with pytest.raises(ValueError):
            detector.train(small_df)

    def test_predict_before_training(self, detector, sample_training_data):
        """Test that predict raises error before training"""
        with pytest.raises(RuntimeError):
            detector.predict(sample_training_data)

    def test_predict_success(self, detector, sample_training_data, sample_test_data_with_anomalies):
        """Test successful anomaly prediction"""
        # Train model
        detector.train(sample_training_data)

        # Predict on test data
        results = detector.predict(sample_test_data_with_anomalies)

        assert isinstance(results, pd.DataFrame)
        assert len(results) == len(sample_test_data_with_anomalies)
        assert 'is_anomaly' in results.columns
        assert 'anomaly_score' in results.columns

        # Check that anomalies are detected (last 2 rows should be anomalies)
        last_two = results.tail(2)
        assert last_two['is_anomaly'].sum() > 0  # At least one anomaly detected

    def test_predict_with_different_features(self, detector, sample_training_data):
        """Test prediction with mismatched features"""
        # Train model
        detector.train(sample_training_data)

        # Create test data with different features
        different_df = pd.DataFrame({
            'feature4': [1, 2, 3],
            'feature5': [4, 5, 6]
        })

        with pytest.raises(ValueError):
            detector.predict(different_df)

    def test_anomaly_score_range(self, detector, sample_training_data):
        """Test that anomaly scores are in valid range [0, 100]"""
        detector.train(sample_training_data)
        results = detector.predict(sample_training_data)

        scores = results['anomaly_score']
        assert scores.min() >= 0
        assert scores.max() <= 100

    def test_get_feature_importance(self, detector, sample_training_data, sample_test_data_with_anomalies):
        """Test feature importance extraction"""
        detector.train(sample_training_data)
        results = detector.predict(sample_test_data_with_anomalies)

        # Get global feature importance from the model
        importance = detector.get_feature_importance()

        assert isinstance(importance, dict)
        assert len(importance) == 3

        # Check that all feature names are present
        for feature in ['feature1', 'feature2', 'feature3']:
            assert feature in importance

        # Check that values are valid probabilities
        for feature_name, value in importance.items():
            assert isinstance(value, (int, float))
            assert 0 <= value <= 1

        # Check that importance values sum to approximately 1.0
        total_importance = sum(importance.values())
        assert abs(total_importance - 1.0) < 0.001

    def test_save_and_load_model(self, detector, sample_training_data):
        """Test model saving and loading"""
        # Train model
        detector.train(sample_training_data)

        # Save to temporary directory
        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = Path(tmpdir) / 'test_model'
            detector.save(str(save_path))

            # Verify files exist
            assert (save_path / 'model.joblib').exists()
            assert (save_path / 'scaler.joblib').exists()
            assert (save_path / 'metadata.json').exists()

            # Load model into new detector
            new_detector = AnomalyDetector()
            new_detector.load(str(save_path))

            # Verify loaded model works
            assert new_detector.is_trained is True
            assert new_detector.feature_names == detector.feature_names

            # Verify predictions are the same
            original_results = detector.predict(sample_training_data)
            loaded_results = new_detector.predict(sample_training_data)

            np.testing.assert_array_almost_equal(
                original_results['anomaly_score'].values,
                loaded_results['anomaly_score'].values,
                decimal=5
            )

    def test_load_nonexistent_model(self, detector):
        """Test loading from nonexistent path"""
        with pytest.raises(FileNotFoundError):
            detector.load('/nonexistent/path')

    def test_model_reproducibility(self, sample_training_data):
        """Test that models with same random_state produce same results"""
        detector1 = AnomalyDetector(random_state=42)
        detector2 = AnomalyDetector(random_state=42)

        detector1.train(sample_training_data)
        detector2.train(sample_training_data)

        results1 = detector1.predict(sample_training_data)
        results2 = detector2.predict(sample_training_data)

        # Results should be identical
        np.testing.assert_array_equal(
            results1['is_anomaly'].values,
            results2['is_anomaly'].values
        )

    def test_contamination_parameter_effect(self, sample_training_data):
        """Test that contamination parameter affects anomaly detection"""
        # Low contamination (strict)
        detector_low = AnomalyDetector(contamination=0.01, random_state=42)
        detector_low.train(sample_training_data)
        results_low = detector_low.predict(sample_training_data)

        # High contamination (lenient)
        detector_high = AnomalyDetector(contamination=0.3, random_state=42)
        detector_high.train(sample_training_data)
        results_high = detector_high.predict(sample_training_data)

        # High contamination should detect more anomalies
        assert results_high['is_anomaly'].sum() >= results_low['is_anomaly'].sum()

    def test_scaling_effect(self, detector):
        """Test that StandardScaler is properly applied"""
        # Create data with different scales
        unscaled_data = pd.DataFrame({
            'small_feature': np.random.normal(0, 1, 100),
            'large_feature': np.random.normal(0, 1000, 100)
        })

        detector.train(unscaled_data)

        # Model should handle different scales
        assert detector.is_trained is True

        results = detector.predict(unscaled_data)
        assert 'anomaly_score' in results.columns


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
