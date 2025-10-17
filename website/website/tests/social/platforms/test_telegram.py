# -*- coding: utf-8 -*-
"""
Test Telegram Platform Poster
Tests for Telegram Bot API posting functionality
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from social.platforms.telegram import TelegramPoster
from telegram.error import TelegramError


class TestTelegramPoster:
    """Test TelegramPoster class"""

    @pytest.fixture
    def config(self):
        """Create test configuration"""
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
    def poster(self, config):
        """Create TelegramPoster instance"""
        return TelegramPoster(config)


class TestInitialization(TestTelegramPoster):
    """Test poster initialization"""

    def test_initialization(self, poster):
        """Test basic initialization"""
        assert poster.bot_token == 'test_token:abc123'
        assert len(poster.chat_ids) == 2
        assert 'alerts' in poster.chat_ids
        assert poster.parse_mode == 'HTML'

    def test_initialization_default_parse_mode(self):
        """Test default parse mode"""
        config = {
            'enabled': True,
            'bot_token': 'test_token',
            'chat_ids': {'test': '-123'}
        }
        poster = TelegramPoster(config)
        assert poster.parse_mode == 'HTML'

    def test_initialization_custom_parse_mode(self):
        """Test custom parse mode"""
        config = {
            'enabled': True,
            'bot_token': 'test_token',
            'chat_ids': {'test': '-123'},
            'parse_mode': 'Markdown'
        }
        poster = TelegramPoster(config)
        assert poster.parse_mode == 'Markdown'


class TestAuthentication(TestTelegramPoster):
    """Test Telegram authentication"""

    @patch('social.platforms.telegram.telegram.Bot')
    def test_authenticate_success(self, mock_bot_class, poster):
        """Test successful authentication"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user
        mock_bot_class.return_value = mock_bot

        result = poster.authenticate()

        assert result is True
        assert poster.is_authenticated() is True
        assert poster.bot == mock_bot

    @patch('social.platforms.telegram.telegram.Bot')
    def test_authenticate_failure(self, mock_bot_class, poster):
        """Test authentication failure"""
        mock_bot = Mock()
        mock_bot.get_me.side_effect = TelegramError("Auth failed")
        mock_bot_class.return_value = mock_bot

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False

    @patch('social.platforms.telegram.telegram.Bot')
    def test_authenticate_invalid_token(self, mock_bot_class, poster):
        """Test authentication with invalid token"""
        mock_bot_class.side_effect = Exception("Invalid token")

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False


class TestContentValidation(TestTelegramPoster):
    """Test content validation"""

    def test_validate_content_valid(self, poster):
        """Test validating valid content"""
        content = "This is valid content"
        assert poster.validate_content(content) is True

    def test_validate_content_too_long(self, poster):
        """Test validating content that's too long"""
        content = "A" * 5000  # Exceeds MAX_MESSAGE_LENGTH
        assert poster.validate_content(content) is False

    def test_validate_content_at_limit(self, poster):
        """Test validating content at exact limit"""
        content = "A" * 4096  # Exactly at MAX_MESSAGE_LENGTH
        assert poster.validate_content(content) is True


class TestPosting(TestTelegramPoster):
    """Test posting functionality"""

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_success_single_chat(self, mock_bot_class, poster):
        """Test successfully posting to single chat"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post(
            "Test content",
            chat_ids={'alerts': poster.chat_ids['alerts']}
        )

        assert result['success'] is True
        assert result['post_count'] == 1
        assert result['results'][0]['message_id'] == 12345
        mock_bot.send_message.assert_called_once()

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_success_multiple_chats(self, mock_bot_class, poster):
        """Test successfully posting to multiple chats"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post("Test content")

        assert result['success'] is True
        assert result['post_count'] == 2
        assert mock_bot.send_message.call_count == 2

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_html_parse_mode(self, mock_bot_class, poster):
        """Test posting with HTML parse mode"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post(
            "<b>Bold text</b>",
            parse_mode='HTML'
        )

        call_args = mock_bot.send_message.call_args
        assert call_args.kwargs['parse_mode'] == 'HTML'

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_disable_web_page_preview(self, mock_bot_class, poster):
        """Test posting with web page preview disabled"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post(
            "Test content",
            disable_web_page_preview=True
        )

        call_args = mock_bot.send_message.call_args
        assert call_args.kwargs['disable_web_page_preview'] is True

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_silent_notification(self, mock_bot_class, poster):
        """Test posting with silent notification"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post(
            "Test content",
            disable_notification=True
        )

        call_args = mock_bot.send_message.call_args
        assert call_args.kwargs['disable_notification'] is True

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_content_truncation(self, mock_bot_class, poster):
        """Test that long content is truncated"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        long_content = "A" * 5000
        poster.authenticate()
        result = poster.post(long_content)

        call_args = mock_bot.send_message.call_args
        content = call_args.kwargs['text']
        assert len(content) == 4096

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_chat_list(self, mock_bot_class, poster):
        """Test posting with chat name list"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post("Test content", chat_ids=['alerts'])

        assert result['success'] is True
        assert result['post_count'] == 1

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_not_authenticated(self, mock_bot_class, poster):
        """Test posting without authentication"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        # Don't authenticate first
        result = poster.post("Test content")

        # Should auto-authenticate
        assert result['success'] is True

    def test_post_not_authenticated_failure(self, poster):
        """Test posting when authentication fails"""
        with patch.object(poster, 'authenticate', return_value=False):
            result = poster.post("Test content")

            assert result['success'] is False
            assert 'not authenticated' in result['error'].lower()

    def test_post_no_chat_ids_error(self, poster):
        """Test posting without chat IDs"""
        result = poster.post("Test content", chat_ids={})

        assert result['success'] is False
        assert 'no chat ids' in result['error'].lower()


class TestImagePosting(TestTelegramPoster):
    """Test posting with images"""

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_image_success(self, mock_bot_class, poster):
        """Test successfully posting with image"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_photo.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post_with_image(
            "Test caption",
            "https://example.com/image.jpg"
        )

        assert result['success'] is True
        mock_bot.send_photo.assert_called()

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_image_caption_truncation(self, mock_bot_class, poster):
        """Test that long captions are truncated"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_photo.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        long_caption = "A" * 2000
        poster.authenticate()
        result = poster.post_with_image(long_caption, "https://example.com/image.jpg")

        call_args = mock_bot.send_photo.call_args
        caption = call_args.kwargs['caption']
        assert len(caption) == 1024  # Caption max 1024 chars

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_image_not_authenticated(self, mock_bot_class, poster):
        """Test posting image without authentication"""
        with patch.object(poster, 'authenticate', return_value=False):
            result = poster.post_with_image(
                "Test caption",
                "https://example.com/image.jpg"
            )

            assert result['success'] is False

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_image_no_chat_ids(self, mock_bot_class, poster):
        """Test posting image without chat IDs"""
        result = poster.post_with_image(
            "Test caption",
            "https://example.com/image.jpg",
            chat_ids={}
        )

        assert result['success'] is False


class TestErrorHandling(TestTelegramPoster):
    """Test error handling"""

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_telegram_error(self, mock_bot_class, poster):
        """Test handling Telegram API error"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user
        mock_bot.send_message.side_effect = TelegramError("API Error")

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post("Test content")

        assert result['success'] is False
        assert len(result['errors']) > 0

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_partial_success(self, mock_bot_class, poster):
        """Test partial success when posting to multiple chats"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        def send_message_side_effect(*args, **kwargs):
            chat_id = kwargs.get('chat_id')
            if chat_id == poster.chat_ids['alerts']:
                mock_message = Mock()
                mock_message.message_id = 12345
                return mock_message
            else:
                raise TelegramError("Failed")

        mock_bot.send_message.side_effect = send_message_side_effect
        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post("Test content")

        assert result['success'] is True  # At least one succeeded
        assert result['post_count'] == 1
        assert result['results'][0]['success'] is True
        assert result['results'][1]['success'] is False

    @patch('social.platforms.telegram.telegram.Bot')
    def test_post_with_image_telegram_error(self, mock_bot_class, poster):
        """Test handling error when posting image"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user
        mock_bot.send_photo.side_effect = TelegramError("Image upload failed")

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post_with_image(
            "Test caption",
            "https://example.com/image.jpg"
        )

        assert result['success'] is False


class TestRetryLogic(TestTelegramPoster):
    """Test retry logic inherited from base class"""

    @patch('social.platforms.telegram.telegram.Bot')
    @patch('social.platforms.telegram.time.sleep')
    def test_post_with_retry_success(self, mock_sleep, mock_bot_class, poster):
        """Test successful post with retry logic"""
        mock_bot = Mock()
        mock_user = Mock()
        mock_user.username = 'test_bot'
        mock_bot.get_me.return_value = mock_user

        mock_message = Mock()
        mock_message.message_id = 12345
        mock_bot.send_message.return_value = mock_message

        mock_bot_class.return_value = mock_bot

        poster.authenticate()
        result = poster.post_with_retry("Test content")

        assert result['success'] is True
        mock_sleep.assert_not_called()  # No retry needed

    @patch('social.platforms.telegram.telegram.Bot')
    @patch('social.platforms.telegram.time.sleep')
    def test_post_with_retry_rate_limit(self, mock_sleep, mock_bot_class, poster):
        """Test retry when rate limited"""
        from datetime import datetime
        poster.rate_limit = 1
        poster._post_times = [datetime.utcnow()] * 2  # Exceed rate limit

        result = poster.post_with_retry("Test content")

        assert result['success'] is False
        assert 'rate limit' in result['error'].lower()
