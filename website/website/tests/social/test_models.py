# -*- coding: utf-8 -*-
"""
Test Social Media Models
Tests for all data models, enums, and model behaviors
"""

import pytest
from datetime import datetime, timedelta
from social.models import (
    ExploitData, SocialPost, PostTemplate, PlatformConfig,
    PostStatus, Platform, PostPriority
)


class TestEnums:
    """Test enum classes"""

    def test_post_status_values(self):
        """Test PostStatus enum values"""
        assert PostStatus.DRAFT.value == "draft"
        assert PostStatus.PENDING_REVIEW.value == "pending_review"
        assert PostStatus.APPROVED.value == "approved"
        assert PostStatus.REJECTED.value == "rejected"
        assert PostStatus.POSTED.value == "posted"
        assert PostStatus.FAILED.value == "failed"

    def test_platform_values(self):
        """Test Platform enum values"""
        assert Platform.REDDIT.value == "reddit"
        assert Platform.DISCORD.value == "discord"
        assert Platform.TELEGRAM.value == "telegram"
        assert Platform.X_TWITTER.value == "x_twitter"
        assert Platform.LINKEDIN.value == "linkedin"
        assert Platform.FACEBOOK.value == "facebook"

    def test_post_priority_values(self):
        """Test PostPriority enum values"""
        assert PostPriority.LOW.value == "low"
        assert PostPriority.MEDIUM.value == "medium"
        assert PostPriority.HIGH.value == "high"
        assert PostPriority.CRITICAL.value == "critical"


class TestExploitData:
    """Test ExploitData model"""

    def test_exploit_data_creation(self):
        """Test creating ExploitData instance"""
        exploit = ExploitData(
            tx_hash="0xabc123",
            protocol="Uniswap",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        assert exploit.tx_hash == "0xabc123"
        assert exploit.protocol == "Uniswap"
        assert exploit.chain == "Ethereum"
        assert exploit.loss_amount_usd == 1_000_000.0
        assert exploit.exploit_type == "Flash Loan"

    def test_exploit_data_with_optional_fields(self):
        """Test ExploitData with optional fields"""
        exploit = ExploitData(
            tx_hash="0xabc123",
            protocol="Uniswap",
            chain="Ethereum",
            loss_amount_usd=500_000.0,
            exploit_type="Reentrancy",
            timestamp=datetime.utcnow(),
            description="Test exploit",
            recovery_status="Recovered",
            source="Rekt News",
            source_url="https://rekt.news/test"
        )

        assert exploit.description == "Test exploit"
        assert exploit.recovery_status == "Recovered"
        assert exploit.source == "Rekt News"
        assert exploit.source_url == "https://rekt.news/test"

    def test_priority_critical(self):
        """Test priority calculation for critical exploits (>= $10M)"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=10_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.priority == PostPriority.CRITICAL

        exploit.loss_amount_usd = 50_000_000.0
        assert exploit.priority == PostPriority.CRITICAL

    def test_priority_high(self):
        """Test priority calculation for high exploits ($1M - $10M)"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.priority == PostPriority.HIGH

        exploit.loss_amount_usd = 5_000_000.0
        assert exploit.priority == PostPriority.HIGH

        exploit.loss_amount_usd = 9_999_999.0
        assert exploit.priority == PostPriority.HIGH

    def test_priority_medium(self):
        """Test priority calculation for medium exploits ($100K - $1M)"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=100_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.priority == PostPriority.MEDIUM

        exploit.loss_amount_usd = 500_000.0
        assert exploit.priority == PostPriority.MEDIUM

        exploit.loss_amount_usd = 999_999.0
        assert exploit.priority == PostPriority.MEDIUM

    def test_priority_low(self):
        """Test priority calculation for low exploits (< $100K)"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=50_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.priority == PostPriority.LOW

        exploit.loss_amount_usd = 1000.0
        assert exploit.priority == PostPriority.LOW

    def test_formatted_amount_millions(self):
        """Test formatted amount for millions"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=2_500_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.formatted_amount == "$2.50M"

        exploit.loss_amount_usd = 10_000_000.0
        assert exploit.formatted_amount == "$10.00M"

    def test_formatted_amount_thousands(self):
        """Test formatted amount for thousands"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=250_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.formatted_amount == "$250.0K"

        exploit.loss_amount_usd = 1_500.0
        assert exploit.formatted_amount == "$1.5K"

    def test_formatted_amount_under_thousand(self):
        """Test formatted amount for amounts under $1000"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=500.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )
        assert exploit.formatted_amount == "$500.00"


class TestSocialPost:
    """Test SocialPost model"""

    def test_social_post_creation(self):
        """Test creating SocialPost instance"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)

        assert post.exploit_data == exploit
        assert post.status == PostStatus.DRAFT
        assert post.post_id is None
        assert isinstance(post.created_at, datetime)
        assert post.reviewed_at is None
        assert post.posted_at is None

    def test_social_post_with_content(self):
        """Test SocialPost with platform-specific content"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.content[Platform.REDDIT] = "Reddit content"
        post.content[Platform.DISCORD] = "Discord content"
        post.platforms = [Platform.REDDIT, Platform.DISCORD]

        assert len(post.content) == 2
        assert post.content[Platform.REDDIT] == "Reddit content"
        assert post.content[Platform.DISCORD] == "Discord content"
        assert len(post.platforms) == 2

    def test_is_ready_for_review(self):
        """Test is_ready_for_review property"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        assert not post.is_ready_for_review  # No content or platforms

        post.content[Platform.REDDIT] = "Content"
        assert not post.is_ready_for_review  # No platforms

        post.platforms = [Platform.REDDIT]
        assert post.is_ready_for_review  # Has both

        post.status = PostStatus.APPROVED
        assert not post.is_ready_for_review  # Status changed

    def test_is_approved(self):
        """Test is_approved property"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        assert not post.is_approved

        post.status = PostStatus.APPROVED
        assert post.is_approved

        post.status = PostStatus.REJECTED
        assert not post.is_approved

    def test_mark_reviewed_approved(self):
        """Test marking post as approved"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.mark_reviewed(approved=True)

        assert post.status == PostStatus.APPROVED
        assert isinstance(post.reviewed_at, datetime)

    def test_mark_reviewed_rejected(self):
        """Test marking post as rejected"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.mark_reviewed(approved=False)

        assert post.status == PostStatus.REJECTED
        assert isinstance(post.reviewed_at, datetime)

    def test_mark_posted(self):
        """Test marking post as posted"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.mark_posted()

        assert post.status == PostStatus.POSTED
        assert isinstance(post.posted_at, datetime)

    def test_mark_failed(self):
        """Test marking post as failed"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.mark_failed()

        assert post.status == PostStatus.FAILED

    def test_posting_results(self):
        """Test storing posting results"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        post = SocialPost(exploit_data=exploit)
        post.posting_results[Platform.REDDIT] = {
            'success': True,
            'post_id': 'abc123'
        }

        assert post.posting_results[Platform.REDDIT]['success'] is True
        assert post.posting_results[Platform.REDDIT]['post_id'] == 'abc123'


class TestPostTemplate:
    """Test PostTemplate model"""

    def test_template_creation(self):
        """Test creating PostTemplate instance"""
        template = PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template='Test {protocol} on {chain}',
            max_length=280
        )

        assert template.platform == Platform.X_TWITTER
        assert template.template_type == 'short'
        assert template.template == 'Test {protocol} on {chain}'
        assert template.max_length == 280

    def test_template_render(self):
        """Test rendering template with exploit data"""
        exploit = ExploitData(
            tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            protocol="Uniswap",
            chain="Ethereum",
            loss_amount_usd=2_500_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime(2024, 1, 15, 10, 30, 0)
        )

        template = PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template='{protocol} on {chain}: {amount} lost',
            max_length=280
        )

        content = template.render(exploit)
        assert 'Uniswap' in content
        assert 'Ethereum' in content
        assert '$2.50M' in content

    def test_template_render_with_tx_short(self):
        """Test rendering template with shortened transaction hash"""
        exploit = ExploitData(
            tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        template = PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template='TX: {tx_short}',
            max_length=280
        )

        content = template.render(exploit)
        assert content == 'TX: 0x123456...abcdef'

    def test_template_render_truncation(self):
        """Test template truncation when exceeding max_length"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="VeryLongProtocolName",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        template = PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template='{protocol} ' * 50,  # Very long template
            max_length=50
        )

        content = template.render(exploit)
        assert len(content) == 50
        assert content.endswith('...')

    def test_template_render_with_kwargs(self):
        """Test rendering template with additional kwargs"""
        exploit = ExploitData(
            tx_hash="0x123",
            protocol="Test",
            chain="Ethereum",
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow()
        )

        template = PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template='{protocol} {custom_field}',
            max_length=280
        )

        content = template.render(exploit, custom_field='CustomValue')
        assert 'Test' in content
        assert 'CustomValue' in content


class TestPlatformConfig:
    """Test PlatformConfig model"""

    def test_platform_config_creation(self):
        """Test creating PlatformConfig instance"""
        config = PlatformConfig(
            platform=Platform.REDDIT,
            enabled=True,
            credentials={'client_id': 'test', 'client_secret': 'secret'},
            targets=['defi', 'CryptoCurrency'],
            rate_limit=10
        )

        assert config.platform == Platform.REDDIT
        assert config.enabled is True
        assert config.credentials['client_id'] == 'test'
        assert 'defi' in config.targets
        assert config.rate_limit == 10

    def test_platform_config_default_retry(self):
        """Test PlatformConfig default retry settings"""
        config = PlatformConfig(
            platform=Platform.DISCORD,
            enabled=True,
            credentials={},
            targets=['channel1'],
            rate_limit=5
        )

        assert config.retry_attempts == 3
        assert config.retry_delay == 60
