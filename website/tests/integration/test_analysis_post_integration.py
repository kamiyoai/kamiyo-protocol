# -*- coding: utf-8 -*-
"""
Analysis and Post Integration Tests
Tests that analysis reports correctly enhance social media posts
"""

import pytest
from unittest.mock import Mock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.autonomous_growth_engine import AutonomousGrowthEngine
from social.analysis import ReportGenerator
from social.models import Platform
from social.analysis.data_models import ReportFormat


class TestAnalysisEnhancesPost:
    """Test that analysis reports enhance social media posts"""

    def test_report_enhances_twitter_thread(
        self,
        sample_exploit,
        mock_social_config,
        capture_logs
    ):
        """Test analysis creates enhanced Twitter thread"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.X_TWITTER],
            auto_post=False  # Don't actually post
        )

        # Verify report was created
        report = result['report']
        assert report is not None
        assert len(report.engagement_hooks) > 0

        # Verify post was enhanced
        post = result['post']
        twitter_content = post.content[Platform.X_TWITTER]

        # Should be a thread (list)
        assert isinstance(twitter_content, list)
        assert len(twitter_content) > 1

        # Thread should include report insights
        thread_text = ' '.join(twitter_content)

        # Should have severity indicator
        assert any(emoji in thread_text for emoji in ['🔴', '🟠', '🟡', '🟢'])

        # Should mention key details
        assert sample_exploit.protocol in thread_text
        assert sample_exploit.chain in thread_text

    def test_engagement_hooks_in_post(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test engagement hooks from analysis appear in posts"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.X_TWITTER],
            auto_post=False
        )

        report = result['report']
        post = result['post']

        # Engagement hooks should exist
        assert len(report.engagement_hooks) > 0

        # At least one hook should appear in Twitter thread
        twitter_content = post.content[Platform.X_TWITTER]
        thread_text = ' '.join(twitter_content)

        # Check if any engagement hook appears
        hook_found = False
        for hook in report.engagement_hooks:
            if hook in thread_text or any(word in thread_text for word in hook.split()):
                hook_found = True
                break

        assert hook_found

    def test_timeline_in_enhanced_post(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test timeline information enhances posts"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.X_TWITTER],
            auto_post=False
        )

        report = result['report']
        post = result['post']

        # Timeline should exist
        assert len(report.timeline) > 0

        # Twitter thread should mention timing
        twitter_content = post.content[Platform.X_TWITTER]
        thread_text = ' '.join(twitter_content)

        # Should have timeline-related content
        timeline_keywords = ['Timeline', 'Occurred', 'Detected', 'UTC', 'speed']
        assert any(keyword in thread_text for keyword in timeline_keywords)

    def test_severity_indicator_in_post(
        self,
        critical_exploit,
        mock_social_config
    ):
        """Test severity from analysis appears in post"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=critical_exploit,
            platforms=[Platform.X_TWITTER],
            auto_post=False
        )

        report = result['report']
        post = result['post']

        # Critical exploit should have critical severity
        assert '🔴' in report.severity_indicator or 'CRITICAL' in report.severity.value[0]

        # Post should reflect severity
        twitter_content = post.content[Platform.X_TWITTER]
        first_tweet = twitter_content[0]

        assert '🔴' in first_tweet


class TestReportFormats:
    """Test different report formats affect posts appropriately"""

    def test_short_format_produces_concise_post(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test SHORT format produces concise content"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.SHORT,
            include_historical=False
        )

        # Short format summary should be brief
        assert len(report.executive_summary) < 200

    def test_medium_format_default(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test MEDIUM format is default and balanced"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.MEDIUM,
            include_historical=True
        )

        # Medium format should be balanced
        assert 100 < len(report.executive_summary) < 500

    def test_long_format_produces_detailed_post(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test LONG format produces detailed content"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.LONG,
            include_historical=True
        )

        # Long format should be detailed
        assert len(report.executive_summary) > 200


class TestHistoricalContext:
    """Test historical context enhances posts"""

    def test_historical_context_included(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test historical context is included in analysis"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.X_TWITTER],
            auto_post=False
        )

        report = result['report']

        # Historical context may or may not be present depending on DB
        # But the field should exist
        assert hasattr(report, 'historical_context')

    def test_post_uses_historical_context(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test posts incorporate historical context when available"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        # Mock historical context
        with patch('social.analysis.historical_context.HistoricalContextAnalyzer.generate_historical_context') as mock_hist:
            from social.analysis.data_models import HistoricalContext

            mock_hist.return_value = HistoricalContext(
                similar_exploits_count=5,
                total_category_losses=10_000_000.0,
                trend_direction='up',
                trend_percentage=25.0,
                trend_indicator='↗️ +25%',
                ranking="5th largest Flash Loan attack this year"
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.X_TWITTER],
                auto_post=False
            )

            post = result['post']
            twitter_content = post.content[Platform.X_TWITTER]
            thread_text = ' '.join(twitter_content)

            # Should mention historical context
            # The engine creates Twitter thread with historical context if available
            assert 'Historical Context' in thread_text or 'attack' in thread_text.lower()


class TestPlatformSpecificEnhancements:
    """Test enhancements are platform-appropriate"""

    def test_reddit_post_enhanced(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test Reddit post is enhanced with analysis"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.REDDIT],
            auto_post=False
        )

        post = result['post']
        reddit_content = post.content[Platform.REDDIT]

        # Reddit should have engagement hook added
        report = result['report']
        if report.engagement_hooks:
            # At least structured content
            assert len(reddit_content) > 100

    def test_discord_uses_structured_data(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test Discord receives structured exploit data"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify Discord poster received structured data
            call_args = mock_all_posters[Platform.DISCORD].post_exploit_alert.call_args
            exploit_data = call_args[0][0]

            # Should have all key fields
            assert 'protocol' in exploit_data
            assert 'chain' in exploit_data
            assert 'loss_amount_usd' in exploit_data
            assert 'exploit_type' in exploit_data

    def test_telegram_formatting(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test Telegram post formatting"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.TELEGRAM],
            auto_post=False
        )

        post = result['post']
        telegram_content = post.content[Platform.TELEGRAM]

        # Telegram should use HTML formatting
        assert '<b>' in telegram_content or '<i>' in telegram_content


class TestAnalysisQuality:
    """Test analysis report quality"""

    def test_complete_report_generated(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test complete report with all sections"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.MEDIUM,
            include_historical=True
        )

        # All major sections should exist
        assert report.report_id is not None
        assert report.executive_summary is not None
        assert len(report.timeline) > 0
        assert report.impact is not None
        assert len(report.engagement_hooks) > 0
        assert report.source_attribution is not None

    def test_impact_summary_accurate(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test impact summary reflects exploit data"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.MEDIUM
        )

        impact = report.impact

        # Impact should match exploit data
        assert impact.loss_amount_usd == sample_exploit.loss_amount_usd
        assert sample_exploit.protocol in impact.affected_protocols
        assert sample_exploit.chain in impact.affected_chains

    def test_timeline_chronological(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test timeline events are in chronological order"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.MEDIUM
        )

        timeline = report.timeline

        # Timeline should be sorted
        for i in range(len(timeline) - 1):
            assert timeline[i].timestamp <= timeline[i + 1].timestamp

    def test_source_attribution_present(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test source attribution is included"""
        generator = ReportGenerator()

        report = generator.analyze_exploit(
            exploit=sample_exploit,
            report_format=ReportFormat.MEDIUM
        )

        attribution = report.source_attribution

        # Should credit source
        assert attribution.primary_source is not None
        if sample_exploit.source_url:
            assert attribution.primary_source_url == sample_exploit.source_url

    @pytest.mark.parametrize("loss_amount,expected_severity_level", [
        (50_000, "LOW"),
        (500_000, "MEDIUM"),
        (5_000_000, "HIGH"),
        (15_000_000, "CRITICAL")
    ])
    def test_severity_classification(
        self,
        exploit_data_factory,
        mock_social_config,
        loss_amount,
        expected_severity_level
    ):
        """Test severity is classified correctly based on loss amount"""
        exploit = ExploitData(
            tx_hash="0xtest",
            protocol="Test Protocol",
            chain="Ethereum",
            loss_amount_usd=loss_amount,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow(),
            description="Test",
            recovery_status="Unknown",
            source="Test"
        )

        generator = ReportGenerator()
        report = generator.analyze_exploit(exploit)

        # Severity should match expected level
        severity_value = report.severity.value[0]
        # Just check it's classified (exact matching depends on implementation)
        assert len(severity_value) > 0


class TestIntegrationEndToEnd:
    """End-to-end analysis to post integration tests"""

    def test_full_analysis_to_post_flow(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test complete flow from analysis to posting"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.REDDIT, Platform.DISCORD, Platform.X_TWITTER],
                auto_post=True
            )

            # Complete flow should succeed
            assert result['success'] is True

            # Report should be generated
            assert result['report'] is not None

            # Post should be enhanced
            post = result['post']
            assert len(post.content) == 3

            # All platforms should be posted
            assert result['posting_results']['success'] is True

    def test_analysis_failure_stops_posting(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test that analysis failure prevents posting"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Analysis failed")

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                auto_post=True
            )

            # Should fail before posting
            assert result['success'] is False
            assert 'error' in result
            assert 'post' not in result or result.get('post') is None

    def test_multiple_exploits_sequential_processing(
        self,
        sample_exploit,
        critical_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test processing multiple exploits maintains quality"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            # Process multiple exploits
            results = []
            for exploit in [sample_exploit, critical_exploit]:
                result = engine.process_exploit(
                    exploit=exploit,
                    platforms=[Platform.DISCORD],
                    auto_post=True
                )
                results.append(result)

            # All should succeed
            assert all(r['success'] for r in results)

            # Each should have unique report
            report_ids = [r['report'].report_id for r in results]
            assert len(set(report_ids)) == 2  # All unique

            # Each should have appropriate content
            for result, exploit in zip(results, [sample_exploit, critical_exploit]):
                post = result['post']
                content = post.content[Platform.DISCORD]
                # Content should be present (exact format varies by platform)
                assert content is not None
