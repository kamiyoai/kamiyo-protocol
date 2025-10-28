#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pytest configuration and fixtures for x402 tests
"""

import pytest
import os
import sys
from fastapi.testclient import TestClient

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture(scope="function")
def test_client():
    """
    Create a test client for the FastAPI app

    This fixture creates a fresh test client for each test function,
    ensuring test isolation.
    """
    # Import here to avoid circular imports
    from api.main import app

    # Create test client
    client = TestClient(app)

    yield client

    # Cleanup after test
    client.close()


@pytest.fixture(scope="function")
def mock_db():
    """
    Mock database for testing

    Returns an in-memory mock database that can be used for tests
    that don't require a real database connection.
    """
    from unittest.mock import Mock

    db = Mock()
    db.execute_with_retry = Mock(return_value=[])
    db.get_connection = Mock()

    return db


@pytest.fixture(scope="function")
def test_payment_tracker():
    """
    Create a test payment tracker with in-memory storage

    This fixture provides an isolated payment tracker for each test.
    """
    from api.x402.payment_tracker import PaymentTracker

    # Create payment tracker with no database (in-memory mode)
    tracker = PaymentTracker(db=None)

    yield tracker

    # Clear data after test
    tracker.payments.clear()
    tracker.tokens.clear()
    tracker.next_payment_id = 1


@pytest.fixture(scope="function")
def test_x402_config():
    """
    Create test x402 configuration

    Returns a test configuration for x402 payment system.
    """
    from api.x402.config import X402Config

    # Set test environment variables
    os.environ['X402_ADMIN_KEY'] = 'test-admin-key'
    os.environ['X402_PRICE_PER_CALL'] = '0.10'
    os.environ['X402_MIN_PAYMENT_USD'] = '1.00'

    # Get config
    from api.x402.config import get_x402_config
    config = get_x402_config()

    return config


@pytest.fixture(autouse=True)
def setup_test_env():
    """
    Set up test environment variables

    This fixture runs automatically before each test to ensure
    proper test environment configuration.
    """
    # Set test environment
    os.environ['ENVIRONMENT'] = 'test'
    os.environ['X402_ADMIN_KEY'] = 'test-admin-key'

    # Ensure we're not using production services
    os.environ['REDIS_URL'] = 'redis://localhost:6379/15'  # Use test DB

    yield

    # Cleanup is handled by pytest automatically
