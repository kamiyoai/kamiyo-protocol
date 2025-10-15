# -*- coding: utf-8 -*-
"""
Test Discord Platform Poster
Tests for Discord webhook posting functionality
"""

import pytest
from unittest.mock import Mock, patch
from social.platforms.discord import DiscordPoster


class TestDiscordPoster:
    """Test DiscordPoster class"""

    @pytest.fixture
    def config(self):
        """Create test configuration"""
        return {
            'enabled': True,
            'webhooks': {
                'alerts': 'https://discord.com/api/webhooks/123/abc',
                'general': 'https://discord.com/api/webhooks/456/def'
            },
            'username': 'Kamiyo Bot',
            'avatar_url': 'https://kamiyo.ai/logo.png'
        }

    @pytest.fixture
    def poster(self, config):
        """Create DiscordPoster instance"""
        return DiscordPoster(config)


class TestInitialization(TestDiscordPoster):
    """Test poster initialization"""

    def test_initialization(self, poster):
        """Test basic initialization"""
        assert len(poster.webhooks) == 2
        assert 'alerts' in poster.webhooks
        assert poster.username == 'Kamiyo Bot'
        assert poster.avatar_url == 'https://kamiyo.ai/logo.png'

    def test_initialization_default_username(self):
        """Test default username"""
        config = {
            'enabled': True,
            'webhooks': {'test': 'url'}
        }
        poster = DiscordPoster(config)
        assert poster.username == 'Kamiyo Intelligence'

    def test_initialization_default_avatar(self):
        """Test default avatar URL"""
        config = {
            'enabled': True,
            'webhooks': {'test': 'url'}
        }
        poster = DiscordPoster(config)
        assert poster.avatar_url == 'https://kamiyo.ai/logo.png'


class TestAuthentication(TestDiscordPoster):
    """Test authentication (webhooks don't require auth)"""

    def test_authenticate_with_webhooks(self, poster):
        """Test authentication with webhooks configured"""
        assert poster.authenticate() is True

    def test_authenticate_no_webhooks(self):
        """Test authentication without webhooks"""
        config = {
            'enabled': True,
            'webhooks': {}
        }
        poster = DiscordPoster(config)
        assert poster.authenticate() is False

    def test_is_authenticated(self, poster):
        """Test is_authenticated check"""
        assert poster.is_authenticated() is True


class TestContentValidation(TestDiscordPoster):
    """Test content validation"""

    def test_validate_content_valid(self, poster):
        """Test validating valid content"""
        content = "This is valid content"
        assert poster.validate_content(content) is True

    def test_validate_content_too_long(self, poster):
        """Test validating content that's too long"""
        content = "A" * 2500  # Exceeds MAX_CONTENT_LENGTH
        assert poster.validate_content(content) is False

    def test_validate_content_at_limit(self, poster):
        """Test validating content at exact limit"""
        content = "A" * 2000  # Exactly at MAX_CONTENT_LENGTH
        assert poster.validate_content(content) is True


class TestEmbedCreation(TestDiscordPoster):
    """Test Discord embed creation"""

    def test_create_embed_basic(self, poster):
        """Test creating basic embed"""
        embed = poster.create_embed(
            title='Test Title',
            description='Test Description',
            color=0xFF0000
        )

        assert embed['title'] == 'Test Title'
        assert embed['description'] == 'Test Description'
        assert embed['color'] == 0xFF0000

    def test_create_embed_with_fields(self, poster):
        """Test creating embed with fields"""
        fields = [
            {'name': 'Field 1', 'value': 'Value 1', 'inline': True},
            {'name': 'Field 2', 'value': 'Value 2', 'inline': False}
        ]

        embed = poster.create_embed(
            title='Test',
            fields=fields
        )

        assert len(embed['fields']) == 2
        assert embed['fields'][0]['name'] == 'Field 1'
        assert embed['fields'][0]['inline'] is True

    def test_create_embed_with_footer(self, poster):
        """Test creating embed with footer"""
        embed = poster.create_embed(
            title='Test',
            footer='Test Footer'
        )

        assert 'footer' in embed
        assert embed['footer']['text'] == 'Test Footer'

    def test_create_embed_with_timestamp(self, poster):
        """Test creating embed with timestamp"""
        timestamp = '2024-01-15T10:30:00Z'
        embed = poster.create_embed(
            title='Test',
            timestamp=timestamp
        )

        assert embed['timestamp'] == timestamp

    def test_create_embed_with_url(self, poster):
        """Test creating embed with URL"""
        embed = poster.create_embed(
            title='Test',
            url='https://example.com'
        )

        assert embed['url'] == 'https://example.com'

    def test_create_embed_title_truncation(self, poster):
        """Test that long titles are truncated"""
        long_title = "A" * 300
        embed = poster.create_embed(title=long_title)

        assert len(embed['title']) == 256

    def test_create_embed_description_truncation(self, poster):
        """Test that long descriptions are truncated"""
        long_desc = "A" * 5000
        embed = poster.create_embed(description=long_desc)

        assert len(embed['description']) == 4096

    def test_create_embed_max_fields(self, poster):
        """Test that fields are limited to 25"""
        fields = [{'name': f'Field {i}', 'value': f'Value {i}'} for i in range(30)]
        embed = poster.create_embed(title='Test', fields=fields)

        assert len(embed['fields']) == 25


class TestPosting(TestDiscordPoster):
    """Test posting functionality"""

    @patch('social.platforms.discord.requests.post')
    def test_post_success_single_webhook(self, mock_post, poster):
        """Test successfully posting to single webhook"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = poster.post(
            "Test content",
            webhooks={'alerts': poster.webhooks['alerts']}
        )

        assert result['success'] is True
        assert result['post_count'] == 1
        mock_post.assert_called_once()

    @patch('social.platforms.discord.requests.post')
    def test_post_success_multiple_webhooks(self, mock_post, poster):
        """Test successfully posting to multiple webhooks"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = poster.post("Test content")

        assert result['success'] is True
        assert result['post_count'] == 2
        assert mock_post.call_count == 2

    @patch('social.platforms.discord.requests.post')
    def test_post_with_embed(self, mock_post, poster):
        """Test posting with embed"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        embed = poster.create_embed(title='Test', description='Test embed')
        result = poster.post("Test content", embed=embed)

        assert result['success'] is True
        call_args = mock_post.call_args
        assert 'embeds' in call_args.kwargs['json']

    @patch('social.platforms.discord.requests.post')
    def test_post_with_multiple_embeds(self, mock_post, poster):
        """Test posting with multiple embeds"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        embeds = [
            poster.create_embed(title='Embed 1'),
            poster.create_embed(title='Embed 2')
        ]
        result = poster.post("Test content", embeds=embeds)

        assert result['success'] is True
        call_args = mock_post.call_args
        assert len(call_args.kwargs['json']['embeds']) == 2

    @patch('social.platforms.discord.requests.post')
    def test_post_content_truncation(self, mock_post, poster):
        """Test that long content is truncated"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        long_content = "A" * 2500
        result = poster.post(long_content)

        call_args = mock_post.call_args
        content = call_args.kwargs['json']['content']
        assert len(content) == 2000

    @patch('social.platforms.discord.requests.post')
    def test_post_webhook_list(self, mock_post, poster):
        """Test posting with webhook name list"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = poster.post("Test content", webhooks=['alerts'])

        assert result['success'] is True
        assert result['post_count'] == 1

    def test_post_no_webhooks_error(self, poster):
        """Test posting without webhooks"""
        result = poster.post("Test content", webhooks=[])

        assert result['success'] is False
        assert 'no webhooks' in result['error'].lower()


class TestErrorHandling(TestDiscordPoster):
    """Test error handling"""

    @patch('social.platforms.discord.requests.post')
    def test_post_http_error(self, mock_post, poster):
        """Test handling HTTP error"""
        mock_response = Mock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        mock_post.return_value = mock_response

        result = poster.post("Test content")

        assert result['success'] is False
        assert len(result['errors']) > 0

    @patch('social.platforms.discord.requests.post')
    def test_post_request_exception(self, mock_post, poster):
        """Test handling request exception"""
        mock_post.side_effect = Exception("Connection error")

        result = poster.post("Test content")

        assert result['success'] is False
        assert 'Connection error' in result['errors'][0]

    @patch('social.platforms.discord.requests.post')
    def test_post_partial_success(self, mock_post, poster):
        """Test partial success when posting to multiple webhooks"""
        def side_effect(*args, **kwargs):
            mock_response = Mock()
            if 'alerts' in kwargs.get('url', ''):
                mock_response.status_code = 200
            else:
                mock_response.status_code = 400
                mock_response.text = "Error"
            return mock_response

        mock_post.side_effect = side_effect

        result = poster.post("Test content")

        assert result['success'] is True  # At least one succeeded
        assert result['post_count'] == 1


class TestExploitAlert(TestDiscordPoster):
    """Test exploit alert posting"""

    @patch('social.platforms.discord.requests.post')
    def test_post_exploit_alert_critical(self, mock_post, poster):
        """Test posting critical severity exploit alert"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        exploit_data = {
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 15_000_000.0,
            'exploit_type': 'Flash Loan',
            'tx_hash': '0xabc123',
            'recovery_status': 'Unknown',
            'description': 'Test exploit',
            'source_url': 'https://example.com',
            'timestamp': '2024-01-15T10:30:00Z'
        }

        result = poster.post_exploit_alert(exploit_data)

        assert result['success'] is True
        call_args = mock_post.call_args
        payload = call_args.kwargs['json']
        assert 'embeds' in payload
        embed = payload['embeds'][0]
        assert 'Uniswap' in embed['title']
        assert embed['color'] == poster.SEVERITY_COLORS['critical']

    @patch('social.platforms.discord.requests.post')
    def test_post_exploit_alert_high(self, mock_post, poster):
        """Test posting high severity exploit alert"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        exploit_data = {
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 2_500_000.0,
            'exploit_type': 'Flash Loan',
            'tx_hash': '0xabc123',
            'timestamp': '2024-01-15T10:30:00Z'
        }

        result = poster.post_exploit_alert(exploit_data)

        assert result['success'] is True
        call_args = mock_post.call_args
        embed = call_args.kwargs['json']['embeds'][0]
        assert embed['color'] == poster.SEVERITY_COLORS['high']

    @patch('social.platforms.discord.requests.post')
    def test_post_exploit_alert_medium(self, mock_post, poster):
        """Test posting medium severity exploit alert"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        exploit_data = {
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 500_000.0,
            'exploit_type': 'Flash Loan',
            'tx_hash': '0xabc123',
            'timestamp': '2024-01-15T10:30:00Z'
        }

        result = poster.post_exploit_alert(exploit_data)

        call_args = mock_post.call_args
        embed = call_args.kwargs['json']['embeds'][0]
        assert embed['color'] == poster.SEVERITY_COLORS['medium']

    @patch('social.platforms.discord.requests.post')
    def test_post_exploit_alert_low(self, mock_post, poster):
        """Test posting low severity exploit alert"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        exploit_data = {
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 50_000.0,
            'exploit_type': 'Flash Loan',
            'tx_hash': '0xabc123',
            'timestamp': '2024-01-15T10:30:00Z'
        }

        result = poster.post_exploit_alert(exploit_data)

        call_args = mock_post.call_args
        embed = call_args.kwargs['json']['embeds'][0]
        assert embed['color'] == poster.SEVERITY_COLORS['low']

    @patch('social.platforms.discord.requests.post')
    def test_post_exploit_alert_amount_formatting(self, mock_post, poster):
        """Test exploit alert formats large amounts correctly"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        exploit_data = {
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 2_500_000.0,
            'exploit_type': 'Flash Loan',
            'tx_hash': '0xabc123',
            'timestamp': '2024-01-15T10:30:00Z'
        }

        result = poster.post_exploit_alert(exploit_data)

        call_args = mock_post.call_args
        embed = call_args.kwargs['json']['embeds'][0]
        # Find the loss amount field
        loss_field = next(f for f in embed['fields'] if 'Loss Amount' in f['name'])
        assert '$2.50M' in loss_field['value']


class TestRetryLogic(TestDiscordPoster):
    """Test retry logic inherited from base class"""

    @patch('social.platforms.discord.requests.post')
    @patch('social.platforms.discord.time.sleep')
    def test_post_with_retry_success(self, mock_sleep, mock_post, poster):
        """Test successful post with retry logic"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = poster.post_with_retry("Test content")

        assert result['success'] is True
        mock_sleep.assert_not_called()  # No retry needed

    @patch('social.platforms.discord.requests.post')
    @patch('social.platforms.discord.time.sleep')
    def test_post_with_retry_rate_limit(self, mock_sleep, mock_post, poster):
        """Test retry when rate limited"""
        from datetime import datetime
        poster.rate_limit = 1
        poster._post_times = [datetime.utcnow()] * 2  # Exceed rate limit

        result = poster.post_with_retry("Test content")

        assert result['success'] is False
        assert 'rate limit' in result['error'].lower()
