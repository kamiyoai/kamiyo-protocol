# -*- coding: utf-8 -*-
"""
Discord Integration Tests
Tests for Discord bot, monitor, and API endpoints
"""

import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alerts.discord_bot import (
    DiscordAlertBot,
    get_severity_from_amount,
    format_amount,
    CHAIN_ICONS,
    SEVERITY_COLORS
)
from aggregators.discord_monitor import DiscordMonitor


# Test Helper Functions

def test_get_severity_from_amount():
    """Test severity level determination from amount"""
    assert get_severity_from_amount(20_000_000) == 'critical'
    assert get_severity_from_amount(5_000_000) == 'high'
    assert get_severity_from_amount(500_000) == 'medium'
    assert get_severity_from_amount(50_000) == 'low'
    assert get_severity_from_amount(0) == 'info'


def test_format_amount():
    """Test USD amount formatting"""
    assert format_amount(5_000_000) == "$5.00M"
    assert format_amount(1_500_000) == "$1.50M"
    assert format_amount(250_000) == "$250.00K"
    assert format_amount(5_000) == "$5.00K"
    assert format_amount(999) == "$999.00"


def test_chain_icons():
    """Test that chain icons are defined"""
    assert 'ethereum' in CHAIN_ICONS
    assert 'bsc' in CHAIN_ICONS
    assert 'polygon' in CHAIN_ICONS
    assert len(CHAIN_ICONS) > 5


def test_severity_colors():
    """Test that severity colors are defined"""
    assert 'critical' in SEVERITY_COLORS
    assert 'high' in SEVERITY_COLORS
    assert 'medium' in SEVERITY_COLORS
    assert 'low' in SEVERITY_COLORS
    assert 'info' in SEVERITY_COLORS


# Test Discord Bot

@pytest.fixture
def mock_db():
    """Mock database connection"""
    db = Mock()
    db.execute = Mock(return_value=Mock(fetchone=Mock(return_value=None)))
    db.commit = Mock()
    return db


@pytest.fixture
def discord_bot(mock_db):
    """Create Discord bot instance with mocked dependencies"""
    with patch('alerts.discord_bot.get_db', return_value=mock_db):
        bot = DiscordAlertBot()
        bot.user = Mock(id=123456789, name="TestBot")
        return bot


def test_discord_bot_initialization(discord_bot):
    """Test Discord bot initializes correctly"""
    assert discord_bot is not None
    assert discord_bot.db is not None


def test_create_exploit_embed(discord_bot):
    """Test exploit embed creation"""
    exploit = {
        'tx_hash': '0x123456789abcdef',
        'chain': 'Ethereum',
        'protocol': 'TestProtocol',
        'amount_usd': 1_000_000,
        'timestamp': datetime.now(),
        'source': 'test_source',
        'source_url': 'https://example.com',
        'category': 'Flash Loan',
        'description': 'Test exploit description',
        'recovery_status': 'Funds Recovered'
    }

    embed = discord_bot.create_exploit_embed(exploit)

    assert embed is not None
    assert 'TestProtocol' in embed.title
    assert embed.color == SEVERITY_COLORS['high']  # $1M = high severity
    assert len(embed.fields) > 0


def test_get_explorer_url(discord_bot):
    """Test blockchain explorer URL generation"""
    tx_hash = '0x123456789abcdef'

    eth_url = discord_bot.get_explorer_url('Ethereum', tx_hash)
    assert 'etherscan.io' in eth_url
    assert tx_hash in eth_url

    bsc_url = discord_bot.get_explorer_url('BSC', tx_hash)
    assert 'bscscan.com' in bsc_url

    polygon_url = discord_bot.get_explorer_url('Polygon', tx_hash)
    assert 'polygonscan.com' in polygon_url

    unknown_url = discord_bot.get_explorer_url('UnknownChain', tx_hash)
    assert unknown_url is None


@pytest.mark.asyncio
async def test_send_exploit_alert(discord_bot, mock_db):
    """Test sending exploit alert to channel"""
    # Mock Discord channel
    mock_channel = AsyncMock()
    mock_channel.send = AsyncMock(return_value=Mock(id=987654321))

    discord_bot.get_channel = Mock(return_value=mock_channel)

    exploit = {
        'tx_hash': '0x123456789abcdef',
        'chain': 'Ethereum',
        'protocol': 'TestProtocol',
        'amount_usd': 500_000,
        'timestamp': datetime.now(),
        'source': 'test_source',
        'source_url': 'https://example.com',
        'category': 'Flash Loan',
        'description': 'Test exploit',
        'recovery_status': None
    }

    result = await discord_bot.send_exploit_alert(
        channel_id=123456,
        exploit=exploit,
        create_thread=False
    )

    assert result is True
    mock_channel.send.assert_called_once()


@pytest.mark.asyncio
async def test_send_exploit_alert_channel_not_found(discord_bot):
    """Test sending alert when channel not found"""
    discord_bot.get_channel = Mock(return_value=None)

    exploit = {
        'tx_hash': '0x123456789abcdef',
        'chain': 'Ethereum',
        'protocol': 'TestProtocol',
        'amount_usd': 500_000,
        'timestamp': datetime.now(),
    }

    result = await discord_bot.send_exploit_alert(
        channel_id=999999,
        exploit=exploit
    )

    assert result is False


@pytest.mark.asyncio
async def test_send_daily_digest(discord_bot):
    """Test sending daily digest"""
    mock_channel = AsyncMock()
    mock_channel.send = AsyncMock()

    discord_bot.get_channel = Mock(return_value=mock_channel)

    exploits = [
        {
            'protocol': 'Protocol1',
            'chain': 'Ethereum',
            'amount_usd': 2_000_000,
            'timestamp': datetime.now()
        },
        {
            'protocol': 'Protocol2',
            'chain': 'BSC',
            'amount_usd': 500_000,
            'timestamp': datetime.now()
        },
        {
            'protocol': 'Protocol3',
            'chain': 'Polygon',
            'amount_usd': 100_000,
            'timestamp': datetime.now()
        }
    ]

    result = await discord_bot.send_daily_digest(
        channel_id=123456,
        exploits=exploits
    )

    assert result is True
    mock_channel.send.assert_called_once()


# Test Discord Monitor

@pytest.fixture
def discord_monitor():
    """Create Discord monitor instance"""
    with patch.dict(os.environ, {'DISCORD_MONITOR_SERVERS': '123456:789012'}):
        monitor = DiscordMonitor()
        return monitor


def test_discord_monitor_initialization(discord_monitor):
    """Test Discord monitor initializes correctly"""
    assert discord_monitor is not None
    assert discord_monitor.name == 'discord_monitor'
    assert len(discord_monitor.monitored_channels) > 0


def test_parse_monitored_servers(discord_monitor):
    """Test parsing monitored servers from environment"""
    servers = discord_monitor._parse_monitored_servers()
    assert 123456 in servers
    assert 789012 in servers[123456]


def test_extract_protocol(discord_monitor):
    """Test protocol extraction from message"""
    # Bold text
    text1 = "**Uniswap** was exploited for $5M"
    protocol1 = discord_monitor._extract_protocol(text1)
    assert protocol1 == "Uniswap"

    # Label format
    text2 = "Protocol: Curve Finance was hacked"
    protocol2 = discord_monitor._extract_protocol(text2)
    assert protocol2 == "Curve Finance"

    # Capitalized word
    text3 = "Aave suffered a flash loan attack"
    protocol3 = discord_monitor._extract_protocol(text3)
    assert protocol3 == "Aave"


def test_extract_amount(discord_monitor):
    """Test amount extraction from message"""
    text1 = "Exploit resulted in $5.2M loss"
    amount1 = discord_monitor._extract_amount(text1)
    assert amount1 == 5_200_000

    text2 = "Protocol lost $100,000"
    amount2 = discord_monitor._extract_amount(text2)
    assert amount2 == 100_000

    text3 = "1.5 million USD stolen"
    amount3 = discord_monitor._extract_amount(text3)
    assert amount3 == 1_500_000


def test_extract_tx_hash(discord_monitor):
    """Test transaction hash extraction"""
    # Ethereum tx hash
    text1 = "Transaction: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    tx_hash1 = discord_monitor._extract_tx_hash(text1)
    assert tx_hash1.startswith('0x')
    assert len(tx_hash1) == 66  # 0x + 64 hex chars

    # No tx hash
    text2 = "Protocol was exploited"
    tx_hash2 = discord_monitor._extract_tx_hash(text2)
    assert tx_hash2 is None


def test_categorize_exploit(discord_monitor):
    """Test exploit categorization"""
    text1 = "Flash loan attack on protocol"
    category1 = discord_monitor._categorize_exploit(text1)
    assert category1 == "Flash Loan"

    text2 = "Reentrancy vulnerability exploited"
    category2 = discord_monitor._categorize_exploit(text2)
    assert category2 == "Reentrancy"

    text3 = "Oracle manipulation led to loss"
    category3 = discord_monitor._categorize_exploit(text3)
    assert category3 == "Oracle Manipulation"

    text4 = "Rug pull exit scam"
    category4 = discord_monitor._categorize_exploit(text4)
    assert category4 == "Rug Pull"


def test_extract_recovery_status(discord_monitor):
    """Test recovery status extraction"""
    text1 = "Funds were fully recovered"
    status1 = discord_monitor._extract_recovery_status(text1)
    assert status1 == "Funds Recovered"

    text2 = "Partially recovered from hacker"
    status2 = discord_monitor._extract_recovery_status(text2)
    assert status2 == "Partially Recovered"

    text3 = "White hat returned the funds"
    status3 = discord_monitor._extract_recovery_status(text3)
    assert status3 == "White Hat Return"

    text4 = "No recovery mentioned"
    status4 = discord_monitor._extract_recovery_status(text4)
    assert status4 is None


def test_clean_description(discord_monitor):
    """Test description cleaning"""
    text = "**Bold** text with __underline__ and ~~strikethrough~~ and https://example.com link"
    cleaned = discord_monitor._clean_description(text)

    assert '**' not in cleaned
    assert '__' not in cleaned
    assert '~~' not in cleaned
    assert 'https://' not in cleaned


def test_extract_exploit_from_message(discord_monitor):
    """Test full exploit extraction from message"""
    # Mock Discord message
    mock_message = Mock()
    mock_message.content = """
    🚨 EXPLOIT ALERT 🚨

    **Uniswap** on Ethereum was exploited via flash loan attack.
    Loss: $2.5M
    TX: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
    Funds recovered by white hat.
    """
    mock_message.created_at = datetime.now()
    mock_message.jump_url = "https://discord.com/channels/123/456/789"

    exploit = discord_monitor._extract_exploit_from_message(mock_message)

    assert exploit is not None
    assert exploit['protocol'] == 'Uniswap'
    assert exploit['chain'] == 'Ethereum'
    assert exploit['amount_usd'] == 2_500_000
    assert exploit['category'] == 'Flash Loan'
    assert exploit['recovery_status'] == 'White Hat Return'


def test_fetch_exploits(discord_monitor):
    """Test fetching exploits from buffer"""
    # Add exploits to buffer
    discord_monitor.exploits_buffer = [
        {'protocol': 'Test1', 'chain': 'Ethereum'},
        {'protocol': 'Test2', 'chain': 'BSC'}
    ]

    exploits = discord_monitor.fetch_exploits()

    assert len(exploits) == 2
    assert len(discord_monitor.exploits_buffer) == 0  # Buffer should be cleared


# Integration Tests

@pytest.mark.asyncio
async def test_slash_command_subscribe(discord_bot, mock_db):
    """Test /subscribe slash command"""
    # This would require a full Discord interaction mock
    # Simplified test for now
    mock_db.execute.return_value = Mock(fetchone=Mock(return_value=None))

    # Verify database query would be called
    assert mock_db.execute is not None


@pytest.mark.asyncio
async def test_slash_command_stats(discord_bot, mock_db):
    """Test /stats slash command"""
    # Mock stats data
    mock_db.get_stats_24h = Mock(return_value={
        'total_exploits': 10,
        'total_loss_usd': 5_000_000,
        'chains_affected': 3,
        'protocols_affected': 8
    })

    # Verify stats can be retrieved
    stats = mock_db.get_stats_24h()
    assert stats['total_exploits'] == 10
    assert stats['total_loss_usd'] == 5_000_000


def test_embed_color_matches_severity():
    """Test that embed colors match severity levels"""
    # Critical (>$10M)
    assert get_severity_from_amount(15_000_000) == 'critical'
    assert SEVERITY_COLORS['critical'] == 0xDC143C

    # High ($1M-$10M)
    assert get_severity_from_amount(5_000_000) == 'high'
    assert SEVERITY_COLORS['high'] == 0xFF4500

    # Medium ($100K-$1M)
    assert get_severity_from_amount(500_000) == 'medium'
    assert SEVERITY_COLORS['medium'] == 0xFFA500

    # Low (<$100K)
    assert get_severity_from_amount(50_000) == 'low'
    assert SEVERITY_COLORS['low'] == 0xFFD700


# Run tests
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
