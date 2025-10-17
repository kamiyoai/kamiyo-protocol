# -*- coding: utf-8 -*-
"""
Full Pipeline Integration Tests
End-to-end testing of exploit → analysis → post → monitoring

Tests the complete autonomous growth pipeline from exploit detection
through report generation, posting, and monitoring.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.autonomous_growth_engine import AutonomousGrowthEngine
from social.models import ExploitData, Platform
from social.analysis.data_models import ReportFormat


class TestFullPipeline:
    """Test complete end-to-end pipeline"""

    def test_exploit_to_post_success(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics,
        capture_logs
    ):
        """Test complete pipeline: exploit → analysis → post succeeds"""
        # Mock the platform posters
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            # Initialize engine
            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                kamiyo_api_key='test-key',
                enable_monitoring=True,
                enable_alerting=False
            )

            # Process exploit
            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD, Platform.REDDIT],
                auto_post=True
            )

            # Verify success
            assert result['success'] is True
            assert 'report' in result
            assert 'post' in result
            assert result['post'].is_approved

            # Verify report was generated
            report = result['report']
            assert report.protocol == sample_exploit.protocol
            assert report.exploit_tx_hash == sample_exploit.tx_hash
            assert len(report.timeline) > 0
            assert len(report.engagement_hooks) > 0

            # Verify post was created and posted
            post = result['post']
            assert len(post.content) == 2  # Discord and Reddit
            assert Platform.DISCORD in post.content
            assert Platform.REDDIT in post.content

            # Verify platform posters were called
            mock_all_posters[Platform.DISCORD].post_exploit_alert.assert_called_once()
            mock_all_posters[Platform.REDDIT].post_with_retry.assert_called_once()

            # Verify metrics were tracked
            assert mock_metrics['track_post'].called
            assert mock_metrics['record_generation_duration'].called

            # Verify logs
            assert "Processing exploit for autonomous growth" in capture_logs.text
            assert "Successfully published" in capture_logs.text

    def test_exploit_analysis_enhances_post(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test that exploit analysis enriches social media posts"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.X_TWITTER],
                auto_post=True
            )

            # Verify post was enhanced with analysis
            post = result['post']
            twitter_content = post.content[Platform.X_TWITTER]

            # Should be a thread (list of tweets)
            assert isinstance(twitter_content, list)
            assert len(twitter_content) > 1

            # First tweet should have severity indicator
            assert any(emoji in twitter_content[0] for emoji in ['🔴', '🟠', '🟡'])

            # Thread should mention protocol and amount
            thread_text = ' '.join(twitter_content)
            assert sample_exploit.protocol in thread_text
            assert sample_exploit.chain in thread_text

    def test_partial_platform_failure(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics,
        capture_logs
    ):
        """Test pipeline handles partial platform failures gracefully"""
        # Make Reddit fail but Discord succeed
        mock_all_posters[Platform.REDDIT].post_with_retry = Mock(return_value={
            'success': False,
            'error': 'Reddit API error'
        })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD, Platform.REDDIT],
                auto_post=True
            )

            # Should succeed partially
            assert result['success'] is False  # Not all platforms succeeded
            assert result['partial'] is True  # But some did

            # Verify Discord succeeded
            posting_results = result['posting_results']['results']
            assert posting_results['discord']['success'] is True
            assert posting_results['reddit']['success'] is False

            # Verify warning logged
            assert "Partial success" in capture_logs.text

    def test_complete_pipeline_failure(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_alert_manager,
        capture_logs
    ):
        """Test pipeline handles complete failure and alerts"""
        # Make all platforms fail
        for poster in mock_all_posters.values():
            if hasattr(poster, 'post_with_retry'):
                poster.post_with_retry = Mock(return_value={
                    'success': False,
                    'error': 'API error'
                })
            if hasattr(poster, 'post_exploit_alert'):
                poster.post_exploit_alert = Mock(return_value={
                    'success': False,
                    'error': 'API error'
                })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=True
            )
            engine.alert_manager = mock_alert_manager

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD, Platform.REDDIT],
                auto_post=True
            )

            # Should fail completely
            assert result['success'] is False
            assert result.get('partial') is False

            # Verify alert was sent
            mock_alert_manager.send_alert.assert_called()

            # Verify error logged
            assert "Failed to publish" in capture_logs.text

    def test_manual_review_workflow(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test manual review workflow (non-autonomous)"""
        review_callback = Mock(return_value=True)

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
                review_callback=review_callback,
                auto_post=False
            )

            # Verify review callback was called
            review_callback.assert_called_once()

            # Should succeed after approval
            assert result['success'] is True

    def test_review_rejection(
        self,
        sample_exploit,
        mock_social_config,
        capture_logs
    ):
        """Test that rejected posts are not published"""
        review_callback = Mock(return_value=False)

        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[Platform.DISCORD],
            review_callback=review_callback,
            auto_post=False
        )

        # Should fail due to rejection
        assert result['success'] is False
        assert result['reason'] == 'Post rejected during review'
        assert "Post rejected" in capture_logs.text

    def test_statistics_tracking(
        self,
        sample_exploit,
        critical_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test that engine tracks statistics correctly"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            # Process multiple exploits
            engine.process_exploit(sample_exploit, platforms=[Platform.DISCORD], auto_post=True)
            engine.process_exploit(critical_exploit, platforms=[Platform.DISCORD], auto_post=True)

            # Check statistics
            stats = engine.get_stats()
            assert stats['exploits_processed'] == 2
            assert stats['reports_generated'] == 2
            assert stats['posts_published'] == 2
            assert stats['posts_failed'] == 0

    def test_error_handling_and_recovery(
        self,
        sample_exploit,
        mock_social_config,
        mock_metrics,
        capture_logs
    ):
        """Test error handling during processing"""
        # Mock report generator to raise exception
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Analysis failed")

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=sample_exploit,
                auto_post=True
            )

            # Should fail gracefully
            assert result['success'] is False
            assert 'error' in result
            assert "Analysis failed" in result['error']

            # Verify error was tracked in metrics
            mock_metrics['track_api_error'].assert_called()

            # Verify error logged
            assert "Error processing exploit" in capture_logs.text

    def test_multiple_platform_content_generation(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test content is generated for all requested platforms"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.TelegramPoster', return_value=mock_all_posters[Platform.TELEGRAM]), \
             patch('social.poster.XTwitterPoster', return_value=mock_all_posters[Platform.X_TWITTER]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            all_platforms = [Platform.REDDIT, Platform.DISCORD, Platform.TELEGRAM, Platform.X_TWITTER]

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=all_platforms,
                auto_post=True
            )

            # Verify content for all platforms
            post = result['post']
            assert len(post.content) == 4

            for platform in all_platforms:
                assert platform in post.content
                assert post.content[platform] is not None
                assert len(str(post.content[platform])) > 0

    def test_report_format_customization(
        self,
        sample_exploit,
        mock_social_config
    ):
        """Test different report formats produce appropriate output"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        # Test with MEDIUM format (default)
        result = engine.process_exploit(
            exploit=sample_exploit,
            platforms=[],  # No posting
            auto_post=True
        )

        report = result['report']
        assert report.format == ReportFormat.MEDIUM
        assert len(report.executive_summary) > 50  # Should be detailed

    @pytest.mark.parametrize("chain", ["Ethereum", "BSC", "Polygon", "Arbitrum"])
    def test_multi_chain_support(
        self,
        exploit_data_factory,
        mock_social_config,
        mock_all_posters,
        chain
    ):
        """Test pipeline works across multiple chains"""
        exploit = ExploitData(
            tx_hash=f"0x{chain}123456",
            protocol=f"{chain} Protocol",
            chain=chain,
            loss_amount_usd=1_000_000.0,
            exploit_type="Flash Loan",
            timestamp=datetime.utcnow(),
            description=f"Exploit on {chain}",
            recovery_status="Unknown",
            source="Test",
            source_url="https://test.com"
        )

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            result = engine.process_exploit(
                exploit=exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            assert result['success'] is True
            assert result['report'].chain == chain


@pytest.mark.asyncio
class TestPipelinePerformance:
    """Test pipeline performance characteristics"""

    def test_processing_speed(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test that processing completes in reasonable time"""
        import time

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            start_time = time.time()

            result = engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            elapsed_time = time.time() - start_time

            # Should complete in under 5 seconds (mocked)
            assert elapsed_time < 5.0
            assert result['success'] is True

            # Verify duration was recorded
            assert mock_metrics['record_generation_duration'].called

    def test_concurrent_processing(
        self,
        sample_exploit,
        critical_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test handling multiple exploits in sequence"""
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

            # Stats should reflect all processing
            stats = engine.get_stats()
            assert stats['exploits_processed'] == 2
