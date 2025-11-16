"""
Unit Tests for Alert Manager
Tests multi-channel alert delivery and formatting
"""

import unittest
import os
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from alerts.alert_manager import HyperliquidAlertManager, AlertLevel


class TestAlertManager(unittest.TestCase):
    """Test suite for Alert Manager"""

    def setUp(self):
        """Set up test fixtures"""
        # Set environment variables for testing
        os.environ['ALERTS_ENABLED'] = 'true'
        os.environ['ALERT_MIN_SEVERITY'] = 'info'

        self.manager = HyperliquidAlertManager()

    def tearDown(self):
        """Clean up after tests"""
        # Clear environment variables
        for key in ['ALERTS_ENABLED', 'ALERT_MIN_SEVERITY', 'TELEGRAM_BOT_TOKEN',
                    'TELEGRAM_CHAT_ID', 'DISCORD_WEBHOOK_URL']:
            os.environ.pop(key, None)

    def test_initialization(self):
        """Test manager initialization"""
        self.assertIsNotNone(self.manager.enabled_channels)
        self.assertIsInstance(self.manager.enabled_channels, dict)
        self.assertIsNotNone(self.manager.min_severity)

    def test_singleton_pattern(self):
        """Test that manager implements singleton pattern"""
        from alerts import get_alert_manager

        manager1 = get_alert_manager()
        manager2 = get_alert_manager()

        self.assertIs(manager1, manager2)

    def test_min_severity_setting(self):
        """Test minimum severity setting"""
        os.environ['ALERT_MIN_SEVERITY'] = 'high'
        manager = HyperliquidAlertManager()

        self.assertEqual(manager.min_severity, 'high')

    def test_enabled_channels(self):
        """Test that enabled channels are tracked correctly"""
        os.environ['TELEGRAM_BOT_TOKEN'] = 'test_token'
        os.environ['TELEGRAM_CHAT_ID'] = '12345'

        manager = HyperliquidAlertManager()

        # Telegram should be enabled
        self.assertTrue(manager.enabled_channels['telegram'])

    @patch('requests.post')
    def test_telegram_alert_success(self, mock_post):
        """Test successful Telegram alert"""
        os.environ['TELEGRAM_BOT_TOKEN'] = 'test_token'
        os.environ['TELEGRAM_CHAT_ID'] = '12345'

        manager = HyperliquidAlertManager()

        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = manager._send_telegram(
            title="Test Alert",
            message="Test message",
            level=AlertLevel.WARNING,
            metadata={}
        )

        self.assertTrue(result)
        mock_post.assert_called_once()

    @patch('requests.post')
    def test_telegram_alert_failure(self, mock_post):
        """Test Telegram alert failure"""
        os.environ['TELEGRAM_BOT_TOKEN'] = 'test_token'
        os.environ['TELEGRAM_CHAT_ID'] = '12345'

        manager = HyperliquidAlertManager()

        mock_post.side_effect = Exception("API Error")

        result = manager._send_telegram(
            title="Test Alert",
            message="Test message",
            level=AlertLevel.WARNING,
            metadata={}
        )

        self.assertFalse(result)

    @patch('requests.post')
    def test_discord_alert_success(self, mock_post):
        """Test successful Discord alert"""
        os.environ['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/test'

        manager = HyperliquidAlertManager()

        mock_response = Mock()
        mock_response.status_code = 204
        mock_post.return_value = mock_response

        result = manager._send_discord(
            title="Test Alert",
            message="Test message",
            level=AlertLevel.ERROR,
            metadata={}
        )

        self.assertTrue(result)
        mock_post.assert_called_once()

    @patch('requests.post')
    def test_discord_embed_formatting(self, mock_post):
        """Test Discord embed formatting"""
        os.environ['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/test'

        manager = HyperliquidAlertManager()

        mock_response = Mock()
        mock_response.status_code = 204
        mock_post.return_value = mock_response

        manager._send_discord(
            title="Test Alert",
            message="Test message",
            level=AlertLevel.CRITICAL,
            metadata={'key': 'value'}
        )

        # Check that embed was included in call
        call_args = mock_post.call_args
        payload = call_args[1]['json']

        self.assertIn('embeds', payload)
        self.assertEqual(len(payload['embeds']), 1)
        # Discord implementation adds emoji to title based on level
        self.assertEqual(payload['embeds'][0]['title'], "🚨 Test Alert")

    def test_hlp_vault_anomaly_alert(self):
        """Test HLP vault anomaly alert"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_hlp_vault_anomaly(
                anomaly_score=75.5,
                account_value=577000000.0,
                pnl_24h=-2500000.0,
                health_issues=["Large loss detected"]
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # Check severity based on score
            self.assertIn(call_args[1]['level'], [AlertLevel.CRITICAL, AlertLevel.ERROR])

    def test_oracle_deviation_alert(self):
        """Test oracle deviation alert"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_oracle_deviation(
                asset="BTC",
                deviation_pct=1.25,
                hl_price=43250.0,
                reference_price=42700.0,
                duration=45.0
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # Should be CRITICAL for >1% deviation
            self.assertEqual(call_args[1]['level'], AlertLevel.CRITICAL)

    def test_flash_loan_alert(self):
        """Test flash loan attack alert"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_flash_loan_attack(
                total_usd=750000.0,
                duration=8.5,
                liquidation_count=3,
                assets=["BTC", "ETH"]
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # Flash loans are always CRITICAL
            self.assertEqual(call_args[1]['level'], AlertLevel.CRITICAL)

    def test_cascade_liquidation_alert(self):
        """Test cascade liquidation alert"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_cascade_liquidation(
                total_usd=1250000.0,
                count=5,
                duration=300.0,
                price_impact={'BTC': 2.5}
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # Cascade liquidations are ERROR level
            self.assertEqual(call_args[1]['level'], AlertLevel.ERROR)

    def test_large_loss_alert_critical(self):
        """Test large loss alert (>$2M)"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_large_loss(
                amount=2500000.0,
                source="HLP Vault",
                description="Large loss detected"
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # >$2M should be CRITICAL
            self.assertEqual(call_args[1]['level'], AlertLevel.CRITICAL)

    def test_large_loss_alert_error(self):
        """Test large loss alert ($1-2M)"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_large_loss(
                amount=1500000.0,
                source="HLP Vault",
                description="Large loss detected"
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # $1-2M should be ERROR
            self.assertEqual(call_args[1]['level'], AlertLevel.ERROR)

    def test_system_health_alert(self):
        """Test system health alert"""
        with patch.object(self.manager, 'send_alert') as mock_send:
            self.manager.alert_system_health(
                component="WebSocket Monitor",
                status="down",
                error="Connection failed"
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args

            # System down should be CRITICAL
            self.assertEqual(call_args[1]['level'], AlertLevel.CRITICAL)

    def test_telegram_message_formatting(self):
        """Test Telegram message formatting"""
        message = self.manager._format_telegram_message(
            title="Test Alert",
            message="Test message body",
            level=AlertLevel.WARNING,
            metadata={'key1': 'value1', 'key2': 'value2'}
        )

        self.assertIn("Test Alert", message)
        self.assertIn("Test message body", message)
        self.assertIn("key1", message)
        self.assertIn("value1", message)

    def test_alert_level_enum(self):
        """Test AlertLevel enum values"""
        self.assertEqual(AlertLevel.CRITICAL.value, 'critical')
        self.assertEqual(AlertLevel.ERROR.value, 'error')
        self.assertEqual(AlertLevel.WARNING.value, 'warning')
        self.assertEqual(AlertLevel.INFO.value, 'info')


if __name__ == '__main__':
    unittest.main()
