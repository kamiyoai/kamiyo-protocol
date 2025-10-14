# -*- coding: utf-8 -*-
"""
Test Post Generator
Tests for content generation, emoji mapping, templates, and customization
"""

import pytest
from datetime import datetime
from social.models import ExploitData, Platform, PostPriority, PostStatus
from social.post_generator import PostGenerator


class TestPostGenerator:
    """Test PostGenerator class"""

    @pytest.fixture
    def generator(self):
        """Create PostGenerator instance"""
        return PostGenerator()

    @pytest.fixture
    def sample_exploit(self):
        """Create sample exploit data"""
        return ExploitData(
            tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            protocol="Uniswap V3",
            chain="Ethereum",
            loss_amount_usd=2_500_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime(2024, 1, 15, 10, 30, 0),
            description="Flash loan attack exploited price oracle manipulation",
            recovery_status="Partial Recovery - 60%",
            source="Rekt News",
            source_url="https://rekt.news/test"
        )


class TestEmojiMapping(TestPostGenerator):
    """Test emoji mappings"""

    def test_exploit_type_emoji_map(self, generator):
        """Test exploit type emoji mapping exists"""
        assert 'Flash Loan' in generator.emoji_map
        assert generator.emoji_map['Flash Loan'] == '⚡'
        assert 'Reentrancy' in generator.emoji_map
        assert generator.emoji_map['Reentrancy'] == '🔄'
        assert 'Unknown' in generator.emoji_map

    def test_chain_emoji_map(self, generator):
        """Test chain emoji mapping exists"""
        assert 'Ethereum' in generator.chain_emoji_map
        assert 'BSC' in generator.chain_emoji_map
        assert 'Polygon' in generator.chain_emoji_map
        assert 'Solana' in generator.chain_emoji_map


class TestTemplates(TestPostGenerator):
    """Test platform templates"""

    def test_twitter_template_exists(self, generator):
        """Test Twitter template configuration"""
        template = generator.TEMPLATES[Platform.X_TWITTER]
        assert template.platform == Platform.X_TWITTER
        assert template.template_type == 'short'
        assert template.max_length == 280
        assert template.supports_images is True
        assert template.supports_hashtags is True

    def test_reddit_template_exists(self, generator):
        """Test Reddit template configuration"""
        template = generator.TEMPLATES[Platform.REDDIT]
        assert template.platform == Platform.REDDIT
        assert template.template_type == 'detailed'
        assert template.max_length == 40000
        assert template.supports_images is True
        assert template.supports_hashtags is False

    def test_discord_template_exists(self, generator):
        """Test Discord template configuration"""
        template = generator.TEMPLATES[Platform.DISCORD]
        assert template.platform == Platform.DISCORD
        assert template.template_type == 'embed'
        assert template.max_length == 2000
        assert template.supports_images is True

    def test_telegram_template_exists(self, generator):
        """Test Telegram template configuration"""
        template = generator.TEMPLATES[Platform.TELEGRAM]
        assert template.platform == Platform.TELEGRAM
        assert template.template_type == 'short'
        assert template.max_length == 4096
        assert template.supports_images is True


class TestPostGeneration(TestPostGenerator):
    """Test post generation"""

    def test_generate_post_single_platform(self, generator, sample_exploit):
        """Test generating post for single platform"""
        post = generator.generate_post(sample_exploit, [Platform.X_TWITTER])

        assert post.exploit_data == sample_exploit
        assert len(post.platforms) == 1
        assert Platform.X_TWITTER in post.platforms
        assert len(post.content) == 1
        assert Platform.X_TWITTER in post.content
        assert post.status == PostStatus.PENDING_REVIEW

    def test_generate_post_multiple_platforms(self, generator, sample_exploit):
        """Test generating post for multiple platforms"""
        platforms = [Platform.X_TWITTER, Platform.REDDIT, Platform.DISCORD]
        post = generator.generate_post(sample_exploit, platforms)

        assert len(post.platforms) == 3
        assert len(post.content) == 3
        assert all(p in post.content for p in platforms)

    def test_generate_post_all_platforms(self, generator, sample_exploit):
        """Test generating post for all supported platforms"""
        platforms = [
            Platform.X_TWITTER,
            Platform.REDDIT,
            Platform.DISCORD,
            Platform.TELEGRAM
        ]
        post = generator.generate_post(sample_exploit, platforms)

        assert len(post.platforms) == 4
        assert len(post.content) == 4

    def test_generate_post_tags(self, generator, sample_exploit):
        """Test tag generation"""
        post = generator.generate_post(sample_exploit, [Platform.X_TWITTER])

        assert len(post.tags) > 0
        assert 'DeFi' in post.tags
        assert 'CryptoSecurity' in post.tags
        assert 'Ethereum' in post.tags
        assert 'Exploit' in post.tags

    def test_generate_post_critical_tag(self, generator, sample_exploit):
        """Test critical tag for high-value exploits"""
        sample_exploit.loss_amount_usd = 15_000_000.0
        post = generator.generate_post(sample_exploit, [Platform.X_TWITTER])

        assert 'CriticalAlert' in post.tags

    def test_generate_post_high_severity_tag(self, generator, sample_exploit):
        """Test high severity tag"""
        sample_exploit.loss_amount_usd = 2_500_000.0
        post = generator.generate_post(sample_exploit, [Platform.X_TWITTER])

        assert 'HighSeverity' in post.tags


class TestPlatformContent(TestPostGenerator):
    """Test platform-specific content generation"""

    def test_twitter_content_generation(self, generator, sample_exploit):
        """Test Twitter content generation"""
        post = generator.generate_post(sample_exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        assert 'Uniswap V3' in content
        assert 'Ethereum' in content
        assert '$2.50M' in content
        assert 'Flash Loan' in content
        assert len(content) <= 280

    def test_reddit_content_generation(self, generator, sample_exploit):
        """Test Reddit content generation"""
        post = generator.generate_post(sample_exploit, [Platform.REDDIT])
        content = post.content[Platform.REDDIT]

        assert 'Uniswap V3' in content
        assert 'Ethereum' in content
        assert '$2.50M' in content
        assert 'Flash Loan' in content
        assert '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' in content
        assert 'Partial Recovery - 60%' in content
        assert 'Rekt News' in content

    def test_discord_content_generation(self, generator, sample_exploit):
        """Test Discord content generation"""
        post = generator.generate_post(sample_exploit, [Platform.DISCORD])
        content = post.content[Platform.DISCORD]

        assert 'Uniswap V3' in content
        assert 'Ethereum' in content
        assert '$2.50M' in content
        assert 'Flash Loan' in content
        assert len(content) <= 2000

    def test_telegram_content_generation(self, generator, sample_exploit):
        """Test Telegram content generation"""
        post = generator.generate_post(sample_exploit, [Platform.TELEGRAM])
        content = post.content[Platform.TELEGRAM]

        assert 'Uniswap V3' in content
        assert 'Ethereum' in content
        assert '$2.50M' in content
        assert '<b>' in content  # HTML formatting
        assert '<code>' in content
        assert len(content) <= 4096


class TestThreadGeneration(TestPostGenerator):
    """Test thread generation for Twitter"""

    def test_generate_thread(self, generator, sample_exploit):
        """Test generating Twitter thread"""
        thread = generator.generate_thread(sample_exploit, Platform.X_TWITTER)

        assert isinstance(thread, list)
        assert len(thread) >= 2
        assert 'EXPLOIT ALERT' in thread[0]
        assert 'Uniswap V3' in thread[0]

    def test_thread_has_details(self, generator, sample_exploit):
        """Test thread contains detailed information"""
        thread = generator.generate_thread(sample_exploit)

        # Check for details in second post
        assert len(thread) >= 2
        details_post = thread[1]
        assert 'Flash Loan' in details_post
        assert 'Ethereum' in details_post

    def test_thread_has_description(self, generator, sample_exploit):
        """Test thread includes description when available"""
        thread = generator.generate_thread(sample_exploit)

        # Find description post
        description_found = any('What Happened' in post for post in thread)
        assert description_found

    def test_thread_has_recovery_status(self, generator, sample_exploit):
        """Test thread includes recovery status"""
        thread = generator.generate_thread(sample_exploit)

        # Last post should have recovery status
        recovery_found = any('Recovery Status' in post for post in thread)
        assert recovery_found

    def test_thread_without_description(self, generator, sample_exploit):
        """Test thread generation without description"""
        sample_exploit.description = None
        thread = generator.generate_thread(sample_exploit)

        # Should still generate thread with remaining info
        assert len(thread) >= 2


class TestContentCustomization(TestPostGenerator):
    """Test content customization for different audiences"""

    def test_customize_for_technical_audience(self, generator, sample_exploit):
        """Test customization for technical audience"""
        post = generator.generate_post(sample_exploit, [Platform.REDDIT])
        customized = generator.customize_for_audience(
            post, Platform.REDDIT, 'technical'
        )

        assert 'Technical Details' in customized
        assert sample_exploit.tx_hash in customized

    def test_customize_for_traders(self, generator, sample_exploit):
        """Test customization for trader audience"""
        post = generator.generate_post(sample_exploit, [Platform.REDDIT])
        customized = generator.customize_for_audience(
            post, Platform.REDDIT, 'traders'
        )

        assert 'Market Impact' in customized
        assert 'price' in customized.lower() or 'token' in customized.lower()

    def test_customize_for_security_audience(self, generator, sample_exploit):
        """Test customization for security audience"""
        post = generator.generate_post(sample_exploit, [Platform.REDDIT])
        customized = generator.customize_for_audience(
            post, Platform.REDDIT, 'security'
        )

        assert 'Security Analysis' in customized
        assert 'Vulnerability Type' in customized

    def test_customize_for_general_audience(self, generator, sample_exploit):
        """Test customization for general audience (no changes)"""
        post = generator.generate_post(sample_exploit, [Platform.REDDIT])
        original_content = post.content[Platform.REDDIT]
        customized = generator.customize_for_audience(
            post, Platform.REDDIT, 'general'
        )

        assert customized == original_content


class TestEdgeCases(TestPostGenerator):
    """Test edge cases and error handling"""

    def test_exploit_without_optional_fields(self, generator):
        """Test generating post for exploit without optional fields"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="BSC",
            loss_amount_usd=500_000.0,
            exploit_type="Unknown",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])

        assert len(post.content) == 1
        assert Platform.X_TWITTER in post.content

    def test_very_long_protocol_name(self, generator):
        """Test handling very long protocol name"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="VeryLongProtocolNameThatExceedsNormalLimits" * 5,
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        # Should be truncated to fit Twitter limit
        assert len(content) <= 280

    def test_unknown_exploit_type_emoji(self, generator):
        """Test emoji mapping for unknown exploit type"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="NewUnknownExploitType",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        # Should use default emoji
        assert '❓' in content or 'NewUnknownExploitType' in content

    def test_unknown_chain_emoji(self, generator):
        """Test emoji mapping for unknown chain"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="NewChain",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        # Should still generate content
        assert 'NewChain' in content

    def test_empty_platforms_list(self, generator, sample_exploit):
        """Test generating post with empty platforms list"""
        post = generator.generate_post(sample_exploit, [])

        assert len(post.platforms) == 0
        assert len(post.content) == 0
        # Status should be DRAFT because not ready for review
        assert post.status == PostStatus.DRAFT

    def test_very_large_loss_amount(self, generator):
        """Test formatting very large loss amounts"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_500_000_000.0,  # $1.5 billion
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        # Should format as millions
        assert '1500.00M' in content or '1.5B' in exploit.formatted_amount

    def test_very_small_loss_amount(self, generator):
        """Test formatting very small loss amounts"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=50.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = generator.generate_post(exploit, [Platform.X_TWITTER])
        content = post.content[Platform.X_TWITTER]

        # Should format as dollars
        assert '$50.00' in content or '50' in content
