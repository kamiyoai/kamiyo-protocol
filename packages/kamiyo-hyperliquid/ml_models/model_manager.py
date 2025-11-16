"""
ML Model Management

Handles model persistence, versioning, and lifecycle management.
"""

import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import json

from ml_models.anomaly_detector import AnomalyDetector
from ml_models.risk_predictor import RiskPredictor

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Central manager for ML models

    Features:
    - Model loading/saving
    - Version management
    - Model metadata tracking
    - Automatic model selection
    """

    DEFAULT_MODEL_DIR = Path(__file__).parent.parent / "trained_models"

    def __init__(self, model_dir: Optional[str] = None):
        """
        Initialize model manager

        Args:
            model_dir: Directory to store trained models (default: ./trained_models)
        """
        self.model_dir = Path(model_dir) if model_dir else self.DEFAULT_MODEL_DIR
        self.model_dir.mkdir(parents=True, exist_ok=True)

        self.anomaly_detector: Optional[AnomalyDetector] = None
        self.risk_predictor: Optional[RiskPredictor] = None

        self.logger = logging.getLogger(__name__)
        self.logger.info(f"Model manager initialized. Model directory: {self.model_dir}")

    def save_anomaly_detector(
        self,
        detector: AnomalyDetector,
        version: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Save anomaly detector model

        Args:
            detector: Trained anomaly detector
            version: Optional version string (default: timestamp)
            metadata: Additional metadata to store
        """
        try:
            # Generate version if not provided
            if version is None:
                version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

            # Create version directory
            version_dir = self.model_dir / "anomaly_detector" / version
            version_dir.mkdir(parents=True, exist_ok=True)

            # Save model
            detector.save(str(version_dir))

            # Save metadata
            meta = {
                "model_type": "anomaly_detector",
                "version": version,
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "contamination": detector.contamination,
                "n_estimators": detector.n_estimators,
            }

            if metadata:
                meta.update(metadata)

            with open(version_dir / "metadata.json", "w") as f:
                json.dump(meta, f, indent=2)

            # Create/update latest symlink
            latest_link = self.model_dir / "anomaly_detector" / "latest"
            if latest_link.exists() or latest_link.is_symlink():
                latest_link.unlink()

            # Use relative path for symlink
            latest_link.symlink_to(Path(version), target_is_directory=True)

            self.logger.info(f"Anomaly detector saved: version {version}")

        except Exception as e:
            self.logger.error(f"Error saving anomaly detector: {e}")
            raise

    def load_anomaly_detector(
        self,
        version: str = "latest"
    ) -> AnomalyDetector:
        """
        Load anomaly detector model

        Args:
            version: Version to load (default: "latest")

        Returns:
            Loaded anomaly detector
        """
        try:
            version_dir = self.model_dir / "anomaly_detector" / version

            if not version_dir.exists():
                raise FileNotFoundError(f"Anomaly detector version not found: {version}")

            # Load model
            detector = AnomalyDetector()
            detector.load(str(version_dir))

            # Load metadata
            metadata_path = version_dir / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)
                    self.logger.info(f"Loaded anomaly detector: {metadata}")

            self.anomaly_detector = detector
            return detector

        except Exception as e:
            self.logger.error(f"Error loading anomaly detector: {e}")
            raise

    def save_risk_predictor(
        self,
        predictor: RiskPredictor,
        version: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Save risk predictor model

        Args:
            predictor: Trained risk predictor
            version: Optional version string (default: timestamp)
            metadata: Additional metadata to store
        """
        try:
            # Generate version if not provided
            if version is None:
                version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

            # Create version directory
            version_dir = self.model_dir / "risk_predictor" / version
            version_dir.mkdir(parents=True, exist_ok=True)

            # Save model
            predictor.save(str(version_dir))

            # Save metadata
            meta = {
                "model_type": "risk_predictor",
                "version": version,
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "order": predictor.order,
                "forecast_horizon": predictor.forecast_horizon,
            }

            if metadata:
                meta.update(metadata)

            with open(version_dir / "metadata.json", "w") as f:
                json.dump(meta, f, indent=2)

            # Create/update latest symlink
            latest_link = self.model_dir / "risk_predictor" / "latest"
            if latest_link.exists() or latest_link.is_symlink():
                latest_link.unlink()

            # Use relative path for symlink
            latest_link.symlink_to(Path(version), target_is_directory=True)

            self.logger.info(f"Risk predictor saved: version {version}")

        except Exception as e:
            self.logger.error(f"Error saving risk predictor: {e}")
            raise

    def load_risk_predictor(
        self,
        version: str = "latest"
    ) -> RiskPredictor:
        """
        Load risk predictor model

        Args:
            version: Version to load (default: "latest")

        Returns:
            Loaded risk predictor
        """
        try:
            version_dir = self.model_dir / "risk_predictor" / version

            if not version_dir.exists():
                raise FileNotFoundError(f"Risk predictor version not found: {version}")

            # Load model
            predictor = RiskPredictor()
            predictor.load(str(version_dir))

            # Load metadata
            metadata_path = version_dir / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)
                    self.logger.info(f"Loaded risk predictor: {metadata}")

            self.risk_predictor = predictor
            return predictor

        except Exception as e:
            self.logger.error(f"Error loading risk predictor: {e}")
            raise

    def list_versions(self, model_type: str) -> list:
        """
        List available model versions

        Args:
            model_type: "anomaly_detector" or "risk_predictor"

        Returns:
            List of version strings
        """
        model_path = self.model_dir / model_type

        if not model_path.exists():
            return []

        versions = []
        for item in model_path.iterdir():
            if item.is_dir() and item.name != "latest":
                metadata_path = item / "metadata.json"
                if metadata_path.exists():
                    with open(metadata_path, "r") as f:
                        metadata = json.load(f)
                        versions.append({
                            "version": item.name,
                            "saved_at": metadata.get("saved_at"),
                            "metadata": metadata
                        })

        # Sort by saved_at timestamp (newest first)
        versions.sort(key=lambda x: x.get("saved_at", ""), reverse=True)

        return versions

    def get_active_models(self) -> Dict[str, Any]:
        """
        Get information about currently loaded models

        Returns:
            Dictionary with model status
        """
        return {
            "anomaly_detector": {
                "loaded": self.anomaly_detector is not None,
                "trained": self.anomaly_detector.is_trained if self.anomaly_detector else False,
            },
            "risk_predictor": {
                "loaded": self.risk_predictor is not None,
                "trained": self.risk_predictor.is_trained if self.risk_predictor else False,
            },
            "model_directory": str(self.model_dir)
        }

    def load_all_models(self):
        """
        Load all available models (latest versions)
        """
        try:
            # Try to load anomaly detector
            try:
                self.load_anomaly_detector("latest")
                self.logger.info("Anomaly detector loaded successfully")
            except FileNotFoundError:
                self.logger.warning("No trained anomaly detector found")
            except Exception as e:
                self.logger.error(f"Error loading anomaly detector: {e}")

            # Try to load risk predictor
            try:
                self.load_risk_predictor("latest")
                self.logger.info("Risk predictor loaded successfully")
            except FileNotFoundError:
                self.logger.warning("No trained risk predictor found")
            except Exception as e:
                self.logger.error(f"Error loading risk predictor: {e}")

        except Exception as e:
            self.logger.error(f"Error loading models: {e}")


# Global model manager instance
_model_manager = None


def get_model_manager() -> ModelManager:
    """
    Get global model manager instance (singleton)

    Returns:
        ModelManager instance
    """
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager
