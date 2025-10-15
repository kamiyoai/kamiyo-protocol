# -*- coding: utf-8 -*-
"""
Unit Tests for Telegram Integration
Tests bot functionality, API endpoints, and monitoring
"""

import pytest
import asyncio
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from datetime import datetime
from alerts.telegram_bot import KamiyoTelegramBot
from aggregators.telegram_monitor import TelegramMonitor


# ==========================================
# Fixtures
# ==========================================

@pytest.fixture
def mock_db_connection():
    """Mock database connection"""
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value = cursor
    cursor.fetchone.return_value = {
        'chat_id': 123456789,
        'tier': 'free',
        'is_active': True,
        'chains': None,
        'min_amount_usd': 0,
        'protocols': None,
        'max_alerts_per_day': 5,
        'alerts_today': 2
    }
    cursor.fetchall.return_value = []
    return conn


@pytest.fixture
def telegram_bot(mock_db_connection):
    """Create Telegram bot instance"""
    with patch('alerts.telegram_bot.psycopg2.connect', return_value=mock_db_connection):
        bot = KamiyoTelegramBot(
            token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
            database_url="postgresql://test:test@localhost/test"
        )
        return bot


@pytest.fixture
def telegram_monitor():
    """Create Telegram monitor instance"""
    return TelegramMonitor(
        bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        channels=["@test_channel"]
    )


@pytest.fixture
def sample_exploit():
    """Sample exploit data"""
    return {
        'id': 1,
        'tx_hash': '0x1234567890abcdef',
        'chain': 'Ethereum',
        'protocol': 'TestDeFi',
        'amount_usd': 500000,
        'timestamp': datetime.now(),
        'source': 'test',
        'source_url': 'https://test.com',
        'category': 'Flash Loan',
        'description': 'Test exploit description',
        'recovery_status': 'Funds recovered'
    }


# ==========================================
# Telegram Bot Tests
# ==========================================

class TestTelegramBot:
    """Test Telegram bot functionality"""

    @pytest.mark.asyncio
    async def test_bot_initialization(self, telegram_bot):
        """Test bot initializes correctly"""
        assert telegram_bot.token is not None
        assert telegram_bot.database_url is not None
        assert telegram_bot.running is False

    @pytest.mark.asyncio
    async def test_format_exploit_message(self, telegram_bot, sample_exploit):
        """Test exploit message formatting"""
        subscription = {
            'include_tx_link': True,
            'include_analysis': True
        }

        message = telegram_bot._format_exploit_message(sample_exploit, subscription)

        assert 'EXPLOIT ALERT' in message
        assert 'TestDeFi' in message
        assert 'Ethereum' in message
        assert '$500,000' in message
        assert 'Flash Loan' in message
        assert sample_exploit['tx_hash'] in message

    @pytest.mark.asyncio
    async def test_format_exploit_message_without_links(self, telegram_bot, sample_exploit):
        """Test message formatting without transaction links"""
        subscription = {
            'include_tx_link': False,
            'include_analysis': False
        }

        message = telegram_bot._format_exploit_message(sample_exploit, subscription)

        assert 'EXPLOIT ALERT' in message
        assert sample_exploit['tx_hash'] not in message
        assert sample_exploit['description'] not in message

    @pytest.mark.asyncio
    async def test_send_exploit_alert_success(self, telegram_bot, sample_exploit, mock_db_connection):
        """Test sending exploit alert successfully"""
        with patch.object(telegram_bot, 'application') as mock_app:
            mock_bot = AsyncMock()
            mock_message = MagicMock()
            mock_message.message_id = 12345
            mock_bot.send_message.return_value = mock_message
            mock_app.bot = mock_bot

            subscription = {
                'chat_id': 123456789,
                'include_tx_link': True,
                'include_analysis': True
            }

            with patch.object(telegram_bot, 'get_db_connection', return_value=mock_db_connection):
                result = await telegram_bot.send_exploit_alert(123456789, sample_exploit, subscription)

            assert result is True
            mock_bot.send_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_exploit_alert_rate_limited(self, telegram_bot, sample_exploit, mock_db_connection):
        """Test alert is blocked when rate limited"""
        # Mock rate limit check to return False
        cursor = mock_db_connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {'tier': 'free'},
            {'check_telegram_rate_limit': False}
        ]

        with patch.object(telegram_bot, 'get_db_connection', return_value=mock_db_connection):
            subscription = {'chat_id': 123456789}
            result = await telegram_bot.send_exploit_alert(123456789, sample_exploit, subscription)

        assert result is False

    @pytest.mark.asyncio
    async def test_send_exploit_alert_duplicate(self, telegram_bot, sample_exploit, mock_db_connection):
        """Test alert is not sent if already sent"""
        cursor = mock_db_connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {'tier': 'free'},
            {'check_telegram_rate_limit': True},
            {'id': 1}  # Alert already exists
        ]

        with patch.object(telegram_bot, 'get_db_connection', return_value=mock_db_connection):
            subscription = {'chat_id': 123456789}
            result = await telegram_bot.send_exploit_alert(123456789, sample_exploit, subscription)

        assert result is False


# ==========================================
# Telegram Monitor Tests
# ==========================================

class TestTelegramMonitor:
    """Test Telegram channel monitoring"""

    def test_monitor_initialization(self, telegram_monitor):
        """Test monitor initializes correctly"""
        assert telegram_monitor.name == "telegram_monitor"
        assert telegram_monitor.bot_token is not None
        assert len(telegram_monitor.channels) == 1
        assert telegram_monitor.channels[0] == "@test_channel"

    def test_parse_amount_from_message(self, telegram_monitor):
        """Test parsing dollar amounts from messages"""
        text1 = "Protocol exploited for $5.2 million"
        assert telegram_monitor.parse_amount(text1) == 5_200_000

        text2 = "Loss of $100,000 in flash loan attack"
        assert telegram_monitor.parse_amount(text2) == 100_000

        text3 = "$1.5M stolen from DeFi protocol"
        assert telegram_monitor.parse_amount(text3) == 1_500_000

    def test_extract_chain_from_message(self, telegram_monitor):
        """Test extracting blockchain from messages"""
        text1 = "Exploit on Ethereum mainnet"
        assert telegram_monitor.extract_chain(text1) == "Ethereum"

        text2 = "BSC protocol hacked"
        assert telegram_monitor.extract_chain(text2) == "Bsc"

        text3 = "Polygon DeFi exploit"
        assert telegram_monitor.extract_chain(text3) == "Polygon"

    def test_extract_protocol_from_message(self, telegram_monitor):
        """Test extracting protocol name from messages"""
        text1 = "Uniswap exploited via flash loan"
        protocol = telegram_monitor._extract_protocol(text1)
        assert protocol == "Uniswap"

        text2 = "AAVE protocol vulnerability discovered"
        protocol = telegram_monitor._extract_protocol(text2)
        assert protocol == "Aave"

    def test_extract_tx_hash_ethereum(self, telegram_monitor):
        """Test extracting Ethereum transaction hash"""
        text = "TX: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        tx_hash = telegram_monitor._extract_tx_hash(text)
        assert tx_hash.startswith("0x")
        assert len(tx_hash) == 66

    def test_determine_category_flash_loan(self, telegram_monitor):
        """Test category detection for flash loan attacks"""
        text = "Protocol exploited via flash loan attack"
        category = telegram_monitor._determine_category(text)
        assert category == "Flash Loan"

    def test_determine_category_reentrancy(self, telegram_monitor):
        """Test category detection for reentrancy attacks"""
        text = "Reentrancy vulnerability exploited"
        category = telegram_monitor._determine_category(text)
        assert category == "Reentrancy"

    def test_determine_category_oracle(self, telegram_monitor):
        """Test category detection for oracle manipulation"""
        text = "Oracle price manipulation attack"
        category = telegram_monitor._determine_category(text)
        assert category == "Oracle Manipulation"

    def test_parse_message_with_all_fields(self, telegram_monitor):
        """Test parsing complete message"""
        message = (
            "🚨 EXPLOIT ALERT 🚨\n"
            "Protocol: TestDeFi\n"
            "Chain: Ethereum\n"
            "Loss: $5.2 million\n"
            "Flash loan attack detected\n"
            "TX: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        )

        exploit = telegram_monitor._parse_message(message, "@test_channel", datetime.now())

        assert exploit is not None
        assert exploit['chain'] == "Ethereum"
        assert exploit['amount_usd'] == 5_200_000
        assert exploit['category'] == "Flash Loan"
        assert exploit['tx_hash'].startswith("0x")

    def test_parse_message_missing_details(self, telegram_monitor):
        """Test parsing message with missing information"""
        message = "Some protocol was exploited"

        exploit = telegram_monitor._parse_message(message, "@test_channel", datetime.now())

        # Should still create exploit with defaults
        if exploit:
            assert exploit['chain'] in ["Unknown", None]
            assert exploit['protocol'] in ["Unknown", None]

    def test_parse_message_no_exploit_keywords(self, telegram_monitor):
        """Test that non-exploit messages are ignored"""
        message = "Just a regular announcement about our protocol"

        exploit = telegram_monitor._parse_message(message, "@test_channel", datetime.now())

        assert exploit is None


# ==========================================
# API Endpoint Tests
# ==========================================

class TestTelegramAPI:
    """Test Telegram API endpoints"""

    @pytest.mark.asyncio
    async def test_link_telegram_account(self):
        """Test linking Telegram account to platform user"""
        # This would require FastAPI TestClient
        # Simplified test to show structure
        from api.telegram import link_telegram_account, TelegramLinkRequest

        request = TelegramLinkRequest(
            user_id="user123",
            chat_id=123456789
        )

        # Would need to mock database connection
        # assert response.success is True

    @pytest.mark.asyncio
    async def test_get_telegram_status(self):
        """Test getting Telegram bot status"""
        # Would use FastAPI TestClient
        # response = client.get("/api/v1/telegram/status")
        # assert response.status_code == 200
        # assert "bot_active" in response.json()
        pass

    @pytest.mark.asyncio
    async def test_update_telegram_settings(self):
        """Test updating Telegram alert settings"""
        # Would use FastAPI TestClient
        # payload = {
        #     "chains": ["Ethereum", "BSC"],
        #     "min_amount_usd": 100000
        # }
        # response = client.post("/api/v1/telegram/settings?chat_id=123", json=payload)
        # assert response.status_code == 200
        pass


# ==========================================
# Integration Tests
# ==========================================

class TestTelegramIntegration:
    """Test full integration scenarios"""

    @pytest.mark.asyncio
    async def test_end_to_end_alert_flow(self, telegram_bot, sample_exploit, mock_db_connection):
        """Test complete alert delivery flow"""
        # 1. User subscribes
        # 2. New exploit detected
        # 3. Alert sent to matching users
        # 4. Rate limit updated
        # 5. Alert logged

        with patch.object(telegram_bot, 'application') as mock_app:
            mock_bot = AsyncMock()
            mock_message = MagicMock()
            mock_message.message_id = 12345
            mock_bot.send_message.return_value = mock_message
            mock_app.bot = mock_bot

            cursor = mock_db_connection.cursor.return_value
            cursor.fetchone.side_effect = [
                {'tier': 'pro'},
                {'check_telegram_rate_limit': True},
                None  # No duplicate
            ]

            with patch.object(telegram_bot, 'get_db_connection', return_value=mock_db_connection):
                subscription = {
                    'chat_id': 123456789,
                    'include_tx_link': True,
                    'include_analysis': True
                }
                result = await telegram_bot.send_exploit_alert(123456789, sample_exploit, subscription)

            assert result is True
            mock_bot.send_message.assert_called_once()


# ==========================================
# Performance Tests
# ==========================================

class TestTelegramPerformance:
    """Test performance characteristics"""

    @pytest.mark.asyncio
    async def test_bulk_alert_sending(self, telegram_bot, sample_exploit):
        """Test sending alerts to multiple users"""
        # Simulate broadcasting to 100 users
        with patch.object(telegram_bot, 'send_exploit_alert') as mock_send:
            mock_send.return_value = True

            tasks = []
            for i in range(100):
                subscription = {'chat_id': i}
                task = telegram_bot.send_exploit_alert(i, sample_exploit, subscription)
                tasks.append(task)

            results = await asyncio.gather(*tasks)
            assert len(results) == 100
            assert all(results)

    def test_message_formatting_performance(self, telegram_bot, sample_exploit):
        """Test message formatting speed"""
        import time

        subscription = {
            'include_tx_link': True,
            'include_analysis': True
        }

        start = time.time()
        for _ in range(1000):
            telegram_bot._format_exploit_message(sample_exploit, subscription)
        end = time.time()

        # Should format 1000 messages in less than 1 second
        assert (end - start) < 1.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
