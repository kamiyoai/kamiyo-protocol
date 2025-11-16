# -*- coding: utf-8 -*-
"""
Unit Tests for Oracle Monitor
Tests price deviation detection and multi-source validation
"""

import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from monitors.oracle_monitor import OracleMonitor
from models.security import OracleDeviation


class TestOracleMonitor(unittest.TestCase):
    """Test suite for Oracle Monitor"""

    def setUp(self):
        """Set up test fixtures"""
        self.monitor = OracleMonitor()

    def test_initialization(self):
        """Test monitor initialization"""
        self.assertEqual(self.monitor.name, "oracle_monitor")
        # Check that deviation_history is initialized
        self.assertIsNotNone(self.monitor.deviation_history)
        self.assertIsInstance(self.monitor.deviation_history, dict)

    def test_deviation_calculation(self):
        """Test price deviation calculation"""
        hl_price = 43250.0
        ref_price = 43000.0

        deviation = self.monitor._calculate_deviation(hl_price, ref_price)

        # Should be about 0.58%
        self.assertAlmostEqual(deviation, 0.581, places=2)

    def test_deviation_calculation_negative(self):
        """Test negative price deviation"""
        hl_price = 43000.0
        ref_price = 43250.0

        deviation = self.monitor._calculate_deviation(hl_price, ref_price)

        # Should be negative
        self.assertLess(deviation, 0)

    def test_deviation_calculation_zero_ref_price(self):
        """Test deviation with zero reference price"""
        hl_price = 43250.0
        ref_price = 0.0

        deviation = self.monitor._calculate_deviation(hl_price, ref_price)

        # Should return 0 to avoid division by zero
        self.assertEqual(deviation, 0)

    def test_severity_critical(self):
        """Test severity for critical deviation"""
        severity = self.monitor._get_deviation_severity(1.5)

        self.assertEqual(severity, "critical")

    def test_severity_high(self):
        """Test severity for high deviation"""
        severity = self.monitor._get_deviation_severity(0.7)

        self.assertEqual(severity, "high")

    def test_severity_medium(self):
        """Test severity for medium deviation"""
        severity = self.monitor._get_deviation_severity(0.3)

        self.assertEqual(severity, "medium")

    def test_severity_low(self):
        """Test severity for low deviation"""
        severity = self.monitor._get_deviation_severity(0.1)

        self.assertEqual(severity, "low")

    def test_risk_score_critical(self):
        """Test risk score for critical deviation"""
        score = self.monitor._calculate_risk_score(1.5, 60.0)

        # Should be high (>70)
        self.assertGreater(score, 70)

    def test_risk_score_low(self):
        """Test risk score for low deviation"""
        score = self.monitor._calculate_risk_score(0.1, 5.0)

        # Should be low (<30)
        self.assertLess(score, 30)

    def test_risk_score_sustained_deviation(self):
        """Test risk score increases with sustained deviation"""
        score_short = self.monitor._calculate_risk_score(0.6, 10.0)
        score_long = self.monitor._calculate_risk_score(0.6, 60.0)

        # Longer duration should increase score
        self.assertGreater(score_long, score_short)

    @patch('requests.Session.get')
    def test_fetch_binance_price_success(self, mock_get):
        """Test successful Binance price fetch"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'price': '43250.50'}
        mock_get.return_value = mock_response

        price = self.monitor._fetch_binance_price("BTC")

        self.assertIsNotNone(price)
        self.assertEqual(price, 43250.50)

    @patch('requests.Session.get')
    def test_fetch_binance_price_failure(self, mock_get):
        """Test Binance price fetch failure"""
        mock_get.side_effect = Exception("API Error")

        price = self.monitor._fetch_binance_price("BTC")

        self.assertIsNone(price)

    @patch('requests.Session.get')
    def test_fetch_coinbase_price_success(self, mock_get):
        """Test successful Coinbase price fetch"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'data': {'amount': '43200.75'}
        }
        mock_get.return_value = mock_response

        price = self.monitor._fetch_coinbase_price("BTC")

        self.assertIsNotNone(price)
        self.assertEqual(price, 43200.75)

    @patch('requests.Session.get')
    def test_fetch_coinbase_price_failure(self, mock_get):
        """Test Coinbase price fetch failure"""
        mock_get.side_effect = Exception("API Error")

        price = self.monitor._fetch_coinbase_price("BTC")

        self.assertIsNone(price)

    @patch('requests.Session.post')
    def test_fetch_hyperliquid_price_success(self, mock_post):
        """Test successful Hyperliquid price fetch"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'BTC': '43250.00',
            'ETH': '2250.00'
        }
        mock_post.return_value = mock_response

        price = self.monitor._fetch_hyperliquid_price("BTC")

        self.assertIsNotNone(price)
        self.assertEqual(price, 43250.00)

    @patch('requests.Session.post')
    def test_fetch_hyperliquid_price_failure(self, mock_post):
        """Test Hyperliquid price fetch failure"""
        mock_post.side_effect = Exception("API Error")

        price = self.monitor._fetch_hyperliquid_price("BTC")

        self.assertIsNone(price)

    def test_max_deviation_calculation(self):
        """Test maximum deviation calculation"""
        hl_price = 43250.0
        binance_price = 43000.0
        coinbase_price = 43100.0

        max_dev, ref_price = self.monitor._get_max_deviation(
            hl_price, binance_price, coinbase_price
        )

        # Should pick the larger deviation
        self.assertGreater(max_dev, 0)
        self.assertIn(ref_price, [binance_price, coinbase_price])

    def test_max_deviation_no_ref_prices(self):
        """Test max deviation with no reference prices"""
        hl_price = 43250.0

        max_dev, ref_price = self.monitor._get_max_deviation(
            hl_price, None, None
        )

        # Should return 0 with no reference prices
        self.assertEqual(max_dev, 0)
        self.assertIsNone(ref_price)

    def test_deviation_tracking(self):
        """Test deviation tracking over time"""
        asset = "BTC"
        deviation = OracleDeviation(
            asset=asset,
            hyperliquid_price=Decimal('43250'),
            binance_price=Decimal('43000'),
            coinbase_price=Decimal('43100'),
            max_deviation_pct=Decimal('0.58'),
            max_deviation_source="binance",
            risk_score=45.0,
            severity="medium",
            duration_seconds=30.0,
            timestamp=datetime.now(timezone.utc)
        )

        # Track deviation
        self.monitor.deviation_history[asset].append({
            'deviation': deviation,
            'timestamp': deviation.timestamp
        })

        self.assertEqual(len(self.monitor.deviation_history[asset]), 1)

    def test_deviation_history_limit(self):
        """Test deviation history is limited"""
        asset = "BTC"

        # Add more than maxlen deviations
        for i in range(150):
            self.monitor.deviation_history[asset].append({
                'deviation': Decimal('0.5'),
                'timestamp': datetime.now(timezone.utc) + timedelta(seconds=i)
            })

        # Should be limited to 100
        self.assertLessEqual(len(self.monitor.deviation_history[asset]), 100)


class TestOracleDeviationModel(unittest.TestCase):
    """Test Oracle Deviation data model"""

    def test_deviation_creation(self):
        """Test deviation model creation"""
        deviation = OracleDeviation(
            asset="BTC",
            hyperliquid_price=Decimal('43250'),
            binance_price=Decimal('43000'),
            coinbase_price=Decimal('43100'),
            max_deviation_pct=Decimal('0.58'),
            max_deviation_source="binance",
            risk_score=45.0,
            severity="medium",
            duration_seconds=30.0,
            timestamp=datetime.now(timezone.utc)
        )

        self.assertEqual(deviation.asset, "BTC")
        self.assertEqual(deviation.severity, "medium")
        self.assertEqual(deviation.risk_score, 45.0)

    def test_deviation_to_dict(self):
        """Test deviation to dict conversion"""
        deviation = OracleDeviation(
            asset="BTC",
            hyperliquid_price=Decimal('43250'),
            binance_price=Decimal('43000'),
            coinbase_price=None,
            max_deviation_pct=Decimal('0.58'),
            max_deviation_source="binance",
            risk_score=45.0,
            severity="medium",
            duration_seconds=30.0,
            timestamp=datetime.now(timezone.utc)
        )

        data = deviation.to_dict()

        self.assertIsInstance(data, dict)
        self.assertIn('asset', data)
        self.assertIn('max_deviation_pct', data)
        self.assertIn('risk_score', data)


if __name__ == '__main__':
    unittest.main()
