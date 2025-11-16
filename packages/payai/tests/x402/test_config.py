"""
Test configuration for x402 payment system tests
"""

import os
import sys

# Set test environment variables before any imports
os.environ['DATABASE_URL'] = 'postgresql://test:test@localhost/kamiyo_test'
os.environ['READ_REPLICA_URL'] = 'postgresql://test:test@localhost/kamiyo_test_read'
os.environ['DB_QUERY_TIMEOUT'] = '10'

# Add project root to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Mock database dependencies
import unittest.mock as mock

# Mock the database manager to avoid connection issues
with mock.patch('database.postgres_manager.PostgresManager.__init__', return_value=None):
    with mock.patch('database.postgres_manager.PostgresManager.health_check', return_value=True):
        with mock.patch('database.postgres_manager.PostgresManager.get_recent_exploits', return_value=[]):
            with mock.patch('database.postgres_manager.PostgresManager.get_total_exploits', return_value=0):
                with mock.patch('database.postgres_manager.PostgresManager.get_chains', return_value=[]):
                    with mock.patch('database.postgres_manager.PostgresManager.get_stats_24h', return_value={}):
                        with mock.patch('database.postgres_manager.PostgresManager.get_stats_custom', return_value={}):
                            with mock.patch('database.postgres_manager.PostgresManager.get_source_health', return_value=[]):
                                # Now import the modules that need database
                                from api.x402.payment_tracker import payment_tracker
                                from api.x402.payment_verifier import payment_verifier
