# -*- coding: utf-8 -*-
"""
Test Social Media Poster
Tests for orchestration, review workflow, and posting logic
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, call
from datetime import datetime
from social.models import ExploitData, SocialPost, Platform, PostStatus
from social.poster import SocialMediaPoster


class TestSocialMediaPoster:
    """Test SocialMediaPoster class"""

    @pytest.fixture
    def mock_config(self):
        """Create mock configuration"""
        return {
            'reddit': {
                'enabled': True,
                'client_id': 'test_client',
                'client_secret': 'test_secret',
                'username': 'test_user',
                'password': 'test_pass',
                'subreddits': ['test']
            },
            'discord': {
                'enabled': True,
                'webhooks': {
                    'test': 'https://discord.com/api/webhooks/test'
                }
            },
            'telegram': {
                'enabled': True,
                'bot_token': 'test_token',
                'chat_ids': {
                    'test': '-123456'
                }
            },
            'x_twitter': {
                'enabled': True,
                'api_key': 'test_key',
                'api_secret': 'test_secret',
                'access_token': 'test_token',
                'access_secret': 'test_access_secret',
                'bearer_token': 'test_bearer'
            }
        }

    @pytest.fixture
    def sample_exploit(self):
        """Create sample exploit data"""
        return ExploitData(
            tx_hash="0x123abc",
            protocol="Uniswap",
            chain="Ethereum",
            loss_amount_usd=2_500_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow(),
            description="Test exploit",
            recovery_status="Unknown"
        )


class TestInitialization(TestSocialMediaPoster):
    """Test poster initialization"""

    @patch('social.poster.RedditPoster')
    @patch('social.poster.DiscordPoster')
    @patch('social.poster.TelegramPoster')
    @patch('social.poster.XTwitterPoster')
    def test_initialization_all_platforms(
        self, mock_twitter, mock_telegram, mock_discord, mock_reddit, mock_config
    ):
        """Test initializing poster with all platforms enabled"""
        poster = SocialMediaPoster(mock_config)

        assert len(poster.platforms) == 4
        assert Platform.REDDIT in poster.platforms
        assert Platform.DISCORD in poster.platforms
        assert Platform.TELEGRAM in poster.platforms
        assert Platform.X_TWITTER in poster.platforms

    @patch('social.poster.DiscordPoster')
    def test_initialization_single_platform(self, mock_discord):
        """Test initializing poster with single platform"""
        config = {
            'discord': {
                'enabled': True,
                'webhooks': {'test': 'url'}
            }
        }

        poster = SocialMediaPoster(config)

        assert len(poster.platforms) == 1
        assert Platform.DISCORD in poster.platforms

    def test_initialization_no_platforms(self):
        """Test initializing poster with no platforms enabled"""
        config = {
            'reddit': {'enabled': False},
            'discord': {'enabled': False}
        }

        poster = SocialMediaPoster(config)

        assert len(poster.platforms) == 0


class TestPostCreation(TestSocialMediaPoster):
    """Test post creation"""

    @patch('social.poster.RedditPoster')
    @patch('social.poster.DiscordPoster')
    def test_create_post_from_exploit(
        self, mock_discord, mock_reddit, mock_config, sample_exploit
    ):
        """Test creating post from exploit data"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(
            sample_exploit,
            [Platform.REDDIT, Platform.DISCORD]
        )

        assert isinstance(post, SocialPost)
        assert post.exploit_data == sample_exploit
        assert len(post.platforms) == 2
        assert len(post.content) == 2

    @patch('social.poster.DiscordPoster')
    def test_create_post_default_platforms(
        self, mock_discord, sample_exploit
    ):
        """Test creating post with default platforms (all enabled)"""
        config = {'discord': {'enabled': True, 'webhooks': {'test': 'url'}}}
        poster = SocialMediaPoster(config)
        post = poster.create_post_from_exploit(sample_exploit)

        # Should use all enabled platforms
        assert Platform.DISCORD in post.platforms


class TestReviewWorkflow(TestSocialMediaPoster):
    """Test post review workflow"""

    @patch('social.poster.DiscordPoster')
    def test_review_post_approved(self, mock_discord, mock_config, sample_exploit):
        """Test approving a post"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])

        def approve_callback(p):
            return True

        approved = poster.review_post(post, approve_callback)

        assert approved is True
        assert post.status == PostStatus.APPROVED
        assert post.reviewed_at is not None

    @patch('social.poster.DiscordPoster')
    def test_review_post_rejected(self, mock_discord, mock_config, sample_exploit):
        """Test rejecting a post"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])

        def reject_callback(p):
            return False

        approved = poster.review_post(post, reject_callback)

        assert approved is False
        assert post.status == PostStatus.REJECTED
        assert post.reviewed_at is not None

    @patch('social.poster.DiscordPoster')
    def test_review_post_auto_approve(self, mock_discord, mock_config, sample_exploit):
        """Test auto-approval when no callback provided"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])

        approved = poster.review_post(post)

        assert approved is True
        assert post.status == PostStatus.APPROVED


class TestPosting(TestSocialMediaPoster):
    """Test posting to platforms"""

    @patch('social.poster.DiscordPoster')
    def test_post_not_approved_error(self, mock_discord, mock_config, sample_exploit):
        """Test posting unapproved post returns error"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])

        # Don't approve the post
        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert 'not approved' in result['error'].lower()

    @patch('social.poster.DiscordPoster')
    def test_post_to_single_platform_success(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test successfully posting to single platform"""
        # Mock poster instance
        mock_poster = Mock()
        mock_poster.post_exploit_alert.return_value = {
            'success': True,
            'post_id': 'test123'
        }
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is True
        assert post.status == PostStatus.POSTED
        assert post.posted_at is not None
        mock_poster.post_exploit_alert.assert_called_once()

    @patch('social.poster.RedditPoster')
    @patch('social.poster.DiscordPoster')
    def test_post_to_multiple_platforms_all_success(
        self, mock_discord_class, mock_reddit_class, mock_config, sample_exploit
    ):
        """Test successfully posting to multiple platforms"""
        # Mock Reddit poster
        mock_reddit = Mock()
        mock_reddit.post_with_retry.return_value = {
            'success': True,
            'post_id': 'reddit123'
        }
        mock_reddit_class.return_value = mock_reddit

        # Mock Discord poster
        mock_discord = Mock()
        mock_discord.post_exploit_alert.return_value = {
            'success': True,
            'post_id': 'discord123'
        }
        mock_discord_class.return_value = mock_discord

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(
            sample_exploit, [Platform.REDDIT, Platform.DISCORD]
        )
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is True
        assert result['results']['reddit']['success'] is True
        assert result['results']['discord']['success'] is True
        assert post.status == PostStatus.POSTED

    @patch('social.poster.RedditPoster')
    @patch('social.poster.DiscordPoster')
    def test_post_partial_failure(
        self, mock_discord_class, mock_reddit_class, mock_config, sample_exploit
    ):
        """Test partial failure when posting to multiple platforms"""
        # Mock Reddit poster (success)
        mock_reddit = Mock()
        mock_reddit.post_with_retry.return_value = {
            'success': True,
            'post_id': 'reddit123'
        }
        mock_reddit_class.return_value = mock_reddit

        # Mock Discord poster (failure)
        mock_discord = Mock()
        mock_discord.post_exploit_alert.return_value = {
            'success': False,
            'error': 'Webhook failed'
        }
        mock_discord_class.return_value = mock_discord

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(
            sample_exploit, [Platform.REDDIT, Platform.DISCORD]
        )
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert result['partial'] is True
        assert result['results']['reddit']['success'] is True
        assert result['results']['discord']['success'] is False

    @patch('social.poster.DiscordPoster')
    def test_post_all_failures(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test all platforms failing"""
        mock_poster = Mock()
        mock_poster.post_exploit_alert.return_value = {
            'success': False,
            'error': 'Failed'
        }
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert post.status == PostStatus.FAILED

    @patch('social.poster.DiscordPoster')
    def test_post_platform_not_configured(
        self, mock_discord_class, sample_exploit
    ):
        """Test posting to platform that isn't configured"""
        config = {'discord': {'enabled': True, 'webhooks': {'test': 'url'}}}
        poster = SocialMediaPoster(config)

        # Try to post to Reddit which isn't configured
        post = poster.create_post_from_exploit(sample_exploit, [Platform.REDDIT])
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert 'not configured' in result['results']['reddit']['error'].lower()

    @patch('social.poster.DiscordPoster')
    def test_post_no_content_generated(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test posting when no content was generated"""
        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])
        post.mark_reviewed(approved=True)

        # Remove content
        post.content = {}

        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert 'no content' in result['results']['discord']['error'].lower()


class TestTwitterThreading(TestSocialMediaPoster):
    """Test Twitter-specific threading logic"""

    @patch('social.poster.XTwitterPoster')
    def test_twitter_long_content_threading(
        self, mock_twitter_class, mock_config, sample_exploit
    ):
        """Test auto-threading for long Twitter content"""
        mock_poster = Mock()
        mock_poster.split_into_tweets.return_value = ['Tweet 1', 'Tweet 2']
        mock_poster.post_thread.return_value = {
            'success': True,
            'thread_id': 'thread123'
        }
        mock_twitter_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.X_TWITTER])

        # Make content very long
        long_content = "A" * 300
        post.content[Platform.X_TWITTER] = long_content
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        mock_poster.split_into_tweets.assert_called_once()
        mock_poster.post_thread.assert_called_once()

    @patch('social.poster.XTwitterPoster')
    def test_twitter_short_content_no_threading(
        self, mock_twitter_class, mock_config, sample_exploit
    ):
        """Test no threading for short Twitter content"""
        mock_poster = Mock()
        mock_poster.post_with_retry.return_value = {
            'success': True,
            'tweet_id': 'tweet123'
        }
        mock_twitter_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.X_TWITTER])

        # Make content short
        post.content[Platform.X_TWITTER] = "Short tweet"
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        mock_poster.post_with_retry.assert_called_once()


class TestFullWorkflow(TestSocialMediaPoster):
    """Test complete posting workflow"""

    @patch('social.poster.DiscordPoster')
    def test_process_exploit_full_workflow_approved(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test full workflow with approval"""
        mock_poster = Mock()
        mock_poster.post_exploit_alert.return_value = {
            'success': True,
            'post_id': 'test123'
        }
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)

        def approve_callback(p):
            return True

        result = poster.process_exploit(
            sample_exploit,
            [Platform.DISCORD],
            review_callback=approve_callback
        )

        assert result['success'] is True
        assert result['post'].status == PostStatus.POSTED
        mock_poster.post_exploit_alert.assert_called_once()

    @patch('social.poster.DiscordPoster')
    def test_process_exploit_full_workflow_rejected(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test full workflow with rejection"""
        poster = SocialMediaPoster(mock_config)

        def reject_callback(p):
            return False

        result = poster.process_exploit(
            sample_exploit,
            [Platform.DISCORD],
            review_callback=reject_callback
        )

        assert result['success'] is False
        assert 'rejected' in result['reason'].lower()
        assert result['post'].status == PostStatus.REJECTED

    @patch('social.poster.DiscordPoster')
    def test_process_exploit_auto_post(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test full workflow with auto-post (no review)"""
        mock_poster = Mock()
        mock_poster.post_exploit_alert.return_value = {
            'success': True,
            'post_id': 'test123'
        }
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)

        result = poster.process_exploit(
            sample_exploit,
            [Platform.DISCORD],
            auto_post=True
        )

        assert result['success'] is True
        assert result['post'].status == PostStatus.POSTED

    @patch('social.poster.RedditPoster')
    @patch('social.poster.DiscordPoster')
    def test_process_exploit_partial_success(
        self, mock_discord_class, mock_reddit_class, mock_config, sample_exploit
    ):
        """Test full workflow with partial platform success"""
        # Mock Reddit (success)
        mock_reddit = Mock()
        mock_reddit.post_with_retry.return_value = {
            'success': True,
            'post_id': 'reddit123'
        }
        mock_reddit_class.return_value = mock_reddit

        # Mock Discord (failure)
        mock_discord = Mock()
        mock_discord.post_exploit_alert.return_value = {
            'success': False,
            'error': 'Failed'
        }
        mock_discord_class.return_value = mock_discord

        poster = SocialMediaPoster(mock_config)

        result = poster.process_exploit(
            sample_exploit,
            [Platform.REDDIT, Platform.DISCORD],
            auto_post=True
        )

        assert result['success'] is False
        assert result['partial'] is True


class TestPlatformStatus(TestSocialMediaPoster):
    """Test platform status retrieval"""

    @patch('social.poster.DiscordPoster')
    def test_get_platform_status(self, mock_discord_class, mock_config):
        """Test getting status for all platforms"""
        mock_poster = Mock()
        mock_poster.get_status.return_value = {
            'enabled': True,
            'authenticated': True,
            'can_post': True
        }
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        status = poster.get_platform_status()

        assert 'discord' in status
        assert status['discord']['enabled'] is True
        mock_poster.get_status.assert_called_once()


class TestExceptionHandling(TestSocialMediaPoster):
    """Test exception handling during posting"""

    @patch('social.poster.DiscordPoster')
    def test_post_exception_handling(
        self, mock_discord_class, mock_config, sample_exploit
    ):
        """Test handling exceptions during posting"""
        mock_poster = Mock()
        mock_poster.post_exploit_alert.side_effect = Exception("Test error")
        mock_discord_class.return_value = mock_poster

        poster = SocialMediaPoster(mock_config)
        post = poster.create_post_from_exploit(sample_exploit, [Platform.DISCORD])
        post.mark_reviewed(approved=True)

        result = poster.post_to_platforms(post)

        assert result['success'] is False
        assert 'Test error' in result['results']['discord']['error']
        assert post.status == PostStatus.FAILED
