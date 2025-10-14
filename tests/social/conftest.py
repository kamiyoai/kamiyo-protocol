# -*- coding: utf-8 -*-
"""
Shared Test Fixtures
Pytest fixtures shared across all social media module tests
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, MagicMock
from social.models import ExploitData, SocialPost, Platform, PostStatus, PostPriority


@pytest.fixture
def exploit_data_factory():
    """Factory for creating ExploitData instances with customizable parameters"""
    def _create_exploit(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Test Protocol",
        chain="Ethereum",
        loss_amount_usd=1_000_000.0,
        exploit_type="Flash Loan",
        timestamp=None,
        description="Test exploit description",
        recovery_status="Unknown",
        source="Test Source",
        source_url="https://test.com"
    ):
        return ExploitData(
            tx_hash=tx_hash,
            protocol=protocol,
            chain=chain,
            loss_amount_usd=loss_amount_usd,
            exploit_type=exploit_type,
            timestamp=timestamp or datetime.utcnow(),
            description=description,
            recovery_status=recovery_status,
            source=source,
            source_url=source_url
        )
    return _create_exploit


@pytest.fixture
def sample_exploit(exploit_data_factory):
    """Standard exploit data for basic tests"""
    return exploit_data_factory()


@pytest.fixture
def critical_exploit(exploit_data_factory):
    """Critical severity exploit (>= $10M)"""
    return exploit_data_factory(
        protocol="Critical Protocol",
        loss_amount_usd=15_000_000.0
    )


@pytest.fixture
def high_exploit(exploit_data_factory):
    """High severity exploit ($1M - $10M)"""
    return exploit_data_factory(
        protocol="High Protocol",
        loss_amount_usd=5_000_000.0
    )


@pytest.fixture
def medium_exploit(exploit_data_factory):
    """Medium severity exploit ($100K - $1M)"""
    return exploit_data_factory(
        protocol="Medium Protocol",
        loss_amount_usd=500_000.0
    )


@pytest.fixture
def low_exploit(exploit_data_factory):
    """Low severity exploit (< $100K)"""
    return exploit_data_factory(
        protocol="Low Protocol",
        loss_amount_usd=50_000.0
    )


@pytest.fixture
def social_post_factory(exploit_data_factory):
    """Factory for creating SocialPost instances"""
    def _create_post(
        exploit=None,
        platforms=None,
        status=PostStatus.DRAFT,
        with_content=False
    ):
        if exploit is None:
            exploit = exploit_data_factory()

        post = SocialPost(exploit_data=exploit)
        post.status = status

        if platforms:
            post.platforms = platforms
            if with_content:
                for platform in platforms:
                    post.content[platform] = f"Test content for {platform.value}"

        return post
    return _create_post


@pytest.fixture
def sample_social_post(social_post_factory):
    """Standard social post for basic tests"""
    return social_post_factory(
        platforms=[Platform.X_TWITTER, Platform.DISCORD],
        with_content=True
    )


@pytest.fixture
def approved_post(social_post_factory):
    """Pre-approved social post ready for posting"""
    post = social_post_factory(
        platforms=[Platform.DISCORD],
        with_content=True
    )
    post.mark_reviewed(approved=True)
    return post


@pytest.fixture
def api_exploit_response():
    """Mock API response for exploit data"""
    return {
        'tx_hash': '0xabc123def456',
        'protocol': 'Uniswap V3',
        'chain': 'Ethereum',
        'loss_amount_usd': 2_500_000.0,
        'exploit_type': 'Flash Loan',
        'timestamp': '2024-01-15T10:30:00Z',
        'description': 'Flash loan attack on price oracle',
        'recovery_status': 'Partial - 60% recovered',
        'source': 'Rekt News',
        'source_url': 'https://rekt.news/test-exploit'
    }


@pytest.fixture
def api_exploit_list_response(api_exploit_response):
    """Mock API response for list of exploits"""
    return {
        'data': [
            api_exploit_response,
            {
                **api_exploit_response,
                'tx_hash': '0xdifferent',
                'protocol': 'Aave',
                'loss_amount_usd': 500_000.0
            }
        ],
        'page': 1,
        'page_size': 100,
        'total': 2
    }


@pytest.fixture
def mock_reddit_config():
    """Mock configuration for Reddit"""
    return {
        'enabled': True,
        'client_id': 'test_client_id',
        'client_secret': 'test_client_secret',
        'username': 'test_username',
        'password': 'test_password',
        'user_agent': 'Test Bot',
        'subreddits': ['test', 'defi']
    }


@pytest.fixture
def mock_discord_config():
    """Mock configuration for Discord"""
    return {
        'enabled': True,
        'webhooks': {
            'alerts': 'https://discord.com/api/webhooks/123/abc',
            'general': 'https://discord.com/api/webhooks/456/def'
        },
        'username': 'Test Bot',
        'avatar_url': 'https://test.com/avatar.png'
    }


@pytest.fixture
def mock_telegram_config():
    """Mock configuration for Telegram"""
    return {
        'enabled': True,
        'bot_token': 'test_token:abc123',
        'chat_ids': {
            'alerts': '-1001234567890',
            'general': '-1009876543210'
        },
        'parse_mode': 'HTML'
    }


@pytest.fixture
def mock_twitter_config():
    """Mock configuration for Twitter/X"""
    return {
        'enabled': True,
        'api_key': 'test_api_key',
        'api_secret': 'test_api_secret',
        'access_token': 'test_access_token',
        'access_secret': 'test_access_secret',
        'bearer_token': 'test_bearer_token'
    }


@pytest.fixture
def mock_all_platforms_config(
    mock_reddit_config,
    mock_discord_config,
    mock_telegram_config,
    mock_twitter_config
):
    """Mock configuration for all platforms"""
    return {
        'reddit': mock_reddit_config,
        'discord': mock_discord_config,
        'telegram': mock_telegram_config,
        'x_twitter': mock_twitter_config
    }


@pytest.fixture
def mock_successful_post_result():
    """Mock successful posting result"""
    return {
        'success': True,
        'post_id': 'test123',
        'url': 'https://example.com/post/test123'
    }


@pytest.fixture
def mock_failed_post_result():
    """Mock failed posting result"""
    return {
        'success': False,
        'error': 'Test error message'
    }


@pytest.fixture
def mock_http_response():
    """Factory for creating mock HTTP responses"""
    def _create_response(status_code=200, json_data=None, text=''):
        response = Mock()
        response.status_code = status_code
        response.text = text
        if json_data:
            response.json.return_value = json_data
        response.raise_for_status = Mock()
        return response
    return _create_response


@pytest.fixture
def mock_websocket_message():
    """Factory for creating mock WebSocket messages"""
    def _create_message(message_type='new_exploit', exploit_data=None):
        import json
        return json.dumps({
            'type': message_type,
            'exploit': exploit_data or {
                'tx_hash': '0xabc123',
                'protocol': 'Test',
                'chain': 'Ethereum',
                'loss_amount_usd': 1_000_000.0,
                'exploit_type': 'Flash Loan',
                'timestamp': '2024-01-15T10:30:00Z'
            }
        })
    return _create_message


@pytest.fixture
def freeze_time():
    """Fixture to freeze time for consistent datetime testing"""
    frozen_time = datetime(2024, 1, 15, 10, 30, 0)
    with pytest.MonkeyPatch.context() as mp:
        class FrozenDatetime:
            @classmethod
            def utcnow(cls):
                return frozen_time

            @classmethod
            def now(cls, tz=None):
                return frozen_time

        mp.setattr('datetime.datetime', FrozenDatetime)
        yield frozen_time


@pytest.fixture
def mock_rate_limiter():
    """Mock rate limiter for testing rate limit logic"""
    class MockRateLimiter:
        def __init__(self, limit=10):
            self.limit = limit
            self.count = 0
            self.reset_time = datetime.utcnow() + timedelta(hours=1)

        def can_post(self):
            if datetime.utcnow() >= self.reset_time:
                self.count = 0
                self.reset_time = datetime.utcnow() + timedelta(hours=1)
            return self.count < self.limit

        def record_post(self):
            self.count += 1

    return MockRateLimiter


@pytest.fixture
def mock_file_system(tmp_path):
    """Mock file system for testing file operations"""
    return {
        'temp_dir': tmp_path,
        'upload_dir': tmp_path / 'uploads',
        'cache_dir': tmp_path / 'cache'
    }


@pytest.fixture(autouse=True)
def reset_environment_variables(monkeypatch):
    """Reset environment variables before each test"""
    # Clear social media related env vars
    env_vars_to_clear = [
        'SOCIAL_MIN_AMOUNT_USD',
        'SOCIAL_ENABLED_CHAINS',
        'REDDIT_ENABLED',
        'DISCORD_SOCIAL_ENABLED',
        'TELEGRAM_SOCIAL_ENABLED',
        'X_TWITTER_ENABLED'
    ]
    for var in env_vars_to_clear:
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def capture_logs(caplog):
    """Fixture to capture and access log messages"""
    import logging
    caplog.set_level(logging.INFO)
    return caplog


# Markers for categorizing tests
def pytest_configure(config):
    """Configure custom pytest markers"""
    config.addinivalue_line(
        "markers", "unit: Unit tests for individual components"
    )
    config.addinivalue_line(
        "markers", "integration: Integration tests across components"
    )
    config.addinivalue_line(
        "markers", "slow: Tests that take significant time to run"
    )
    config.addinivalue_line(
        "markers", "network: Tests that require network access"
    )
    config.addinivalue_line(
        "markers", "asyncio: Tests using async/await"
    )
