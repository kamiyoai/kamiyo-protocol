# -*- coding: utf-8 -*-
"""
Unit Tests for HLP Vault Monitor
Tests anomaly detection, risk scoring, and health checks
"""

import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from monitors.hlp_vault_monitor import HLPVaultMonitor
from models.security import HLPVaultSnapshot


class TestHLPVaultMonitor(unittest.TestCase):
    """Test suite for HLP Vault Monitor"""

    def setUp(self):
        """Set up test fixtures"""
        self.monitor = HLPVaultMonitor()
        self.vault_address = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303"

    def test_initialization(self):
        """Test monitor initialization"""
        self.assertEqual(self.monitor.name, "hlp_vault_monitor")
        self.assertIsInstance(self.monitor.historical_snapshots, list)
        self.assertEqual(len(self.monitor.historical_snapshots), 0)

    def test_sharpe_ratio_calculation(self):
        """Test Sharpe ratio calculation"""
        # Create mock portfolio with returns (need at least 30 data points)
        base_value = 100000000
        portfolio = []
        for i in range(35):
            # Simulate gradual growth with some volatility
            value = base_value * (1 + (i * 0.001) + ((-1) ** i * 0.0002))
            portfolio.append({
                'accountValue': value,
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=i)
            })

        sharpe = self.monitor._calculate_sharpe_ratio(portfolio)

        # Sharpe should be calculated for sufficient data
        self.assertIsNotNone(sharpe)

    def test_sharpe_ratio_zero_std(self):
        """Test Sharpe ratio with zero standard deviation"""
        # Same value for all snapshots
        portfolio = [
            {'account_value': Decimal('100000000'), 'timestamp': datetime.now(timezone.utc)},
            {'account_value': Decimal('100000000'), 'timestamp': datetime.now(timezone.utc) + timedelta(hours=1)},
        ]

        sharpe = self.monitor._calculate_sharpe_ratio(portfolio)

        # Should return None for zero standard deviation
        self.assertIsNone(sharpe)

    def test_max_drawdown_calculation(self):
        """Test maximum drawdown calculation"""
        portfolio = [
            {'accountValue': Decimal('100000000')},
            {'accountValue': Decimal('120000000')},  # Peak
            {'accountValue': Decimal('90000000')},   # Drawdown
            {'accountValue': Decimal('110000000')},
        ]

        drawdown = self.monitor._calculate_max_drawdown(portfolio)

        # Drawdown should be (120M - 90M) / 120M = 25%
        self.assertAlmostEqual(drawdown, 25.0, places=1)

    def test_max_drawdown_empty(self):
        """Test max drawdown with empty portfolio"""
        drawdown = self.monitor._calculate_max_drawdown([])
        # Implementation returns None for empty/insufficient data
        self.assertIsNone(drawdown)

    def test_anomaly_score_large_loss(self):
        """Test anomaly score for large loss"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('-3000000'),  # -$3M loss
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=1.5,
            max_drawdown=5.0,
            timestamp=datetime.now(timezone.utc)
        )

        score = self.monitor._calculate_anomaly_score(snapshot)

        # Should have high score due to large loss
        self.assertGreater(score, 30)

    def test_anomaly_score_high_drawdown(self):
        """Test anomaly score for high drawdown"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('0'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=1.5,
            max_drawdown=15.0,  # 15% drawdown
            timestamp=datetime.now(timezone.utc)
        )

        score = self.monitor._calculate_anomaly_score(snapshot)

        # Should have high score due to large drawdown
        self.assertGreater(score, 20)

    def test_anomaly_score_normal_operations(self):
        """Test anomaly score for normal operations"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),  # Small profit
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=2.0,  # Small drawdown
            timestamp=datetime.now(timezone.utc)
        )

        score = self.monitor._calculate_anomaly_score(snapshot)

        # Should have low score for normal operations
        self.assertLess(score, 30)

    def test_health_check_critical_loss(self):
        """Test health check with critical loss"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('-2500000'),  # >$2M loss
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=1.5,
            max_drawdown=5.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=75.0
        )

        is_healthy, issues = self.monitor._check_vault_health(snapshot)

        self.assertFalse(is_healthy)
        self.assertTrue(any('Large loss' in issue for issue in issues))

    def test_health_check_critical_drawdown(self):
        """Test health check with critical drawdown"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('0'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=1.5,
            max_drawdown=12.0,  # >10% drawdown
            timestamp=datetime.now(timezone.utc),
            anomaly_score=60.0
        )

        is_healthy, issues = self.monitor._check_vault_health(snapshot)

        self.assertFalse(is_healthy)
        self.assertTrue(any('drawdown' in issue for issue in issues))

    def test_health_check_healthy_vault(self):
        """Test health check with healthy vault"""
        snapshot = HLPVaultSnapshot(
            vault_address=self.vault_address,
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=2.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0
        )

        is_healthy, issues = self.monitor._check_vault_health(snapshot)

        self.assertTrue(is_healthy)
        self.assertEqual(len(issues), 0)

    def test_historical_snapshots_storage(self):
        """Test that historical snapshots are stored"""
        # Add snapshots
        for i in range(150):
            snapshot = {
                'timestamp': datetime.now(timezone.utc) + timedelta(hours=i),
                'account_value': Decimal('100000000')
            }
            self.monitor.historical_snapshots.append(snapshot)

        # All snapshots should be stored (no maxlen limit currently)
        self.assertEqual(len(self.monitor.historical_snapshots), 150)

    @patch('requests.Session.post')
    def test_fetch_vault_data_success(self, mock_post):
        """Test successful vault data fetch"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'clearinghouseState': {
                'assetPositions': [{
                    'position': {'szi': '100', 'leverage': {'value': 2}},
                    'type': 'oneWay'
                }]
            },
            'crossMarginSummary': {
                'accountValue': '100000000',
                'totalMarginUsed': '50000000'
            }
        }
        mock_post.return_value = mock_response

        data = self.monitor._fetch_vault_data()

        self.assertIsNotNone(data)
        self.assertIn('clearinghouseState', data)

    @patch('requests.Session.post')
    def test_fetch_vault_data_failure(self, mock_post):
        """Test vault data fetch failure"""
        mock_post.side_effect = Exception("API Error")

        data = self.monitor._fetch_vault_data()

        self.assertIsNone(data)

    def test_pnl_24h_calculation(self):
        """Test 24h PnL calculation"""
        # Add historical snapshot from 25 hours ago
        old_snapshot = {
            'timestamp': datetime.now(timezone.utc) - timedelta(hours=25),
            'account_value': Decimal('100000000')
        }
        self.monitor.historical_snapshots.append(old_snapshot)

        current_value = Decimal('105000000')
        pnl = self.monitor._calculate_pnl_24h(current_value)

        # Should be $5M profit
        self.assertEqual(pnl, Decimal('5000000'))

    def test_pnl_24h_no_history(self):
        """Test 24h PnL with no historical data"""
        current_value = Decimal('105000000')
        pnl = self.monitor._calculate_pnl_24h(current_value)

        # Should return 0 with no history
        self.assertEqual(pnl, Decimal('0'))


class TestHLPVaultSnapshotModel(unittest.TestCase):
    """Test HLP Vault Snapshot data model"""

    def test_snapshot_creation(self):
        """Test snapshot model creation"""
        snapshot = HLPVaultSnapshot(
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=3.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0,
            is_healthy=True,
            health_issues=[]
        )

        self.assertEqual(snapshot.account_value, Decimal('100000000'))
        self.assertTrue(snapshot.is_healthy)
        self.assertEqual(len(snapshot.health_issues), 0)

    def test_snapshot_to_dict(self):
        """Test snapshot to dict conversion"""
        snapshot = HLPVaultSnapshot(
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=3.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0,
            is_healthy=True,
            health_issues=[]
        )

        data = snapshot.to_dict()

        self.assertIsInstance(data, dict)
        self.assertIn('account_value', data)
        self.assertIn('anomaly_score', data)


if __name__ == '__main__':
    unittest.main()
