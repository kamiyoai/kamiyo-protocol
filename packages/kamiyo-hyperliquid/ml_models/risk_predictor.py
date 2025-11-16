"""
Risk Prediction using Time Series Forecasting

Uses ARIMA to forecast 24-hour ahead risk scores for proactive threat detection.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tools.sm_exceptions import ConvergenceWarning
import warnings
import joblib
from pathlib import Path

logger = logging.getLogger(__name__)

# Suppress convergence warnings for cleaner logs
warnings.simplefilter('ignore', ConvergenceWarning)


class RiskPredictor:
    """
    Time series forecasting for risk prediction

    Uses ARIMA models to predict:
    - HLP vault risk scores 24h ahead
    - Oracle deviation risk 24h ahead
    - Overall security risk trends
    """

    def __init__(self, order: Tuple[int, int, int] = (2, 1, 2)):
        """
        Initialize risk predictor

        Args:
            order: ARIMA(p,d,q) parameters
                   p = autoregressive terms
                   d = differencing order
                   q = moving average terms
        """
        self.order = order
        self.model = None
        self.is_trained = False
        self.last_training_data = None
        self.forecast_horizon = 24  # hours

        self.logger = logging.getLogger(__name__)

    def train(
        self,
        risk_scores: List[float],
        timestamps: Optional[List[datetime]] = None
    ) -> Dict[str, Any]:
        """
        Train ARIMA model on historical risk scores

        Args:
            risk_scores: Historical risk score time series
            timestamps: Optional timestamps for each score

        Returns:
            Training metrics including forecast accuracy
        """
        try:
            if len(risk_scores) < 30:
                raise ValueError(f"Need at least 30 samples for training, got {len(risk_scores)}")

            # Convert to pandas Series for easier handling
            if timestamps:
                ts_series = pd.Series(risk_scores, index=pd.DatetimeIndex(timestamps))
            else:
                ts_series = pd.Series(risk_scores)

            # Remove NaN/inf values
            ts_series = ts_series.replace([np.inf, -np.inf], np.nan).dropna()

            if len(ts_series) < 30:
                raise ValueError("Insufficient valid data after cleaning")

            self.logger.info(f"Training ARIMA{self.order} on {len(ts_series)} samples")

            # Fit ARIMA model
            self.model = ARIMA(ts_series, order=self.order)
            fitted_model = self.model.fit()

            self.is_trained = True
            self.last_training_data = ts_series

            # Calculate training metrics
            predictions = fitted_model.fittedvalues
            residuals = ts_series - predictions

            # Align series for metrics calculation
            aligned_actual = ts_series[predictions.index]
            mae = np.mean(np.abs(residuals))
            rmse = np.sqrt(np.mean(residuals ** 2))
            mape = np.mean(np.abs(residuals / (aligned_actual + 1e-10))) * 100  # Add small epsilon to avoid division by zero

            # Store fitted model
            self.model = fitted_model

            metrics = {
                'samples_trained': len(ts_series),
                'mae': float(mae),
                'rmse': float(rmse),
                'mape_pct': float(mape),
                'aic': float(fitted_model.aic),
                'bic': float(fitted_model.bic)
            }

            self.logger.info(f"Training complete: MAE={mae:.2f}, RMSE={rmse:.2f}, MAPE={mape:.2f}%")

            return metrics

        except Exception as e:
            self.logger.error(f"Error training risk predictor: {e}")
            raise

    def predict(self, steps: int = 24) -> Dict[str, Any]:
        """
        Forecast risk scores for next N hours

        Args:
            steps: Number of hours to forecast (default 24)

        Returns:
            Dictionary with forecast and confidence intervals
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        try:
            # Generate forecast
            forecast_result = self.model.forecast(steps=steps)

            # Get confidence intervals (if available)
            try:
                forecast_obj = self.model.get_forecast(steps=steps)
                conf_int = forecast_obj.conf_int()

                lower_bound = conf_int.iloc[:, 0].tolist()
                upper_bound = conf_int.iloc[:, 1].tolist()
            except:
                # Fallback if confidence intervals not available
                lower_bound = [max(0, f - 10) for f in forecast_result]
                upper_bound = [min(100, f + 10) for f in forecast_result]

            # Generate timestamps for forecast
            last_timestamp = self.last_training_data.index[-1] if hasattr(self.last_training_data, 'index') else datetime.now(timezone.utc)
            forecast_timestamps = [last_timestamp + timedelta(hours=i+1) for i in range(steps)]

            # Package results
            forecast_data = {
                'forecasted_values': [float(f) for f in forecast_result],
                'lower_bound': [float(l) for l in lower_bound],
                'upper_bound': [float(u) for u in upper_bound],
                'timestamps': [ts.isoformat() for ts in forecast_timestamps],
                'forecast_horizon_hours': steps,
                'model_order': self.order
            }

            # Calculate risk trend
            if len(forecast_result) >= 2:
                trend = 'increasing' if forecast_result[-1] > forecast_result[0] else 'decreasing'
                avg_risk = float(np.mean(forecast_result))
                max_risk = float(np.max(forecast_result))

                forecast_data['trend'] = trend
                forecast_data['avg_forecasted_risk'] = avg_risk
                forecast_data['max_forecasted_risk'] = max_risk

                # Risk assessment
                if max_risk > 80:
                    forecast_data['risk_assessment'] = 'CRITICAL'
                elif max_risk > 60:
                    forecast_data['risk_assessment'] = 'HIGH'
                elif max_risk > 40:
                    forecast_data['risk_assessment'] = 'MEDIUM'
                else:
                    forecast_data['risk_assessment'] = 'LOW'

            self.logger.info(f"Forecast generated for next {steps} hours: {forecast_data.get('risk_assessment', 'UNKNOWN')} risk")

            return forecast_data

        except Exception as e:
            self.logger.error(f"Error generating forecast: {e}")
            return {}

    def update(self, new_values: List[float]):
        """
        Update model with new observations (incremental learning)

        Args:
            new_values: New risk score observations
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        try:
            # Append new values to training data
            if self.last_training_data is not None:
                updated_series = pd.concat([self.last_training_data, pd.Series(new_values)])

                # Keep only recent data (e.g., last 1000 points)
                if len(updated_series) > 1000:
                    updated_series = updated_series.iloc[-1000:]

                self.last_training_data = updated_series

                # Retrain model
                self.model = ARIMA(updated_series, order=self.order)
                self.model = self.model.fit()

                self.logger.info(f"Model updated with {len(new_values)} new observations")

        except Exception as e:
            self.logger.error(f"Error updating model: {e}")

    def evaluate_forecast_accuracy(
        self,
        actual_values: List[float],
        predicted_values: List[float]
    ) -> Dict[str, float]:
        """
        Evaluate forecast accuracy against actual values

        Args:
            actual_values: Actual observed values
            predicted_values: Predicted values from earlier forecast

        Returns:
            Dictionary with accuracy metrics
        """
        try:
            actual = np.array(actual_values)
            predicted = np.array(predicted_values)

            # Ensure same length
            min_len = min(len(actual), len(predicted))
            actual = actual[:min_len]
            predicted = predicted[:min_len]

            # Calculate metrics
            mae = np.mean(np.abs(actual - predicted))
            rmse = np.sqrt(np.mean((actual - predicted) ** 2))
            mape = np.mean(np.abs((actual - predicted) / (actual + 1e-10))) * 100

            # Accuracy percentage (inverse of MAPE)
            accuracy = max(0, 100 - mape)

            return {
                'mae': float(mae),
                'rmse': float(rmse),
                'mape_pct': float(mape),
                'accuracy_pct': float(accuracy),
                'samples_compared': min_len
            }

        except Exception as e:
            self.logger.error(f"Error evaluating forecast: {e}")
            return {}

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

            # Save model
            joblib.dump(self.model, save_dir / 'risk_predictor_model.joblib')

            # Save metadata
            metadata = {
                'order': self.order,
                'is_trained': self.is_trained,
                'forecast_horizon': self.forecast_horizon,
                'training_samples': len(self.last_training_data) if self.last_training_data is not None else 0,
                'trained_at': datetime.now(timezone.utc).isoformat()
            }
            joblib.dump(metadata, save_dir / 'risk_predictor_metadata.joblib')

            # Save last training data for updates
            if self.last_training_data is not None:
                joblib.dump(self.last_training_data, save_dir / 'risk_predictor_training_data.joblib')

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
            self.model = joblib.load(load_dir / 'risk_predictor_model.joblib')

            # Load metadata
            metadata = joblib.load(load_dir / 'risk_predictor_metadata.joblib')
            self.order = metadata['order']
            self.forecast_horizon = metadata['forecast_horizon']
            self.is_trained = True

            # Load training data if exists
            training_data_path = load_dir / 'risk_predictor_training_data.joblib'
            if training_data_path.exists():
                self.last_training_data = joblib.load(training_data_path)

            self.logger.info(f"Model loaded from {load_dir}")
            self.logger.info(f"Model trained at: {metadata.get('trained_at', 'unknown')}")

        except Exception as e:
            self.logger.error(f"Error loading model: {e}")
            raise
