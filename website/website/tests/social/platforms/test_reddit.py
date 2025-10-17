# -*- coding: utf-8 -*-
"""
Test Reddit Platform Poster
Tests for Reddit-specific posting functionality with PRAW mocking
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from social.platforms.reddit import RedditPoster
from praw.exceptions import RedditAPIException


class TestRedditPoster:
    """Test RedditPoster class"""

    @pytest.fixture
    def config(self):
        """Create test configuration"""
        return {
            'enabled': True,
            'client_id': 'test_client',
            'client_secret': 'test_secret',
            'username': 'test_user',
            'password': 'test_pass',
            'subreddits': ['test', 'defi']
        }

    @pytest.fixture
    def poster(self, config):
        """Create RedditPoster instance"""
        return RedditPoster(config)


class TestInitialization(TestRedditPoster):
    """Test poster initialization"""

    def test_initialization(self, poster):
        """Test basic initialization"""
        assert poster.client_id == 'test_client'
        assert poster.client_secret == 'test_secret'
        assert poster.username == 'test_user'
        assert poster.password == 'test_pass'
        assert poster.subreddits == ['test', 'defi']

    def test_initialization_default_user_agent(self, config):
        """Test default user agent"""
        poster = RedditPoster(config)
        assert poster.user_agent == 'Kamiyo Exploit Intelligence Bot'

    def test_initialization_custom_user_agent(self, config):
        """Test custom user agent"""
        config['user_agent'] = 'CustomAgent'
        poster = RedditPoster(config)
        assert poster.user_agent == 'CustomAgent'

    def test_initialization_default_subreddits(self):
        """Test default subreddits"""
        config = {
            'enabled': True,
            'client_id': 'test',
            'client_secret': 'test',
            'username': 'test',
            'password': 'test'
        }
        poster = RedditPoster(config)
        assert poster.subreddits == ['defi', 'CryptoCurrency']


class TestAuthentication(TestRedditPoster):
    """Test Reddit authentication"""

    @patch('social.platforms.reddit.praw.Reddit')
    def test_authenticate_success(self, mock_praw, poster):
        """Test successful authentication"""
        mock_reddit = Mock()
        mock_user = Mock()
        mock_reddit.user.me.return_value = mock_user
        mock_praw.return_value = mock_reddit

        result = poster.authenticate()

        assert result is True
        assert poster.is_authenticated() is True
        assert poster.reddit == mock_reddit

    @patch('social.platforms.reddit.praw.Reddit')
    def test_authenticate_failure(self, mock_praw, poster):
        """Test authentication failure"""
        mock_praw.side_effect = Exception("Auth failed")

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False

    @patch('social.platforms.reddit.praw.Reddit')
    def test_authenticate_invalid_credentials(self, mock_praw, poster):
        """Test authentication with invalid credentials"""
        mock_reddit = Mock()
        mock_reddit.user.me.side_effect = Exception("Invalid credentials")
        mock_praw.return_value = mock_reddit

        result = poster.authenticate()

        assert result is False
        assert poster.is_authenticated() is False


class TestContentValidation(TestRedditPoster):
    """Test content validation"""

    def test_validate_content_valid(self, poster):
        """Test validating valid content"""
        content = "This is valid content"
        assert poster.validate_content(content) is True

    def test_validate_content_too_long(self, poster):
        """Test validating content that's too long"""
        content = "A" * 50000  # Exceeds MAX_BODY_LENGTH
        assert poster.validate_content(content) is False

    def test_validate_content_at_limit(self, poster):
        """Test validating content at exact limit"""
        content = "A" * 40000  # Exactly at MAX_BODY_LENGTH
        assert poster.validate_content(content) is True


class TestPosting(TestRedditPoster):
    """Test posting functionality"""

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_success_single_subreddit(self, mock_praw, poster):
        """Test successfully posting to single subreddit"""
        mock_reddit = Mock()
        mock_subreddit = Mock()
        mock_submission = Mock()
        mock_submission.id = 'abc123'
        mock_submission.permalink = '/r/test/comments/abc123/title'
        mock_subreddit.submit.return_value = mock_submission
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_reddit.user.me.return_value = Mock()
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post(
            "Test content",
            title="Test Title",
            subreddits=['test']
        )

        assert result['success'] is True
        assert result['post_count'] == 1
        assert result['results'][0]['post_id'] == 'abc123'
        mock_subreddit.submit.assert_called_once()

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_success_multiple_subreddits(self, mock_praw, poster):
        """Test successfully posting to multiple subreddits"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()

        def create_subreddit(name):
            mock_subreddit = Mock()
            mock_submission = Mock()
            mock_submission.id = f'{name}_123'
            mock_submission.permalink = f'/r/{name}/comments/123/title'
            mock_subreddit.submit.return_value = mock_submission
            return mock_subreddit

        mock_reddit.subreddit.side_effect = create_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post(
            "Test content",
            title="Test Title",
            subreddits=['test', 'defi']
        )

        assert result['success'] is True
        assert result['post_count'] == 2
        assert len(result['results']) == 2

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_not_authenticated(self, mock_praw, poster):
        """Test posting without authentication"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_submission = Mock()
        mock_submission.id = 'abc123'
        mock_submission.permalink = '/r/test/comments/abc123/title'
        mock_subreddit.submit.return_value = mock_submission
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        # Don't authenticate first
        result = poster.post("Test content", title="Test Title")

        # Should auto-authenticate
        assert result['success'] is True

    def test_post_not_authenticated_failure(self, poster):
        """Test posting when authentication fails"""
        with patch.object(poster, 'authenticate', return_value=False):
            result = poster.post("Test content", title="Test Title")

            assert result['success'] is False
            assert 'not authenticated' in result['error'].lower()

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_with_flair(self, mock_praw, poster):
        """Test posting with flair"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_submission = Mock()
        mock_submission.id = 'abc123'
        mock_submission.permalink = '/r/test/comments/abc123/title'
        mock_subreddit.submit.return_value = mock_submission
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post(
            "Test content",
            title="Test Title",
            flair_id="flair123"
        )

        assert result['success'] is True
        call_args = mock_subreddit.submit.call_args
        assert call_args.kwargs['flair_id'] == 'flair123'

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_title_truncation(self, mock_praw, poster):
        """Test that long titles are truncated"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_submission = Mock()
        mock_submission.id = 'abc123'
        mock_submission.permalink = '/r/test/comments/abc123/title'
        mock_subreddit.submit.return_value = mock_submission
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        long_title = "A" * 350  # Exceeds MAX_TITLE_LENGTH
        poster.authenticate()
        result = poster.post("Test content", title=long_title)

        call_args = mock_subreddit.submit.call_args
        submitted_title = call_args.kwargs['title']
        assert len(submitted_title) == 300  # MAX_TITLE_LENGTH
        assert submitted_title.endswith('...')


class TestErrorHandling(TestRedditPoster):
    """Test error handling"""

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_reddit_api_exception(self, mock_praw, poster):
        """Test handling Reddit API exception"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_subreddit.submit.side_effect = RedditAPIException(
            ['TEST_ERROR', 'Test error message', None]
        )
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post("Test content", title="Test Title")

        assert result['success'] is False
        assert len(result['errors']) > 0
        assert result['results'][0]['success'] is False

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_general_exception(self, mock_praw, poster):
        """Test handling general exception"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_subreddit.submit.side_effect = Exception("Test error")
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post("Test content", title="Test Title")

        assert result['success'] is False
        assert result['results'][0]['success'] is False
        assert 'Test error' in result['results'][0]['error']

    @patch('social.platforms.reddit.praw.Reddit')
    def test_post_partial_success(self, mock_praw, poster):
        """Test partial success when posting to multiple subreddits"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()

        def create_subreddit(name):
            mock_subreddit = Mock()
            if name == 'test':
                # Success
                mock_submission = Mock()
                mock_submission.id = 'abc123'
                mock_submission.permalink = '/r/test/comments/abc123/title'
                mock_subreddit.submit.return_value = mock_submission
            else:
                # Failure
                mock_subreddit.submit.side_effect = Exception("Failed")
            return mock_subreddit

        mock_reddit.subreddit.side_effect = create_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post(
            "Test content",
            title="Test Title",
            subreddits=['test', 'defi']
        )

        assert result['success'] is True  # At least one succeeded
        assert result['post_count'] == 1
        assert result['results'][0]['success'] is True
        assert result['results'][1]['success'] is False


class TestSubredditRules(TestRedditPoster):
    """Test subreddit rules functionality"""

    @patch('social.platforms.reddit.praw.Reddit')
    def test_get_subreddit_rules_success(self, mock_praw, poster):
        """Test getting subreddit rules"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()

        mock_rule1 = Mock()
        mock_rule1.short_name = 'No spam'
        mock_rule2 = Mock()
        mock_rule2.short_name = 'Be civil'

        mock_subreddit.rules = [mock_rule1, mock_rule2]
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        rules = poster.get_subreddit_rules('test')

        assert len(rules) == 2
        assert 'No spam' in rules
        assert 'Be civil' in rules

    @patch('social.platforms.reddit.praw.Reddit')
    def test_get_subreddit_rules_error(self, mock_praw, poster):
        """Test handling error when getting rules"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_subreddit.rules = None
        mock_reddit.subreddit.side_effect = Exception("Error")
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        rules = poster.get_subreddit_rules('test')

        assert rules == []

    def test_get_subreddit_rules_not_authenticated(self, poster):
        """Test getting rules when not authenticated"""
        with patch.object(poster, 'authenticate', return_value=False):
            rules = poster.get_subreddit_rules('test')
            assert rules == []


class TestRetryLogic(TestRedditPoster):
    """Test retry logic inherited from base class"""

    @patch('social.platforms.reddit.praw.Reddit')
    @patch('social.platforms.reddit.time.sleep')
    def test_post_with_retry_success(self, mock_sleep, mock_praw, poster):
        """Test successful post with retry logic"""
        mock_reddit = Mock()
        mock_reddit.user.me.return_value = Mock()
        mock_subreddit = Mock()
        mock_submission = Mock()
        mock_submission.id = 'abc123'
        mock_submission.permalink = '/r/test/comments/abc123/title'
        mock_subreddit.submit.return_value = mock_submission
        mock_reddit.subreddit.return_value = mock_subreddit
        mock_praw.return_value = mock_reddit

        poster.authenticate()
        result = poster.post_with_retry(
            "Test content",
            title="Test Title",
            subreddits=['test']
        )

        assert result['success'] is True
        mock_sleep.assert_not_called()  # No retry needed

    @patch('social.platforms.reddit.praw.Reddit')
    @patch('social.platforms.reddit.time.sleep')
    def test_post_with_retry_rate_limit(self, mock_sleep, mock_praw, poster):
        """Test retry when rate limited"""
        poster.rate_limit = 1
        poster._post_times = [poster._post_times[0]] * 2  # Exceed rate limit

        result = poster.post_with_retry(
            "Test content",
            title="Test Title"
        )

        assert result['success'] is False
        assert 'rate limit' in result['error'].lower()
