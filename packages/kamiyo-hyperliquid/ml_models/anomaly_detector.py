"""
ML-Powered Anomaly Detection

Uses Isolation Forest to detect anomalous behavior in Hyperliquid security monitoring data.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """
    Isolation Forest-based anomaly detector for security monitoring

    Features:
    - Unsupervised learning (no labeled data required)
    - Detects multi-variate anomalies
    - Provides anomaly scores (0-100)
    - Identifies which features contribute to anomalies
    """

    def __init__(
        self,
        contamination: float = 0.05,
        n_estimators: int = 100,
        random_state: int = 42
    ):
        """
        Initialize anomaly detector

        Args:
            contamination: Expected proportion of anomalies (0.01 = 1%)
            n_estimators: Number of trees in ensemble
            random_state: Random seed for reproducibility
        """
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state

        self.model = IsolationForest(
            contamination=contamination,
            n_estimators=n_estimators,
            random_state=random_state,
            n_jobs=-1  # Use all CPU cores
        )

        self.scaler = StandardScaler()
        self.is_trained = False
        self.feature_names = []

        self.logger = logging.getLogger(__name__)

    def train(self, features: pd.DataFrame) -> Dict[str, Any]:
        """
        Train the anomaly detector on historical data

        Args:
            features: DataFrame with extracted features

        Returns:
            Training metrics
        """
        try:
            if features.empty:
                raise ValueError("Cannot train on empty dataset")

            # Remove non-numeric and timestamp columns
            numeric_features = features.select_dtypes(include=[np.number]).copy()

            if numeric_features.empty:
                raise ValueError("No numeric features found for training")

            # Check minimum sample size
            if len(numeric_features) < 10:
                raise ValueError(f"Insufficient data for training: {len(numeric_features)} samples (minimum 10 required)")

            # Store feature names
            self.feature_names = list(numeric_features.columns)

            # Handle infinite values and NaN
            numeric_features = numeric_features.replace([np.inf, -np.inf], np.nan)
            numeric_features = numeric_features.fillna(0)

            self.logger.info(f"Training on {len(numeric_features)} samples with {len(self.feature_names)} features")

            # Scale features
            X_scaled = self.scaler.fit_transform(numeric_features)

            # Train model
            self.model.fit(X_scaled)
            self.is_trained = True

            # Get anomaly scores on training data
            scores = self.model.score_samples(X_scaled)
            predictions = self.model.predict(X_scaled)

            # Calculate metrics
            anomaly_count = sum(predictions == -1)
            anomaly_rate = anomaly_count / len(predictions) * 100

            metrics = {
                'samples_trained': len(numeric_features),
                'features_used': len(self.feature_names),
                'anomalies_detected': int(anomaly_count),
                'anomaly_rate_pct': float(anomaly_rate),
                'mean_anomaly_score': float(scores.mean()),
                'min_anomaly_score': float(scores.min()),
                'max_anomaly_score': float(scores.max())
            }

            self.logger.info(f"Training complete: {metrics}")

            return metrics

        except Exception as e:
            self.logger.error(f"Error training anomaly detector: {e}")
            raise

    def predict(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Predict anomalies on new data

        Args:
            features: DataFrame with extracted features

        Returns:
            DataFrame with anomaly predictions, scores, and details
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        if features.empty:
            return pd.DataFrame()

        try:
            # Select same features used in training
            if self.feature_names:
                # Check if all required features are present
                missing_features = set(self.feature_names) - set(features.columns)
                if missing_features:
                    raise ValueError(f"Missing features: {missing_features}")
                numeric_features = features[self.feature_names].copy()
            else:
                numeric_features = features.select_dtypes(include=[np.number]).copy()

            # Handle infinite values and NaN
            numeric_features = numeric_features.replace([np.inf, -np.inf], np.nan)
            numeric_features = numeric_features.fillna(0)

            # Scale features
            X_scaled = self.scaler.transform(numeric_features)

            # Get predictions and scores
            predictions = self.model.predict(X_scaled)
            scores = self.model.score_samples(X_scaled)

            # Convert scores to 0-100 range (lower score = more anomalous)
            # Isolation Forest scores are typically in range [-0.5, 0.5]
            anomaly_scores = self._normalize_scores(scores)

            results = []
            for i, (pred, score, anomaly_score) in enumerate(zip(predictions, scores, anomaly_scores)):
                is_anomaly = pred == -1

                result = {
                    'index': i,
                    'is_anomaly': bool(is_anomaly),
                    'anomaly_score': float(anomaly_score),  # 0-100, higher = more anomalous
                    'raw_score': float(score),  # Original Isolation Forest score
                    'timestamp': features.iloc[i].get('timestamp', datetime.now(timezone.utc))
                }

                # If anomaly, identify contributing features
                if is_anomaly:
                    contributing_features = self._identify_anomalous_features(
                        numeric_features.iloc[i],
                        threshold=2.0  # Z-score threshold
                    )
                    result['contributing_features'] = contributing_features

                results.append(result)

            self.logger.info(f"Detected {sum(r['is_anomaly'] for r in results)} anomalies in {len(results)} samples")

            # Convert to DataFrame
            return pd.DataFrame(results)

        except ValueError:
            raise
        except Exception as e:
            self.logger.error(f"Error predicting anomalies: {e}")
            return pd.DataFrame()

    def _normalize_scores(self, scores: np.ndarray) -> np.ndarray:
        """
        Normalize Isolation Forest scores to 0-100 range

        Lower Isolation Forest scores indicate anomalies.
        We convert to 0-100 where higher = more anomalous.

        Args:
            scores: Raw Isolation Forest scores

        Returns:
            Normalized scores (0-100)
        """
        # Isolation Forest scores typically range from -0.5 to 0.5
        # Invert and scale to 0-100
        min_score = scores.min()
        max_score = scores.max()

        if max_score == min_score:
            return np.full_like(scores, 50.0)

        # Invert (lower score = higher anomaly)
        inverted = max_score - scores

        # Scale to 0-100
        normalized = (inverted - inverted.min()) / (inverted.max() - inverted.min()) * 100

        return normalized

    def _identify_anomalous_features(
        self,
        sample: pd.Series,
        threshold: float = 2.0
    ) -> List[Dict[str, Any]]:
        """
        Identify which features contribute to an anomaly

        Args:
            sample: Feature values for one sample
            threshold: Z-score threshold for considering feature anomalous

        Returns:
            List of anomalous features with details
        """
        anomalous_features = []

        try:
            for feature_name in self.feature_names:
                if feature_name not in sample.index:
                    continue

                value = sample[feature_name]

                # Skip zero/NaN values
                if pd.isna(value) or value == 0:
                    continue

                # Simple z-score check (could be improved with actual distribution)
                # For now, flag extreme values
                if abs(value) > threshold:
                    anomalous_features.append({
                        'feature': feature_name,
                        'value': float(value),
                        'severity': 'high' if abs(value) > 3.0 else 'medium'
                    })

        except Exception as e:
            self.logger.error(f"Error identifying anomalous features: {e}")

        return anomalous_features

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance scores for the trained model

        Calculates feature importance by analyzing the frequency and depth
        of feature usage across all decision trees in the Isolation Forest.

        Returns:
            Dictionary mapping feature names to normalized importance scores (0-1)
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained")

        try:
            # Get feature importance from the ensemble's decision trees
            # Each tree in Isolation Forest can provide feature importance
            # based on how much each feature contributes to isolation
            n_features = len(self.feature_names)
            importance_sum = np.zeros(n_features)

            # Aggregate importance across all estimators
            for estimator in self.model.estimators_:
                # Each estimator is a DecisionTreeRegressor
                # Use feature usage frequency as importance proxy
                if hasattr(estimator.tree_, 'feature'):
                    features = estimator.tree_.feature
                    # Count how often each feature is used for splitting
                    for feature_idx in features:
                        if feature_idx >= 0:  # -2 indicates leaf node
                            importance_sum[feature_idx] += 1

            # Normalize to sum to 1.0
            if importance_sum.sum() > 0:
                importance_normalized = importance_sum / importance_sum.sum()
            else:
                # Fallback to equal importance if no splits found
                importance_normalized = np.ones(n_features) / n_features

            # Create dictionary mapping feature names to importance
            importance_dict = {
                feature: float(importance_normalized[i])
                for i, feature in enumerate(self.feature_names)
            }

            # Sort by importance (descending) for easier interpretation
            importance_dict = dict(sorted(
                importance_dict.items(),
                key=lambda x: x[1],
                reverse=True
            ))

            self.logger.debug(f"Feature importance calculated: top 3 = {list(importance_dict.items())[:3]}")

            return importance_dict

        except Exception as e:
            self.logger.warning(f"Could not calculate feature importance: {e}. Using equal weights.")
            # Fallback to equal importance
            return {feature: 1.0 / len(self.feature_names) for feature in self.feature_names}

    def save(self, path: str):
        """
        Save trained model to disk

        Args:
            path: Directory path to save model files
        """
        if not self.is_trained:
            raise RuntimeError("Cannot save untrained model")

        try:
            save_dir = Path(path)
            save_dir.mkdir(parents=True, exist_ok=True)

            # Save model (with both new and legacy names for compatibility)
            joblib.dump(self.model, save_dir / 'anomaly_model.joblib')
            joblib.dump(self.model, save_dir / 'model.joblib')  # Legacy name

            # Save scaler
            joblib.dump(self.scaler, save_dir / 'anomaly_scaler.joblib')
            joblib.dump(self.scaler, save_dir / 'scaler.joblib')  # Legacy name

            # Save metadata
            metadata = {
                'feature_names': self.feature_names,
                'contamination': self.contamination,
                'n_estimators': self.n_estimators,
                'is_trained': self.is_trained,
                'trained_at': datetime.now(timezone.utc).isoformat()
            }
            joblib.dump(metadata, save_dir / 'anomaly_metadata.joblib')
            joblib.dump(metadata, save_dir / 'metadata.joblib')  # Legacy name

            # Also save as JSON for human readability
            import json
            with open(save_dir / 'metadata.json', 'w') as f:
                json.dump(metadata, f, indent=2)

            self.logger.info(f"Model saved to {save_dir}")

        except Exception as e:
            self.logger.error(f"Error saving model: {e}")
            raise

    def load(self, path: str):
        """
        Load trained model from disk

        Args:
            path: Directory path containing model files
        """
        try:
            load_dir = Path(path)

            if not load_dir.exists():
                raise FileNotFoundError(f"Model directory not found: {load_dir}")

            # Load model
            self.model = joblib.load(load_dir / 'anomaly_model.joblib')

            # Load scaler
            self.scaler = joblib.load(load_dir / 'anomaly_scaler.joblib')

            # Load metadata
            metadata = joblib.load(load_dir / 'anomaly_metadata.joblib')
            self.feature_names = metadata['feature_names']
            self.contamination = metadata['contamination']
            self.n_estimators = metadata['n_estimators']
            self.is_trained = True

            self.logger.info(f"Model loaded from {load_dir}")
            self.logger.info(f"Model trained at: {metadata.get('trained_at', 'unknown')}")

        except Exception as e:
            self.logger.error(f"Error loading model: {e}")
            raise
