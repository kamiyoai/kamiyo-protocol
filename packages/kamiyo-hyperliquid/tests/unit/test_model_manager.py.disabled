# -*- coding: utf-8 -*-
"""
Unit tests for Model Manager
"""

import pytest
import json
from pathlib import Path
import sys
import tempfile
import shutil
from datetime import datetime, timezone

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml_models.model_manager import ModelManager


class TestModelManager:
    """Test suite for ModelManager class"""

    @pytest.fixture
    def temp_models_dir(self):
        """Create a temporary models directory"""
        tmpdir = tempfile.mkdtemp()
        yield Path(tmpdir)
        shutil.rmtree(tmpdir)

    @pytest.fixture
    def manager(self, temp_models_dir):
        """Create a ModelManager instance with temporary directory"""
        return ModelManager(model_dir=str(temp_models_dir))

    @pytest.fixture
    def sample_model_metadata(self):
        """Create sample model metadata"""
        return {
            'model_type': 'anomaly_detector',
            'version': '1.0.0',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'training_samples': 1000,
            'accuracy': 0.85,
            'parameters': {
                'contamination': 0.05,
                'n_estimators': 100
            }
        }

    def test_init(self, manager, temp_models_dir):
        """Test ModelManager initialization"""
        assert manager is not None
        assert manager.models_dir == temp_models_dir
        assert temp_models_dir.exists()

    def test_init_creates_directory(self):
        """Test that init creates models directory if it doesn't exist"""
        with tempfile.TemporaryDirectory() as tmpdir:
            models_path = Path(tmpdir) / 'new_models'
            assert not models_path.exists()

            manager = ModelManager(models_dir=str(models_path))
            assert models_path.exists()

    def test_save_model_version(self, manager, sample_model_metadata):
        """Test saving a model version"""
        model_name = 'test_detector'
        version = '1.0.0'

        # Create dummy model files
        model_data = {'dummy': 'data'}

        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data=model_data,
            metadata=sample_model_metadata
        )

        # Verify version directory was created
        version_dir = manager.models_dir / model_name / version
        assert version_dir.exists()

        # Verify metadata file exists
        metadata_file = version_dir / 'metadata.json'
        assert metadata_file.exists()

        # Verify metadata content
        with open(metadata_file, 'r') as f:
            saved_metadata = json.load(f)
            assert saved_metadata['model_type'] == sample_model_metadata['model_type']
            assert saved_metadata['version'] == version

    def test_save_model_overwrites_existing(self, manager, sample_model_metadata):
        """Test that saving overwrites existing version"""
        model_name = 'test_model'
        version = '1.0.0'

        # Save first time
        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data={'data': 'v1'},
            metadata=sample_model_metadata
        )

        # Save again with different metadata
        updated_metadata = sample_model_metadata.copy()
        updated_metadata['accuracy'] = 0.90

        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data={'data': 'v2'},
            metadata=updated_metadata
        )

        # Verify updated metadata
        version_dir = manager.models_dir / model_name / version
        metadata_file = version_dir / 'metadata.json'

        with open(metadata_file, 'r') as f:
            saved_metadata = json.load(f)
            assert saved_metadata['accuracy'] == 0.90

    def test_get_latest_version(self, manager, sample_model_metadata):
        """Test getting the latest model version"""
        model_name = 'versioned_model'

        # Save multiple versions
        versions = ['1.0.0', '1.0.1', '1.1.0', '2.0.0']
        for version in versions:
            metadata = sample_model_metadata.copy()
            metadata['version'] = version
            manager.save_model_version(
                model_name=model_name,
                version=version,
                model_data={},
                metadata=metadata
            )

        # Get latest version
        latest = manager.get_latest_version(model_name)
        assert latest == '2.0.0'

    def test_get_latest_version_nonexistent_model(self, manager):
        """Test getting latest version for nonexistent model"""
        result = manager.get_latest_version('nonexistent_model')
        assert result is None

    def test_list_versions(self, manager, sample_model_metadata):
        """Test listing all versions of a model"""
        model_name = 'multi_version_model'

        # Save multiple versions
        versions = ['1.0.0', '1.0.1', '1.1.0']
        for version in versions:
            metadata = sample_model_metadata.copy()
            metadata['version'] = version
            manager.save_model_version(
                model_name=model_name,
                version=version,
                model_data={},
                metadata=metadata
            )

        # List versions
        version_list = manager.list_versions(model_name)
        assert set(version_list) == set(versions)
        assert len(version_list) == 3

    def test_list_versions_nonexistent_model(self, manager):
        """Test listing versions for nonexistent model"""
        versions = manager.list_versions('nonexistent_model')
        assert versions == []

    def test_get_model_metadata(self, manager, sample_model_metadata):
        """Test retrieving model metadata"""
        model_name = 'metadata_test'
        version = '1.0.0'

        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data={},
            metadata=sample_model_metadata
        )

        # Retrieve metadata
        metadata = manager.get_model_metadata(model_name, version)

        assert metadata is not None
        assert metadata['model_type'] == sample_model_metadata['model_type']
        assert metadata['version'] == version
        assert metadata['accuracy'] == sample_model_metadata['accuracy']

    def test_get_model_metadata_nonexistent(self, manager):
        """Test getting metadata for nonexistent model"""
        metadata = manager.get_model_metadata('nonexistent', '1.0.0')
        assert metadata is None

    def test_delete_model_version(self, manager, sample_model_metadata):
        """Test deleting a specific model version"""
        model_name = 'delete_test'
        version = '1.0.0'

        # Save model
        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data={},
            metadata=sample_model_metadata
        )

        # Verify it exists
        assert manager.get_model_metadata(model_name, version) is not None

        # Delete it
        manager.delete_model_version(model_name, version)

        # Verify it's gone
        assert manager.get_model_metadata(model_name, version) is None

    def test_delete_all_model_versions(self, manager, sample_model_metadata):
        """Test deleting all versions of a model"""
        model_name = 'delete_all_test'

        # Save multiple versions
        for version in ['1.0.0', '1.1.0', '2.0.0']:
            metadata = sample_model_metadata.copy()
            metadata['version'] = version
            manager.save_model_version(
                model_name=model_name,
                version=version,
                model_data={},
                metadata=metadata
            )

        # Verify versions exist
        assert len(manager.list_versions(model_name)) == 3

        # Delete all versions
        manager.delete_all_model_versions(model_name)

        # Verify all gone
        assert len(manager.list_versions(model_name)) == 0

    def test_get_model_path(self, manager, sample_model_metadata):
        """Test getting model path"""
        model_name = 'path_test'
        version = '1.0.0'

        manager.save_model_version(
            model_name=model_name,
            version=version,
            model_data={},
            metadata=sample_model_metadata
        )

        # Get model path
        path = manager.get_model_path(model_name, version)

        assert path is not None
        assert path.exists()
        assert path.name == version
        assert path.parent.name == model_name

    def test_get_model_path_nonexistent(self, manager):
        """Test getting path for nonexistent model"""
        path = manager.get_model_path('nonexistent', '1.0.0')
        assert path is None

    def test_create_latest_symlink(self, manager, sample_model_metadata):
        """Test creating 'latest' symlink"""
        model_name = 'symlink_test'

        # Save multiple versions
        for version in ['1.0.0', '2.0.0']:
            metadata = sample_model_metadata.copy()
            metadata['version'] = version
            manager.save_model_version(
                model_name=model_name,
                version=version,
                model_data={},
                metadata=metadata
            )

        # Create symlink
        manager.create_latest_symlink(model_name)

        # Verify symlink exists and points to latest
        symlink = manager.models_dir / model_name / 'latest'
        assert symlink.exists()

        # Verify it points to the latest version (2.0.0)
        target = symlink.resolve()
        assert target.name == '2.0.0'

    def test_list_all_models(self, manager, sample_model_metadata):
        """Test listing all models"""
        # Save multiple models
        models = ['model_a', 'model_b', 'model_c']
        for model_name in models:
            manager.save_model_version(
                model_name=model_name,
                version='1.0.0',
                model_data={},
                metadata=sample_model_metadata
            )

        # List all models
        all_models = manager.list_all_models()

        assert set(all_models) == set(models)

    def test_list_all_models_empty(self, manager):
        """Test listing models when directory is empty"""
        all_models = manager.list_all_models()
        assert all_models == []

    def test_version_comparison(self, manager, sample_model_metadata):
        """Test that versions are properly compared"""
        model_name = 'version_compare'

        # Save versions in non-chronological order
        versions = ['2.0.0', '1.0.0', '1.5.0', '1.10.0']
        for version in versions:
            metadata = sample_model_metadata.copy()
            metadata['version'] = version
            manager.save_model_version(
                model_name=model_name,
                version=version,
                model_data={},
                metadata=metadata
            )

        # Latest should be 2.0.0
        latest = manager.get_latest_version(model_name)
        assert latest == '2.0.0'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
