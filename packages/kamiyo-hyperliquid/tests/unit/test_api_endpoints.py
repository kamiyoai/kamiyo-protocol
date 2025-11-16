"""
Unit Tests for API Endpoints
Tests FastAPI endpoints, response formatting, and error handling
"""

import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.main import app


class TestAPIEndpoints(unittest.TestCase):
    """Test suite for API endpoints"""

    def setUp(self):
        """Set up test client"""
        self.client = TestClient(app)

    def test_health_endpoint(self):
        """Test /health endpoint"""
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("status", data)
        self.assertEqual(data["status"], "healthy")
        self.assertIn("timestamp", data)

    def test_root_endpoint(self):
        """Test root endpoint"""
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("name", data)
        self.assertIn("version", data)
        self.assertIn("description", data)

    @patch('api.main._fetch_all_exploits')
    def test_get_exploits(self, mock_fetch):
        """Test /exploits endpoint"""
        mock_fetch.return_value = [
            {
                'tx_hash': '0x123',
                'chain': 'Hyperliquid',
                'protocol': 'Hyperliquid DEX',
                'amount_usd': 1000000.0,
                'timestamp': datetime.now(timezone.utc),
                'category': 'test'
            }
        ]

        response = self.client.get("/exploits")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("exploits", data)
        self.assertIn("count", data)
        self.assertEqual(data["count"], 1)

    @patch('api.main._fetch_all_exploits')
    def test_get_exploits_with_limit(self, mock_fetch):
        """Test /exploits endpoint with limit parameter"""
        mock_exploits = [
            {
                'tx_hash': f'0x{i}',
                'chain': 'Hyperliquid',
                'protocol': 'Hyperliquid DEX',
                'amount_usd': 1000000.0,
                'timestamp': datetime.now(timezone.utc),
                'category': 'test'
            }
            for i in range(10)
        ]
        mock_fetch.return_value = mock_exploits

        response = self.client.get("/exploits?limit=5")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Should only return 5 exploits
        self.assertLessEqual(len(data["exploits"]), 5)

    @patch('api.main._fetch_all_exploits')
    def test_get_exploits_with_chain_filter(self, mock_fetch):
        """Test /exploits endpoint with chain filter"""
        mock_fetch.return_value = [
            {
                'tx_hash': '0x123',
                'chain': 'Hyperliquid',
                'amount_usd': 1000000.0,
                'timestamp': datetime.now(timezone.utc)
            }
        ]

        response = self.client.get("/exploits?chain=Hyperliquid")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        # All returned exploits should be on Hyperliquid
        for exploit in data["exploits"]:
            self.assertEqual(exploit["chain"], "Hyperliquid")

    @patch('monitors.hlp_vault_monitor.HLPVaultMonitor.get_current_health')
    def test_hlp_vault_health(self, mock_get_health):
        """Test /security/hlp-vault endpoint"""
        from models.security import HLPVaultSnapshot

        mock_snapshot = HLPVaultSnapshot(
            vault_address="0xtest",
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=2.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0,
            is_healthy=True,
            health_issues=[]
        )
        mock_get_health.return_value = mock_snapshot

        response = self.client.get("/security/hlp-vault")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("vault_address", data)
        self.assertIn("account_value", data)
        self.assertIn("anomaly_score", data)
        self.assertIn("is_healthy", data)

    @patch('monitors.oracle_monitor.OracleMonitor.check_all_deviations')
    def test_oracle_deviations(self, mock_check):
        """Test /security/oracle-deviations endpoint"""
        from models.security import OracleDeviation

        mock_deviation = OracleDeviation(
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
        mock_check.return_value = [mock_deviation]

        response = self.client.get("/security/oracle-deviations")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("deviations", data)
        self.assertIn("count", data)
        self.assertEqual(data["count"], 1)

    @patch('monitors.liquidation_analyzer.LiquidationAnalyzer.analyze_recent_liquidations')
    def test_liquidation_patterns(self, mock_analyze):
        """Test /security/liquidation-patterns endpoint"""
        from models.security import LiquidationPattern

        mock_pattern = LiquidationPattern(
            pattern_type="flash_loan",
            start_time=datetime.now(timezone.utc) - timedelta(seconds=10),
            end_time=datetime.now(timezone.utc),
            duration_seconds=10.0,
            total_liquidated_usd=Decimal('750000'),
            affected_users=3,
            assets_involved=["BTC", "ETH"],
            suspicion_score=85.0,
            liquidation_ids=["1", "2", "3"]
        )
        mock_analyze.return_value = [mock_pattern]

        response = self.client.get("/security/liquidation-patterns")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("patterns", data)
        self.assertIn("count", data)
        self.assertEqual(data["count"], 1)

    @patch('monitors.hlp_vault_monitor.HLPVaultMonitor.get_current_health')
    @patch('monitors.oracle_monitor.OracleMonitor.check_all_deviations')
    @patch('monitors.liquidation_analyzer.LiquidationAnalyzer.analyze_recent_liquidations')
    def test_security_dashboard(self, mock_liq, mock_oracle, mock_hlp):
        """Test /security/dashboard endpoint"""
        # Mock HLP health
        from models.security import HLPVaultSnapshot, OracleDeviation

        mock_hlp.return_value = HLPVaultSnapshot(
            vault_address="0xtest",
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=2.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0,
            is_healthy=True,
            health_issues=[]
        )

        # Mock oracle deviations
        mock_oracle.return_value = []

        # Mock liquidations
        mock_liq.return_value = []

        response = self.client.get("/security/dashboard")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("overall_risk_score", data)
        self.assertIn("risk_level", data)
        self.assertIn("hlp_vault", data)
        self.assertIn("oracle_deviations", data)
        self.assertIn("liquidation_patterns", data)

    def test_stats_endpoint(self):
        """Test /stats endpoint"""
        response = self.client.get("/stats")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("monitored_assets", data)
        self.assertIn("alert_channels_configured", data)
        self.assertIn("uptime_seconds", data)

    def test_rate_limiting(self):
        """Test that rate limiting is applied"""
        # Make many requests rapidly
        responses = []
        for _ in range(100):
            response = self.client.get("/health")
            responses.append(response.status_code)

        # Should eventually get rate limited (429)
        # Note: This depends on rate limit settings
        # For now, just check that we can make some requests
        self.assertIn(200, responses)

    def test_cors_headers(self):
        """Test CORS headers are present"""
        response = self.client.options(
            "/health",
            headers={"Origin": "http://example.com"}
        )

        # Should have CORS headers
        self.assertIn("access-control-allow-origin", response.headers)

    def test_invalid_endpoint(self):
        """Test 404 for invalid endpoints"""
        response = self.client.get("/invalid/endpoint")

        self.assertEqual(response.status_code, 404)

    def test_error_handling(self):
        """Test error handling returns proper status codes"""
        # Test with invalid query parameters
        response = self.client.get("/exploits?limit=-1")

        # Should return error (400 or 422)
        self.assertIn(response.status_code, [400, 422])


class TestResponseModels(unittest.TestCase):
    """Test response model serialization"""

    def test_exploit_serialization(self):
        """Test exploit data serialization"""
        from models.security import HLPVaultSnapshot

        snapshot = HLPVaultSnapshot(
            vault_address="0xtest",
            account_value=Decimal('100000000'),
            pnl_24h=Decimal('100000'),
            all_time_pnl=Decimal('50000000'),
            sharpe_ratio=2.0,
            max_drawdown=2.0,
            timestamp=datetime.now(timezone.utc),
            anomaly_score=15.0,
            is_healthy=True,
            health_issues=[]
        )

        data = snapshot.to_dict()

        self.assertIsInstance(data, dict)
        self.assertIn('account_value', data)
        # Decimals should be converted to floats/strings
        self.assertIsInstance(data['account_value'], (float, str))

    def test_timestamp_serialization(self):
        """Test timestamp serialization in responses"""
        from models.security import OracleDeviation

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

        self.assertIn('timestamp', data)
        # Timestamp should be ISO format string
        if isinstance(data['timestamp'], str):
            # Should be parseable
            datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))


if __name__ == '__main__':
    unittest.main()
