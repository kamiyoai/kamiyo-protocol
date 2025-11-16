"""
ML Model Training Script

Trains anomaly detection and risk prediction models for Hyperliquid security monitoring.

Usage:
    python scripts/train_ml_models.py
    python scripts/train_ml_models.py --days 30 --save-version v1.0
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import argparse
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from ml_models.anomaly_detector import AnomalyDetector
from ml_models.risk_predictor import RiskPredictor
from ml_models.feature_engineering import FeatureEngineer
from ml_models.model_manager import ModelManager, get_model_manager

from monitors.hlp_vault_monitor import HLPVaultMonitor
from monitors.oracle_monitor import OracleMonitor
from monitors.liquidation_analyzer import LiquidationAnalyzer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def fetch_training_data(days: int = 30) -> Dict[str, Any]:
    """
    Fetch historical monitoring data for training

    Args:
        days: Number of days of historical data to fetch

    Returns:
        Dictionary with training data from all monitors
    """
    logger.info(f"Fetching {days} days of training data...")

    training_data = {
        'hlp_snapshots': [],
        'oracle_deviations': {},
        'liquidations': [],
        'risk_scores': []
    }

    try:
        # Initialize monitors
        hlp_monitor = HLPVaultMonitor()
        oracle_monitor = OracleMonitor()
        liquidation_analyzer = LiquidationAnalyzer()

        # Fetch HLP vault historical data
        logger.info("Fetching HLP vault snapshots...")
        hlp_snapshots = hlp_monitor.get_historical_snapshots(limit=days * 24)  # Hourly snapshots

        if hlp_snapshots:
            # Convert snapshots to dict format
            training_data['hlp_snapshots'] = [
                {
                    'timestamp': snapshot.timestamp,
                    'account_value': snapshot.account_value,
                    'pnl_24h': snapshot.pnl_24h,
                    'all_time_pnl': snapshot.all_time_pnl,
                    'sharpe_ratio': snapshot.sharpe_ratio,
                    'max_drawdown': snapshot.max_drawdown,
                    'anomaly_score': snapshot.anomaly_score,
                    'is_healthy': snapshot.is_healthy
                }
                for snapshot in hlp_snapshots
            ]

            # Extract risk scores for time series forecasting
            training_data['risk_scores'] = [
                float(snapshot.anomaly_score) if snapshot.anomaly_score else 0
                for snapshot in hlp_snapshots
            ]

            logger.info(f"Fetched {len(training_data['hlp_snapshots'])} HLP snapshots")
        else:
            logger.warning("No HLP snapshots available")

        # Fetch oracle deviation history
        logger.info("Fetching oracle deviations...")
        assets = ['BTC', 'ETH', 'SOL']

        for asset in assets:
            deviations = oracle_monitor.get_deviation_history(asset, limit=days * 24)

            if deviations:
                training_data['oracle_deviations'][asset] = [
                    {
                        'timestamp': dev.timestamp,
                        'asset': dev.asset,
                        'hyperliquid_price': dev.hyperliquid_price,
                        'binance_price': dev.binance_price,
                        'coinbase_price': dev.coinbase_price,
                        'max_deviation_pct': dev.max_deviation_pct,
                        'risk_score': dev.risk_score,
                        'severity': dev.severity.value
                    }
                    for dev in deviations
                ]

                logger.info(f"Fetched {len(deviations)} deviations for {asset}")

        # Note: Liquidations require specific addresses to monitor
        # For initial training, we'll use HLP and oracle data
        logger.info("Liquidation data requires specific addresses (not fetched for initial training)")

    except Exception as e:
        logger.error(f"Error fetching training data: {e}")

    return training_data


def train_anomaly_detector(training_data: Dict[str, Any]) -> AnomalyDetector:
    """
    Train anomaly detector model

    Args:
        training_data: Historical monitoring data

    Returns:
        Trained anomaly detector
    """
    logger.info("=" * 70)
    logger.info("TRAINING ANOMALY DETECTOR")
    logger.info("=" * 70)

    # Initialize feature engineer
    feature_engineer = FeatureEngineer()

    # Extract features
    features = feature_engineer.create_training_features(
        hlp_data=training_data.get('hlp_snapshots'),
        oracle_data=training_data.get('oracle_deviations'),
        liquidation_data=training_data.get('liquidations')
    )

    if features.empty:
        raise ValueError("No features extracted for training")

    logger.info(f"Extracted {len(features)} samples with {len(features.columns)} features")

    # Initialize and train detector
    detector = AnomalyDetector(
        contamination=0.05,  # Expect 5% anomalies
        n_estimators=100,
        random_state=42
    )

    metrics = detector.train(features)

    logger.info("Anomaly detector training complete!")
    logger.info(f"Samples trained: {metrics['samples_trained']}")
    logger.info(f"Features used: {metrics['features_used']}")
    logger.info(f"Anomalies detected: {metrics['anomalies_detected']} ({metrics['anomaly_rate_pct']:.2f}%)")

    return detector


def train_risk_predictor(training_data: Dict[str, Any]) -> RiskPredictor:
    """
    Train risk predictor model

    Args:
        training_data: Historical monitoring data

    Returns:
        Trained risk predictor
    """
    logger.info("=" * 70)
    logger.info("TRAINING RISK PREDICTOR")
    logger.info("=" * 70)

    risk_scores = training_data.get('risk_scores', [])

    if not risk_scores or len(risk_scores) < 30:
        raise ValueError(f"Need at least 30 risk scores for training, got {len(risk_scores)}")

    # Extract timestamps if available
    timestamps = None
    if training_data.get('hlp_snapshots'):
        timestamps = [s['timestamp'] for s in training_data['hlp_snapshots']]

    # Initialize and train predictor
    predictor = RiskPredictor(order=(2, 1, 2))  # ARIMA(2,1,2)

    metrics = predictor.train(risk_scores, timestamps=timestamps)

    logger.info("Risk predictor training complete!")
    logger.info(f"Samples trained: {metrics['samples_trained']}")
    logger.info(f"MAE: {metrics['mae']:.2f}")
    logger.info(f"RMSE: {metrics['rmse']:.2f}")
    logger.info(f"MAPE: {metrics['mape_pct']:.2f}%")

    # Generate sample forecast
    forecast = predictor.predict(steps=24)
    if forecast:
        logger.info(f"24-hour forecast: {forecast.get('risk_assessment', 'UNKNOWN')} risk")
        logger.info(f"Average forecasted risk: {forecast.get('avg_forecasted_risk', 0):.2f}")

    return predictor


def main():
    """Main training script"""
    parser = argparse.ArgumentParser(description="Train ML models for Hyperliquid security monitoring")
    parser.add_argument('--days', type=int, default=30, help='Days of historical data to use for training')
    parser.add_argument('--save-version', type=str, default=None, help='Version string for saved models')
    parser.add_argument('--model-dir', type=str, default=None, help='Directory to save trained models')

    args = parser.parse_args()

    logger.info("=" * 70)
    logger.info("KAMIYO HYPERLIQUID ML MODEL TRAINING")
    logger.info("=" * 70)
    logger.info(f"Training with {args.days} days of historical data")

    try:
        # Step 1: Fetch training data
        training_data = fetch_training_data(days=args.days)

        if not training_data['hlp_snapshots']:
            logger.error("No training data available. Cannot proceed.")
            logger.error("Please ensure monitors have collected sufficient historical data.")
            sys.exit(1)

        # Step 2: Train anomaly detector
        try:
            detector = train_anomaly_detector(training_data)
        except Exception as e:
            logger.error(f"Failed to train anomaly detector: {e}")
            detector = None

        # Step 3: Train risk predictor
        try:
            predictor = train_risk_predictor(training_data)
        except Exception as e:
            logger.error(f"Failed to train risk predictor: {e}")
            predictor = None

        # Step 4: Save models
        if detector or predictor:
            model_manager = get_model_manager() if args.model_dir is None else ModelManager(args.model_dir)

            if detector:
                logger.info("Saving anomaly detector...")
                model_manager.save_anomaly_detector(
                    detector,
                    version=args.save_version,
                    metadata={
                        'training_days': args.days,
                        'trained_by': 'train_ml_models.py'
                    }
                )

            if predictor:
                logger.info("Saving risk predictor...")
                model_manager.save_risk_predictor(
                    predictor,
                    version=args.save_version,
                    metadata={
                        'training_days': args.days,
                        'trained_by': 'train_ml_models.py'
                    }
                )

            logger.info("=" * 70)
            logger.info("TRAINING COMPLETE!")
            logger.info("=" * 70)
            logger.info(f"Models saved to: {model_manager.model_dir}")
            logger.info("Models can now be loaded and used for predictions.")

        else:
            logger.error("No models were successfully trained")
            sys.exit(1)

    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
