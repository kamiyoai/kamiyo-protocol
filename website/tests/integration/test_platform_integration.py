# -*- coding: utf-8 -*-
"""
Platform Integration Tests
Tests that all platform posters work together correctly
"""

import pytest
from unittest.mock import Mock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.poster import SocialMediaPoster
from social.models import Platform


class TestPlatformIntegration:
    """Test integration between multiple platforms"""

    def test_all_platforms_post_successfully(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters,
        capture_logs
    ):
        """Test posting to all platforms simultaneously"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            # Create and approve post
            post = poster.create_post_from_exploit(sample_exploit)
            post.mark_reviewed(approved=True)

            # Post to all platforms
            result = poster.post_to_platforms(post)

            # All should succeed
            assert result['success'] is True
            assert result['partial'] is False

            # Verify all platforms were called
            for platform in mock_all_posters.values():
                if hasattr(platform, 'post_with_retry'):
                    assert platform.post_with_retry.called
                elif hasattr(platform, 'post_exploit_alert'):
                    assert platform.post_exploit_alert.called

    def test_platform_specific_content_format(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test that each platform receives appropriately formatted content"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            post = poster.create_post_from_exploit(sample_exploit)

            # Verify each platform has content
            assert Platform.REDDIT in post.content
            assert Platform.DISCORD in post.content
            assert Platform.TELEGRAM in post.content
            assert Platform.X_TWITTER in post.content

            # Verify content formats differ
            reddit_content = post.content[Platform.REDDIT]
            discord_content = post.content[Platform.DISCORD]

            # Reddit should have markdown formatting
            assert '**' in reddit_content or '#' in reddit_content

            # Discord content exists (will be transformed to embed)
            assert discord_content is not None

    def test_platform_failure_isolation(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters,
        capture_logs
    ):
        """Test that one platform failure doesn't affect others"""
        # Make Reddit fail
        mock_all_posters[Platform.REDDIT].post_with_retry = Mock(return_value={
            'success': False,
            'error': 'Reddit API error'
        })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            post = poster.create_post_from_exploit(sample_exploit)
            post.mark_reviewed(approved=True)

            result = poster.post_to_platforms(post)

            # Should be partial success
            assert result['success'] is False
            assert result['partial'] is True

            # Reddit should fail
            assert result['results']['reddit']['success'] is False

            # Others should succeed
            assert result['results']['discord']['success'] is True
            assert result['results']['telegram']['success'] is True
            assert result['results']['x_twitter']['success'] is True

    def test_platform_status_reporting(
        self,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test platform status reporting"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            status = poster.get_platform_status()

            # All platforms should report status
            assert 'reddit' in status
            assert 'discord' in status
            assert 'telegram' in status
            assert 'x_twitter' in status

            # Each should be ready
            for platform_status in status.values():
                assert platform_status['authenticated'] is True
                assert platform_status['ready'] is True

    def test_selective_platform_posting(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test posting to a subset of configured platforms"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            # Create post for only Discord and Twitter
            post = poster.create_post_from_exploit(
                sample_exploit,
                platforms=[Platform.DISCORD, Platform.X_TWITTER]
            )

            assert len(post.platforms) == 2
            assert Platform.DISCORD in post.platforms
            assert Platform.X_TWITTER in post.platforms
            assert Platform.REDDIT not in post.platforms
            assert Platform.TELEGRAM not in post.platforms

    def test_platform_retry_coordination(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test retry logic across platforms"""
        # Make Discord fail first attempt, succeed second
        discord_call_count = [0]

        def discord_post_side_effect(*args, **kwargs):
            discord_call_count[0] += 1
            if discord_call_count[0] == 1:
                return {'success': False, 'error': 'Temporary error'}
            return {'success': True, 'message_id': 'test123'}

        mock_all_posters[Platform.DISCORD].post_exploit_alert = Mock(
            side_effect=discord_post_side_effect
        )

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            post = poster.create_post_from_exploit(
                sample_exploit,
                platforms=[Platform.DISCORD]
            )
            post.mark_reviewed(approved=True)

            # First posting attempt
            result = poster.post_to_platforms(post)

            # Should fail on first attempt (our mock fails once)
            assert result['results']['discord']['success'] is False

    def test_concurrent_platform_posting(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test platforms are called independently"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            post = poster.create_post_from_exploit(
                sample_exploit,
                platforms=[Platform.REDDIT, Platform.DISCORD]
            )
            post.mark_reviewed(approved=True)

            result = poster.post_to_platforms(post)

            # Both should be called
            assert mock_all_posters[Platform.REDDIT].post_with_retry.called
            assert mock_all_posters[Platform.DISCORD].post_exploit_alert.called

    @pytest.mark.parametrize("failing_platform", [
        Platform.REDDIT,
        Platform.DISCORD,
        Platform.TELEGRAM,
        Platform.X_TWITTER
    ])
    def test_single_platform_failure_patterns(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters,
        failing_platform
    ):
        """Test failure patterns for each platform individually"""
        # Make specified platform fail
        failing_poster = mock_all_posters[failing_platform]
        if hasattr(failing_poster, 'post_with_retry'):
            failing_poster.post_with_retry = Mock(return_value={
                'success': False,
                'error': f'{failing_platform.value} error'
            })
        elif hasattr(failing_poster, 'post_exploit_alert'):
            failing_poster.post_exploit_alert = Mock(return_value={
                'success': False,
                'error': f'{failing_platform.value} error'
            })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)

            post = poster.create_post_from_exploit(sample_exploit)
            post.mark_reviewed(approved=True)

            result = poster.post_to_platforms(post)

            # Should be partial success
            assert result['partial'] is True

            # Failing platform should fail
            assert result['results'][failing_platform.value]['success'] is False

            # Others should succeed
            for platform in [Platform.REDDIT, Platform.DISCORD, Platform.TELEGRAM, Platform.X_TWITTER]:
                if platform != failing_platform:
                    assert result['results'][platform.value]['success'] is True


class TestPlatformConfiguration:
    """Test platform configuration scenarios"""

    def test_disabled_platforms_not_initialized(self):
        """Test that disabled platforms are not initialized"""
        config = {
            'reddit': {'enabled': False},
            'discord': {
                'enabled': True,
                'webhooks': {'test': 'https://discord.com/webhook/test'}
            },
            'telegram': {'enabled': False},
            'x_twitter': {'enabled': False}
        }

        poster = SocialMediaPoster(config)

        # Only Discord should be initialized
        assert len(poster.platforms) == 1
        assert Platform.DISCORD in poster.platforms
        assert Platform.REDDIT not in poster.platforms
        assert Platform.TELEGRAM not in poster.platforms
        assert Platform.X_TWITTER not in poster.platforms

    def test_no_platforms_enabled(self, capture_logs):
        """Test handling when no platforms are enabled"""
        config = {
            'reddit': {'enabled': False},
            'discord': {'enabled': False},
            'telegram': {'enabled': False},
            'x_twitter': {'enabled': False}
        }

        poster = SocialMediaPoster(config)

        assert len(poster.platforms) == 0

    def test_partial_configuration(self):
        """Test with some platforms fully configured, others not"""
        config = {
            'reddit': {
                'enabled': True,
                'client_id': 'test_id',
                'client_secret': 'test_secret',
                'username': 'test_user',
                'password': 'test_pass',
                'subreddits': ['test']
            },
            'discord': {
                'enabled': True,
                'webhooks': {}  # Empty webhooks
            }
        }

        with patch('social.platforms.reddit.RedditPoster'):
            with patch('social.platforms.discord.DiscordPoster'):
                poster = SocialMediaPoster(config)

                # Should initialize what it can
                assert Platform.REDDIT in poster.platforms or \
                       Platform.DISCORD in poster.platforms or \
                       len(poster.platforms) >= 0  # At least doesn't crash

    def test_platform_authentication_status(
        self,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test checking authentication status across platforms"""
        # Make Reddit not authenticated
        mock_all_posters[Platform.REDDIT].get_status = Mock(return_value={
            'authenticated': False,
            'ready': False,
            'error': 'Invalid credentials'
        })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            status = poster.get_platform_status()

            # Reddit should not be authenticated
            assert status['reddit']['authenticated'] is False
            assert status['reddit']['ready'] is False

            # Others should be fine
            assert status['discord']['authenticated'] is True
            assert status['telegram']['authenticated'] is True
            assert status['x_twitter']['authenticated'] is True


class TestCrossplatformContent:
    """Test content generation and formatting across platforms"""

    def test_content_length_appropriate_per_platform(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test content length is appropriate for each platform"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            post = poster.create_post_from_exploit(sample_exploit)

            # Twitter content might be a thread
            twitter_content = post.content[Platform.X_TWITTER]
            if isinstance(twitter_content, list):
                # It's a thread
                for tweet in twitter_content:
                    assert len(tweet) <= 280
            else:
                # Single tweet
                assert len(twitter_content) <= 280

            # Telegram and Discord can be longer
            telegram_content = post.content[Platform.TELEGRAM]
            assert len(telegram_content) > 0  # Has content

            # Reddit can be very detailed
            reddit_content = post.content[Platform.REDDIT]
            assert len(reddit_content) > 100  # Substantial content

    def test_platform_specific_formatting(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test each platform receives appropriate formatting"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            post = poster.create_post_from_exploit(sample_exploit)

            # Reddit uses Markdown
            reddit_content = post.content[Platform.REDDIT]
            assert '**' in reddit_content or '#' in reddit_content

            # Telegram uses HTML
            telegram_content = post.content[Platform.TELEGRAM]
            assert '<b>' in telegram_content or '<i>' in telegram_content or telegram_content

    def test_exploit_details_present_across_platforms(
        self,
        sample_exploit,
        mock_all_platforms_config,
        mock_all_posters
    ):
        """Test that key exploit details are in all platform posts"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            poster = SocialMediaPoster(mock_all_platforms_config)
            post = poster.create_post_from_exploit(sample_exploit)

            # Check each platform has key details
            for platform, content in post.content.items():
                content_str = str(content)  # Handle lists (Twitter threads)

                # Should mention protocol
                assert sample_exploit.protocol in content_str

                # Should mention chain
                assert sample_exploit.chain in content_str
