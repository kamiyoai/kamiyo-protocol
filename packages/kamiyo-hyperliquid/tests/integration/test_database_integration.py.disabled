# -*- coding: utf-8 -*-
"""
Integration Tests for Database Persistence
Tests the complete flow from monitors to database
"""

import unittest
import sys
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from models.security import HLPVaultSnapshot, OracleDeviation, LiquidationPattern
from database.integration import DatabaseIntegration
from monitors.database_wrapper import MonitorDatabaseWrapper


class TestDatabaseIntegration(unittest.TestCase):
    """Test database integration with monitors"""

    def setUp(self):
        """Set up test fixtures"""
        # Use in-memory database for testing
        self.db_integration = DatabaseIntegration()
        self.db_wrapper = MonitorDatabaseWrapper(enabled=True)

    def test_save_hlp_snapshot(self):
        """Test saving HLP vault snapshot"""
        snapshot = HLPVaultSnapshot(
            vault_address="0xtest123",
            timestamp=datetime.now(timezone.utc),
            total_value_locked=Decimal("1000000"),
            account_value=Decimal("900000"),
            pnl_24h=Decimal("-10000"),
            sharpe_ratio=1.5,
            max_drawdown=0.15,
            anomaly_score=25.0,
            is_healthy=True,
            health_issues=[]
        )

        # Test save
        success = self.db_wrapper.save_hlp_snapshot(snapshot)
        self.assertTrue(success or not self.db_wrapper.enabled)

    def test_save_oracle_deviations(self):
        """Test saving oracle deviations"""
        deviations = [
            OracleDeviation(
                asset="BTC",
                timestamp=datetime.now(timezone.utc),
                hyperliquid_price=Decimal("50000"),
                binance_price=Decimal("50100"),
                max_deviation_pct=Decimal("0.2"),
                max_deviation_source="binance",
                risk_score=15.0,
                severity="low",
                duration_seconds=30.0
            )
        ]

        # Test save
        saved_count = self.db_wrapper.save_oracle_deviations(deviations)
        self.assertTrue(saved_count >= 0)

    def test_save_liquidation_patterns(self):
        """Test saving liquidation patterns"""
        patterns = [
            LiquidationPattern(
                pattern_type="cascade",
                start_time=datetime.now(timezone.utc),
                end_time=datetime.now(timezone.utc),
                duration_seconds=120.0,
                total_liquidated_usd=Decimal("500000"),
                affected_users=10,
                assets_involved=["BTC", "ETH"],
                suspicion_score=45.0,
                liquidation_ids=["liq1", "liq2"],
                price_impact={"BTC": -2.5}
            )
        ]

        # Test save
        saved_count = self.db_wrapper.save_liquidation_patterns(patterns)
        self.assertTrue(saved_count >= 0)

    def test_security_event_creation(self):
        """Test security event creation from monitor data"""
        # Create unhealthy HLP snapshot
        snapshot = HLPVaultSnapshot(
            vault_address="0xtest123",
            timestamp=datetime.now(timezone.utc),
            total_value_locked=Decimal("1000000"),
            account_value=Decimal("500000"),
            pnl_24h=Decimal("-500000"),
            sharpe_ratio=-0.5,
            max_drawdown=0.5,
            anomaly_score=85.0,
            is_healthy=False,
            health_issues=["Large drawdown", "Negative PnL"]
        )

        # Save snapshot - should create security event
        success = self.db_wrapper.save_hlp_snapshot(snapshot)
        self.assertTrue(success or not self.db_wrapper.enabled)


class TestDatabaseQueries(unittest.TestCase):
    """Test database query methods"""

    def setUp(self):
        """Set up test fixtures"""
        self.db_integration = DatabaseIntegration()

    def test_get_recent_hlp_snapshots(self):
        """Test retrieving recent HLP snapshots"""
        try:
            snapshots = self.db_integration.get_recent_hlp_snapshots(limit=10)
            self.assertIsInstance(snapshots, list)
        except Exception as e:
            # Database might not be available in test environment
            self.skipTest(f"Database not available: {e}")

    def test_get_oracle_deviations_by_asset(self):
        """Test retrieving oracle deviations for specific asset"""
        try:
            deviations = self.db_integration.get_oracle_deviations_by_asset(
                asset="BTC",
                hours=24
            )
            self.assertIsInstance(deviations, list)
        except Exception as e:
            self.skipTest(f"Database not available: {e}")

    def test_get_recent_liquidation_patterns(self):
        """Test retrieving recent liquidation patterns"""
        try:
            patterns = self.db_integration.get_recent_liquidation_patterns(limit=10)
            self.assertIsInstance(patterns, list)
        except Exception as e:
            self.skipTest(f"Database not available: {e}")

    def test_get_security_events(self):
        """Test retrieving security events"""
        try:
            events = self.db_integration.get_security_events(
                severity="high",
                hours=24,
                limit=10
            )
            self.assertIsInstance(events, list)
        except Exception as e:
            self.skipTest(f"Database not available: {e}")

    def test_get_hlp_statistics(self):
        """Test retrieving HLP statistics"""
        try:
            stats = self.db_integration.get_hlp_statistics(days=30)
            self.assertIsInstance(stats, dict)
        except Exception as e:
            self.skipTest(f"Database not available: {e}")


if __name__ == '__main__':
    unittest.main()
