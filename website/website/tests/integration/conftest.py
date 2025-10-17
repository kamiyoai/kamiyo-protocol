# -*- coding: utf-8 -*-
"""
Integration Test Fixtures
Shared fixtures for integration testing the autonomous growth pipeline
"""

import pytest
from datetime import datetime
from unittest.mock import Mock, MagicMock, AsyncMock, patch
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.models import ExploitData, SocialPost, Platform, PostStatus
from social.analysis.data_models import (
    ExploitReport,
    TimelineEvent,
    ImpactSummary,
    ReportFormat,
    HistoricalContext
)


@pytest.fixture
def sample_exploit():
    """Create sample exploit data for integration tests"""
    return ExploitData(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Uniswap V3",
        chain="Ethereum",
        loss_amount_usd=2_500_000.0,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow(),
        description="Flash loan attack exploited price oracle manipulation",
        recovery_status="Partial - 60% recovered",
        source="Rekt News",
        source_url="https://rekt.news/test-exploit"
    )


@pytest.fixture
def critical_exploit():
    """Create critical severity exploit"""
    return ExploitData(
        tx_hash="0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        protocol="Aave V2",
        chain="Ethereum",
        loss_amount_usd=15_000_000.0,
        exploit_type="Reentrancy",
        timestamp=datetime.utcnow(),
        description="Critical reentrancy vulnerability exploited",
        recovery_status="No recovery",
        source="BlockSec",
        source_url="https://blocksec.com/test"
    )


@pytest.fixture
def mock_social_config():
    """Mock configuration for all social platforms"""
    return {
        'reddit': {
            'enabled': True,
            'client_id': 'test_reddit_id',
            'client_secret': 'test_reddit_secret',
            'username': 'test_user',
            'password': 'test_pass',
            'subreddits': ['defi', 'cryptocurrency']
        },
        'discord': {
            'enabled': True,
            'webhooks': {
                'alerts': 'https://discord.com/api/webhooks/test/alert',
                'general': 'https://discord.com/api/webhooks/test/general'
            }
        },
        'telegram': {
            'enabled': True,
            'bot_token': 'test:token',
            'chat_ids': {
                'alerts': '-1001234567890',
                'general': '-1009876543210'
            }
        },
        'x_twitter': {
            'enabled': True,
            'api_key': 'test_api_key',
            'api_secret': 'test_api_secret',
            'access_token': 'test_access_token',
            'access_secret': 'test_access_secret',
            'bearer_token': 'test_bearer_token'
        }
    }


@pytest.fixture
def mock_kamiyo_api():
    """Mock Kamiyo API responses"""
    class MockKamiyoAPI:
        def __init__(self):
            self.exploits = []
            self.call_count = 0

        def add_exploit(self, exploit_dict):
            self.exploits.append(exploit_dict)

        def get_exploits(self):
            self.call_count += 1
            return {
                'data': self.exploits,
                'page': 1,
                'page_size': 100,
                'total': len(self.exploits)
            }

    return MockKamiyoAPI()


@pytest.fixture
def mock_exploit_api_response():
    """Mock exploit API response from Kamiyo"""
    return {
        'tx_hash': '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'protocol': 'Uniswap V3',
        'chain': 'Ethereum',
        'loss_amount_usd': 2_500_000.0,
        'exploit_type': 'Flash Loan',
        'timestamp': '2024-01-15T10:30:00Z',
        'description': 'Flash loan attack exploited price oracle manipulation',
        'recovery_status': 'Partial - 60% recovered',
        'source': 'Rekt News',
        'source_url': 'https://rekt.news/test-exploit'
    }


@pytest.fixture
def mock_report():
    """Mock exploit analysis report"""
    impact = ImpactSummary(
        loss_amount_usd=2_500_000.0,
        affected_protocols=["Uniswap V3"],
        affected_chains=["Ethereum"],
        recovery_status="Partial - 60% recovered"
    )

    return ExploitReport(
        report_id="test-report-123",
        exploit_tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Uniswap V3",
        chain="Ethereum",
        exploit_type="Flash Loan",
        executive_summary="Uniswap V3 on Ethereum suffered a Flash Loan attack resulting in $2,500,000 in losses.",
        timeline=[
            TimelineEvent(
                timestamp=datetime.utcnow(),
                event_type="occurred",
                description="Flash Loan attack executed on Uniswap V3",
                source="Blockchain"
            )
        ],
        impact=impact,
        engagement_hooks=[
            "This is a HIGH severity exploit ($1M - $10M)",
            "Flash loan attacks require no upfront capital"
        ],
        format=ReportFormat.MEDIUM
    )


@pytest.fixture
def mock_reddit_poster():
    """Mock Reddit poster with successful responses"""
    poster = Mock()
    poster.post_with_retry = Mock(return_value={
        'success': True,
        'post_id': 'test_reddit_123',
        'url': 'https://reddit.com/r/defi/test_reddit_123'
    })
    poster.get_status = Mock(return_value={'authenticated': True, 'ready': True})
    return poster


@pytest.fixture
def mock_discord_poster():
    """Mock Discord poster with successful responses"""
    poster = Mock()
    poster.post_exploit_alert = Mock(return_value={
        'success': True,
        'message_id': 'test_discord_456',
        'url': 'https://discord.com/channels/test/test_discord_456'
    })
    poster.get_status = Mock(return_value={'authenticated': True, 'ready': True})
    return poster


@pytest.fixture
def mock_telegram_poster():
    """Mock Telegram poster with successful responses"""
    poster = Mock()
    poster.post_with_retry = Mock(return_value={
        'success': True,
        'message_id': 'test_telegram_789',
        'chat_id': '-1001234567890'
    })
    poster.get_status = Mock(return_value={'authenticated': True, 'ready': True})
    return poster


@pytest.fixture
def mock_twitter_poster():
    """Mock Twitter/X poster with successful responses"""
    poster = Mock()
    poster.post_with_retry = Mock(return_value={
        'success': True,
        'tweet_id': 'test_twitter_101112',
        'url': 'https://twitter.com/test/status/test_twitter_101112'
    })
    poster.post_thread = Mock(return_value={
        'success': True,
        'tweet_ids': ['test_twitter_101112', 'test_twitter_101113'],
        'thread_url': 'https://twitter.com/test/status/test_twitter_101112'
    })
    poster.split_into_tweets = Mock(return_value=["Tweet 1", "Tweet 2", "Tweet 3"])
    poster.get_status = Mock(return_value={'authenticated': True, 'ready': True})
    return poster


@pytest.fixture
def mock_all_posters(mock_reddit_poster, mock_discord_poster, mock_telegram_poster, mock_twitter_poster):
    """Return all mocked platform posters"""
    return {
        Platform.REDDIT: mock_reddit_poster,
        Platform.DISCORD: mock_discord_poster,
        Platform.TELEGRAM: mock_telegram_poster,
        Platform.X_TWITTER: mock_twitter_poster
    }


@pytest.fixture
def mock_all_platforms_config():
    """Mock configuration for all platforms (alias for mock_social_config)"""
    return {
        'reddit': {
            'enabled': True,
            'client_id': 'test_reddit_id',
            'client_secret': 'test_reddit_secret',
            'username': 'test_user',
            'password': 'test_pass',
            'subreddits': ['defi', 'cryptocurrency']
        },
        'discord': {
            'enabled': True,
            'webhooks': {
                'alerts': 'https://discord.com/api/webhooks/test/alert',
                'general': 'https://discord.com/api/webhooks/test/general'
            }
        },
        'telegram': {
            'enabled': True,
            'bot_token': 'test:token',
            'chat_ids': {
                'alerts': '-1001234567890',
                'general': '-1009876543210'
            }
        },
        'x_twitter': {
            'enabled': True,
            'api_key': 'test_api_key',
            'api_secret': 'test_api_secret',
            'access_token': 'test_access_token',
            'access_secret': 'test_access_secret',
            'bearer_token': 'test_bearer_token'
        }
    }


@pytest.fixture
def exploit_data_factory():
    """Factory for creating ExploitData with custom parameters"""
    def _factory(**kwargs):
        from datetime import datetime
        defaults = {
            'tx_hash': '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            'protocol': 'Test Protocol',
            'chain': 'Ethereum',
            'loss_amount_usd': 1_000_000.0,
            'exploit_type': 'Flash Loan',
            'timestamp': datetime.utcnow(),
            'description': 'Test exploit',
            'recovery_status': 'Unknown',
            'source': 'Test',
            'source_url': 'https://test.com'
        }
        defaults.update(kwargs)
        return ExploitData(**defaults)
    return _factory


@pytest.fixture
def mock_metrics():
    """Mock Prometheus metrics"""
    with patch('social.monitoring.metrics.track_post') as track_post, \
         patch('social.monitoring.metrics.track_api_error') as track_api_error, \
         patch('social.monitoring.metrics.track_retry') as track_retry, \
         patch('social.monitoring.metrics.record_generation_duration') as record_generation, \
         patch('social.monitoring.metrics.record_api_duration') as record_api:

        yield {
            'track_post': track_post,
            'track_api_error': track_api_error,
            'track_retry': track_retry,
            'record_generation_duration': record_generation,
            'record_api_duration': record_api
        }


@pytest.fixture
def mock_alert_manager():
    """Mock alert manager"""
    manager = Mock()
    manager.send_alert = Mock(return_value={'slack': True, 'discord': True})
    return manager


@pytest.fixture
def mock_requests():
    """Mock requests library for API calls"""
    with patch('requests.get') as mock_get, \
         patch('requests.post') as mock_post:

        # Configure default successful responses
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json = Mock(return_value={'data': []})
        mock_response.raise_for_status = Mock()

        mock_get.return_value = mock_response
        mock_post.return_value = mock_response

        yield {
            'get': mock_get,
            'post': mock_post,
            'response': mock_response
        }


@pytest.fixture
def mock_websocket():
    """Mock websocket for real-time testing"""
    async def mock_connect(url):
        mock_ws = AsyncMock()
        mock_ws.__aiter__ = Mock(return_value=iter([]))
        return mock_ws

    with patch('websockets.connect', side_effect=mock_connect):
        yield


@pytest.fixture
def integration_test_env(monkeypatch):
    """Set up environment variables for integration tests"""
    env_vars = {
        'KAMIYO_API_URL': 'https://test-api.kamiyo.ai',
        'KAMIYO_API_KEY': 'test-api-key',
        'SOCIAL_MIN_AMOUNT_USD': '100000',
        'SOCIAL_ENABLED_CHAINS': 'Ethereum,BSC,Polygon',
        'WATCHER_MODE': 'poll',
        'POLL_INTERVAL_SECONDS': '5',
    }

    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)

    return env_vars


@pytest.fixture
def capture_logs(caplog):
    """Capture log output for verification"""
    import logging
    caplog.set_level(logging.INFO)
    return caplog


@pytest.fixture(autouse=True)
def reset_test_state():
    """Reset any global state before each test"""
    # Clear any cached instances
    yield
    # Cleanup after test
