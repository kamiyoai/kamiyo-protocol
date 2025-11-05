# -*- coding: utf-8 -*-
"""
Ensemble Anomaly Detector - Proprietary kamiyo.ai model
Combines multiple ML algorithms for superior detection accuracy

This is a PROPRIETARY component for Pro/Enterprise tiers
"""

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class EnsembleAnomalyDetector:
    """
    Advanced ensemble model combining multiple detectors

    Architecture:
    1. Isolation Forest (unsupervised)
    2. One-Class SVM (unsupervised)
    3. Random Forest (semi-supervised with historical labels)

    Uses weighted voting for final decision
    """

    def __init__(
        self,
        contamination: float = 0.05,
        ensemble_weights: Optional[List[float]] = None
    ):
        """
        Initialize ensemble detector

        Args:
            contamination: Expected anomaly proportion
            ensemble_weights: Weights for each model [IF, SVM, RF]
        """
        self.contamination = contamination
        self.weights = ensemble_weights or [0.4, 0.3, 0.3]

        self.isolation_forest = IsolationForest(
            contamination=contamination,
            n_estimators=200,
            random_state=42
        )

        self.one_class_svm = OneClassSVM(
            nu=contamination,
            kernel='rbf',
            gamma='auto'
        )

        self.random_forest = RandomForestClassifier(
            n_estimators=100,
            random_state=42
        )

        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(
        self,
        X: pd.DataFrame,
        y: Optional[np.ndarray] = None
    ):
        """
        Train ensemble on historical data

        Args:
            X: Feature DataFrame
            y: Optional labels for semi-supervised learning
        """
        X_scaled = self.scaler.fit_transform(X)

        self.isolation_forest.fit(X_scaled)
        self.one_class_svm.fit(X_scaled)

        if y is not None:
            self.random_forest.fit(X_scaled, y)

        self.is_fitted = True
        logger.info("Ensemble detector trained successfully")

    def predict_ensemble(
        self,
        X: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, np.ndarray]]:
        """
        Predict using ensemble voting

        Args:
            X: Feature DataFrame

        Returns:
            Tuple of (predictions, confidence_scores, individual_predictions)
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted first")

        X_scaled = self.scaler.transform(X)

        if_pred = self.isolation_forest.predict(X_scaled)
        svm_pred = self.one_class_svm.predict(X_scaled)

        if hasattr(self.random_forest, 'classes_'):
            rf_pred_prob = self.random_forest.predict_proba(X_scaled)[:, 1]
            rf_pred = np.where(rf_pred_prob > 0.5, 1, -1)
        else:
            rf_pred = np.ones(len(X))

        weighted_sum = (
            self.weights[0] * if_pred +
            self.weights[1] * svm_pred +
            self.weights[2] * rf_pred
        )

        ensemble_pred = np.where(weighted_sum > 0, 1, -1)
        confidence = np.abs(weighted_sum) / sum(self.weights)

        individual_preds = {
            'isolation_forest': if_pred,
            'one_class_svm': svm_pred,
            'random_forest': rf_pred
        }

        return ensemble_pred, confidence, individual_preds

    def detect_anomalies_advanced(
        self,
        X: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Detect anomalies with detailed analysis

        Returns:
            List of anomaly dictionaries with confidence and explanation
        """
        predictions, confidence, individual = self.predict_ensemble(X)

        anomalies = []
        for idx, (pred, conf) in enumerate(zip(predictions, confidence)):
            if pred == -1:
                agreement = {
                    'isolation_forest': individual['isolation_forest'][idx] == -1,
                    'one_class_svm': individual['one_class_svm'][idx] == -1,
                    'random_forest': individual['random_forest'][idx] == -1
                }

                num_agreeing = sum(agreement.values())
                severity = self._calculate_severity_advanced(conf, num_agreeing)

                anomaly = {
                    'index': idx,
                    'confidence': float(conf),
                    'severity': severity,
                    'model_agreement': agreement,
                    'num_models_agreeing': num_agreeing,
                    'features': X.iloc[idx].to_dict(),
                    'detection_method': 'ensemble_ml'
                }
                anomalies.append(anomaly)

        return anomalies

    def _calculate_severity_advanced(
        self,
        confidence: float,
        num_agreeing: int
    ) -> str:
        """
        Advanced severity calculation

        Args:
            confidence: Confidence score (0-1)
            num_agreeing: Number of models that detected anomaly

        Returns:
            Severity level
        """
        if num_agreeing == 3 and confidence > 0.8:
            return 'CRITICAL'
        elif num_agreeing >= 2 and confidence > 0.6:
            return 'HIGH'
        elif num_agreeing >= 2 or confidence > 0.5:
            return 'MEDIUM'
        else:
            return 'LOW'

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance from Random Forest

        Returns:
            Dictionary of feature names to importance scores
        """
        if not hasattr(self.random_forest, 'feature_importances_'):
            return {}

        return {
            f"feature_{i}": importance
            for i, importance in enumerate(self.random_forest.feature_importances_)
        }
