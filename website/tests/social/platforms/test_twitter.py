# -*- coding: utf-8 -*-
"""
Test X (Twitter) Platform Poster
Tests for Twitter/X posting functionality with Tweepy mocking
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from social.platforms.x_twitter import XTwitterPoster
from tweepy.errors import TweepyException


class TestXTwitterPoster:
    """Test XTwitterPoster class"""

    @pytest.fixture
    def config(self):
        """Create test configuration"""
        return {
            'enabled': True,
            'api_key': 'test_api_key',
            'api_secret': 'test_api_secret',
            'access_token': 'test_access_token',
            'access_secret': 'test_access_secret',
            'bearer_token': 'test_bearer_token'
        }

    @pytest.fixture
    def poster(self, config):
        """Create XTwitterPoster instance"""
        return XTwitterPoster(config)


class TestInitialization(TestXTwitterPoster):
    """Test poster initialization"""

    def test_initialization(self, poster):
        """Test basic initialization"""
        assert poster.api_key == 'test_api_key'
        assert poster.api_secret == 'test_api_secret'
        assert poster.access_token == 'test_access_token'
        assert poster.access_secret == 'test_access_secret'
        assert poster.bearer_token == 'test_bearer_token'


class TestAuthentication(TestXTwitterPoster):
    """Test Twitter authentication"""

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_authenticate_success(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test successful authentication"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_client_class.return_value = mock_client

        result = poster.authenticate()

        assert result is True
        assert poster.is_authenticated() is True
        assert poster.client == mock_client

    @patch('social.platforms.x_twitter.tweepy.Client')
    def test_authenticate_failure(self, mock_client_class, poster):
        """Test authentication failure"""
        mock_client = Mock()
        mock_client.get_me.side_effect = TweepyException("Auth failed")
        mock_client_class.return_value = mock_client

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False

    @patch('social.platforms.x_twitter.tweepy.Client')
    def test_authenticate_invalid_credentials(self, mock_client_class, poster):
        """Test authentication with invalid credentials"""
        mock_client_class.side_effect = Exception("Invalid credentials")

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False


class TestContentValidation(TestXTwitterPoster):
    """Test content validation"""

    def test_validate_content_valid(self, poster):
        """Test validating valid content"""
        content = "This is valid content"
        assert poster.validate_content(content) is True

    def test_validate_content_long(self, poster):
        """Test validating long content (still valid but warns)"""
        content = "A" * 300  # Exceeds MAX_TWEET_LENGTH
        # Still valid, just needs threading
        assert poster.validate_content(content) is True


class TestPosting(TestXTwitterPoster):
    """Test posting functionality"""

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_success(self, mock_auth, mock_api, mock_client_class, poster):
        """Test successfully posting tweet"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        poster.authenticate()
        result = poster.post("Test tweet")

        assert result['success'] is True
        assert result['tweet_id'] == '12345'
        mock_client.create_tweet.assert_called_once()

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_with_reply(self, mock_auth, mock_api, mock_client_class, poster):
        """Test posting tweet as reply"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        poster.authenticate()
        result = poster.post("Test reply", reply_to='67890')

        call_args = mock_client.create_tweet.call_args
        assert call_args.kwargs['in_reply_to_tweet_id'] == '67890'

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_with_media(self, mock_auth, mock_api, mock_client_class, poster):
        """Test posting tweet with media"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        poster.authenticate()
        result = poster.post("Test tweet", media_ids=['media123'])

        call_args = mock_client.create_tweet.call_args
        assert call_args.kwargs['media_ids'] == ['media123']

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_auto_threading_long_content(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test auto-threading for long content"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_client_class.return_value = mock_client

        long_content = "A" * 300
        poster.authenticate()

        with patch.object(poster, 'post_thread') as mock_post_thread:
            mock_post_thread.return_value = {'success': True}
            result = poster.post(long_content)

            mock_post_thread.assert_called_once()

    @patch('social.platforms.x_twitter.tweepy.Client')
    def test_post_not_authenticated(self, mock_client_class, poster):
        """Test posting without authentication"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        # Don't authenticate first
        result = poster.post("Test tweet")

        # Should auto-authenticate
        assert result['success'] is True

    def test_post_not_authenticated_failure(self, poster):
        """Test posting when authentication fails"""
        with patch.object(poster, 'authenticate', return_value=False):
            result = poster.post("Test tweet")

            assert result['success'] is False


class TestThreadPosting(TestXTwitterPoster):
    """Test thread posting functionality"""

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_thread_success(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test successfully posting thread"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()

        # Mock multiple tweet responses
        tweet_ids = ['12345', '67890', '11111']
        responses = [Mock(data={'id': tid}) for tid in tweet_ids]
        mock_client.create_tweet.side_effect = responses
        mock_client_class.return_value = mock_client

        tweets = ["Tweet 1", "Tweet 2", "Tweet 3"]
        poster.authenticate()
        result = poster.post_thread(tweets)

        assert result['success'] is True
        assert result['tweet_count'] == 3
        assert result['tweet_ids'] == tweet_ids
        assert mock_client.create_tweet.call_count == 3

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_thread_replies_chain(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test that thread tweets reply to previous tweet"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()

        tweet_ids = ['12345', '67890']
        responses = [Mock(data={'id': tid}) for tid in tweet_ids]
        mock_client.create_tweet.side_effect = responses
        mock_client_class.return_value = mock_client

        tweets = ["Tweet 1", "Tweet 2"]
        poster.authenticate()
        result = poster.post_thread(tweets)

        # Check second tweet replies to first
        second_call = mock_client.create_tweet.call_args_list[1]
        assert second_call.kwargs['in_reply_to_tweet_id'] == '12345'

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_thread_truncation(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test that long tweets in thread are truncated"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        long_tweet = "A" * 300
        tweets = [long_tweet]
        poster.authenticate()
        result = poster.post_thread(tweets)

        call_args = mock_client.create_tweet.call_args
        tweet_text = call_args.kwargs['text']
        assert len(tweet_text) == 280

    def test_post_thread_too_long(self, poster):
        """Test error when thread exceeds max tweets"""
        tweets = ["Tweet"] * 30  # Exceeds MAX_THREAD_TWEETS

        with patch.object(poster, 'authenticate', return_value=True):
            result = poster.post_thread(tweets)

            assert result['success'] is False
            assert 'too long' in result['error'].lower()

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_thread_partial_failure(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test thread posting with mid-thread failure"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()

        # First tweet succeeds, second fails
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.side_effect = [
            mock_response,
            TweepyException("Failed")
        ]
        mock_client_class.return_value = mock_client

        tweets = ["Tweet 1", "Tweet 2"]
        poster.authenticate()
        result = poster.post_thread(tweets)

        assert result['success'] is False
        assert result['partial_tweet_ids'] == ['12345']
        assert result['completed'] == 1


class TestTweetSplitting(TestXTwitterPoster):
    """Test splitting long content into tweets"""

    def test_split_into_tweets_short_content(self, poster):
        """Test splitting short content (no split needed)"""
        content = "Short tweet"
        tweets = poster.split_into_tweets(content)

        assert len(tweets) == 1
        assert tweets[0] == "Short tweet"

    def test_split_into_tweets_long_content(self, poster):
        """Test splitting long content"""
        paragraph1 = "A" * 200
        paragraph2 = "B" * 200
        content = f"{paragraph1}\n\n{paragraph2}"

        tweets = poster.split_into_tweets(content)

        assert len(tweets) == 2

    def test_split_into_tweets_adds_indicators(self, poster):
        """Test that thread indicators are added"""
        paragraph1 = "A" * 200
        paragraph2 = "B" * 200
        content = f"{paragraph1}\n\n{paragraph2}"

        tweets = poster.split_into_tweets(content)

        # Should have thread indicators
        assert len(tweets) > 1
        # Check for thread indicator in tweets
        has_indicator = any('🧵' in tweet for tweet in tweets)
        assert has_indicator

    def test_split_into_tweets_respects_length_limit(self, poster):
        """Test that split tweets respect length limit"""
        paragraph = "A" * 250
        content = f"{paragraph}\n\n{paragraph}\n\n{paragraph}"

        tweets = poster.split_into_tweets(content)

        for tweet in tweets:
            assert len(tweet) <= 280


class TestMediaUpload(TestXTwitterPoster):
    """Test media upload functionality"""

    @patch('social.platforms.x_twitter.tweepy.API')
    def test_upload_media_success(self, mock_api_class, poster):
        """Test successfully uploading media"""
        mock_api = Mock()
        mock_media = Mock()
        mock_media.media_id = 'media123'
        mock_api.media_upload.return_value = mock_media
        poster.api = mock_api

        result = poster.upload_media('/path/to/image.jpg')

        assert result == 'media123'
        mock_api.media_upload.assert_called_once_with('/path/to/image.jpg')

    @patch('social.platforms.x_twitter.tweepy.API')
    def test_upload_media_error(self, mock_api_class, poster):
        """Test handling media upload error"""
        mock_api = Mock()
        mock_api.media_upload.side_effect = TweepyException("Upload failed")
        poster.api = mock_api

        result = poster.upload_media('/path/to/image.jpg')

        assert result is None

    def test_upload_media_not_authenticated(self, poster):
        """Test uploading media without authentication"""
        poster.api = None

        result = poster.upload_media('/path/to/image.jpg')

        assert result is None


class TestErrorHandling(TestXTwitterPoster):
    """Test error handling"""

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    def test_post_tweepy_exception(
        self, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test handling Tweepy exception"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_client.create_tweet.side_effect = TweepyException("API Error")
        mock_client_class.return_value = mock_client

        poster.authenticate()
        result = poster.post("Test tweet")

        assert result['success'] is False
        assert 'API Error' in result['error']


class TestRetryLogic(TestXTwitterPoster):
    """Test retry logic inherited from base class"""

    @patch('social.platforms.x_twitter.tweepy.Client')
    @patch('social.platforms.x_twitter.tweepy.API')
    @patch('social.platforms.x_twitter.tweepy.OAuth1UserHandler')
    @patch('social.platforms.x_twitter.time.sleep')
    def test_post_with_retry_success(
        self, mock_sleep, mock_auth, mock_api, mock_client_class, poster
    ):
        """Test successful post with retry logic"""
        mock_client = Mock()
        mock_client.get_me.return_value = Mock()
        mock_response = Mock()
        mock_response.data = {'id': '12345'}
        mock_client.create_tweet.return_value = mock_response
        mock_client_class.return_value = mock_client

        poster.authenticate()
        result = poster.post_with_retry("Test tweet")

        assert result['success'] is True
        mock_sleep.assert_not_called()  # No retry needed

    @patch('social.platforms.x_twitter.time.sleep')
    def test_post_with_retry_rate_limit(self, mock_sleep, poster):
        """Test retry when rate limited"""
        from datetime import datetime
        poster.rate_limit = 1
        poster._post_times = [datetime.utcnow()] * 2  # Exceed rate limit

        result = poster.post_with_retry("Test tweet")

        assert result['success'] is False
        assert 'rate limit' in result['error'].lower()
