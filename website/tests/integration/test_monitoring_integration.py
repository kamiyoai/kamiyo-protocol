# -*- coding: utf-8 -*-
"""
Monitoring Integration Tests
Tests metrics, logging, and alerting integration
"""

import pytest
from unittest.mock import Mock, patch, MagicMock, call
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.autonomous_growth_engine import AutonomousGrowthEngine
from social.models import Platform
from social.monitoring.alerting import AlertSeverity, Alert


class TestMetricsIntegration:
    """Test Prometheus metrics integration"""

    def test_metrics_tracked_on_successful_post(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test metrics are tracked when post succeeds"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify metrics were called
            assert mock_metrics['track_post'].called
            mock_metrics['track_post'].assert_called_with('discord', 'success')

    def test_metrics_tracked_on_failed_post(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test metrics are tracked when post fails"""
        # Make Discord fail
        mock_all_posters[Platform.DISCORD].post_exploit_alert = Mock(return_value={
            'success': False,
            'error': 'API error'
        })

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify failure was tracked
            assert mock_metrics['track_post'].called
            mock_metrics['track_post'].assert_called_with('discord', 'failure')

    def test_generation_duration_tracked(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test report generation duration is tracked"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify duration was recorded
            assert mock_metrics['record_generation_duration'].called
            call_args = mock_metrics['record_generation_duration'].call_args
            assert call_args[0][0] == 'report_analysis'
            assert isinstance(call_args[0][1], float)  # Duration in seconds

    def test_error_metrics_on_exception(
        self,
        sample_exploit,
        mock_social_config,
        mock_metrics
    ):
        """Test error metrics when exception occurs"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = ValueError("Test error")

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                auto_post=True
            )

            # Verify error was tracked
            assert mock_metrics['track_api_error'].called
            mock_metrics['track_api_error'].assert_called_with('processing_pipeline', 'ValueError')

    def test_metrics_across_multiple_platforms(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test metrics tracked for each platform"""
        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.REDDIT, Platform.DISCORD],
                auto_post=True
            )

            # Verify both platforms tracked
            calls = mock_metrics['track_post'].call_args_list
            platform_names = [call[0][0] for call in calls]

            assert 'reddit' in platform_names
            assert 'discord' in platform_names


class TestStructuredLogging:
    """Test structured logging integration"""

    def test_logs_contain_structured_data(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test logs contain structured contextual data"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Check logs contain key information
            log_text = capture_logs.text

            assert sample_exploit.protocol in log_text
            assert sample_exploit.chain in log_text
            assert "Processing exploit" in log_text
            assert "Successfully published" in log_text

    def test_error_logs_include_details(
        self,
        sample_exploit,
        mock_social_config,
        capture_logs
    ):
        """Test error logs include exception details"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Test error message")

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                auto_post=True
            )

            # Check error was logged with details
            log_text = capture_logs.text

            assert "Error processing exploit" in log_text
            assert "Test error message" in log_text

    def test_log_levels_appropriate(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test appropriate log levels are used"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Should have INFO level logs for success
            assert any(record.levelname == 'INFO' for record in capture_logs.records)

    def test_partial_failure_warning_logged(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test partial failures log warnings"""
        # Make Reddit fail
        mock_all_posters[Platform.REDDIT].post_with_retry = Mock(return_value={
            'success': False,
            'error': 'API error'
        })

        with patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]), \
             patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.REDDIT, Platform.DISCORD],
                auto_post=True
            )

            # Should have WARNING for partial failure
            assert any(record.levelname == 'WARNING' for record in capture_logs.records)
            assert "Partial success" in capture_logs.text


class TestAlertingIntegration:
    """Test alerting system integration"""

    def test_alert_on_complete_failure(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_alert_manager
    ):
        """Test alert sent when all platforms fail"""
        # Make all platforms fail
        for poster in mock_all_posters.values():
            if hasattr(poster, 'post_with_retry'):
                poster.post_with_retry = Mock(return_value={'success': False, 'error': 'Error'})
            if hasattr(poster, 'post_exploit_alert'):
                poster.post_exploit_alert = Mock(return_value={'success': False, 'error': 'Error'})

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=True
            )
            engine.alert_manager = mock_alert_manager

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify alert was sent
            assert mock_alert_manager.send_alert.called

            # Check alert details
            alert_call = mock_alert_manager.send_alert.call_args[0][0]
            assert sample_exploit.protocol in alert_call.title or \
                   sample_exploit.protocol in alert_call.message

    def test_alert_on_processing_error(
        self,
        sample_exploit,
        mock_social_config,
        mock_alert_manager
    ):
        """Test alert sent when processing errors occur"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Critical error")

            with patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

                engine = AutonomousGrowthEngine(
                    social_config=mock_social_config,
                    kamiyo_api_url='https://test-api.kamiyo.ai',
                    enable_monitoring=True,
                    enable_alerting=True
                )
                engine.alert_manager = mock_alert_manager

                engine.process_exploit(
                    exploit=sample_exploit,
                    auto_post=True
                )

                # Verify alert was sent
                assert mock_alert_manager.send_alert.called

    def test_no_alert_on_success(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_alert_manager
    ):
        """Test no alert sent on successful operation"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=True
            )
            engine.alert_manager = mock_alert_manager

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Should not send alert on success
            assert not mock_alert_manager.send_alert.called

    def test_alert_includes_context(
        self,
        sample_exploit,
        mock_social_config,
        mock_alert_manager
    ):
        """Test alerts include contextual information"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Test error")

            with patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

                engine = AutonomousGrowthEngine(
                    social_config=mock_social_config,
                    kamiyo_api_url='https://test-api.kamiyo.ai',
                    enable_monitoring=True,
                    enable_alerting=True
                )
                engine.alert_manager = mock_alert_manager

                engine.process_exploit(
                    exploit=sample_exploit,
                    auto_post=True
                )

                # Check alert has context
                alert_call = mock_alert_manager.send_alert.call_args[0][0]
                assert alert_call.details is not None
                assert 'exploit_tx' in alert_call.details


class TestMonitoringWithDisabled:
    """Test behavior when monitoring is disabled"""

    def test_metrics_not_tracked_when_disabled(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test metrics not tracked when monitoring disabled"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,  # Disabled
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Metrics should not be tracked
            assert not mock_metrics['record_generation_duration'].called

    def test_alerts_not_sent_when_disabled(
        self,
        sample_exploit,
        mock_social_config,
        mock_alert_manager
    ):
        """Test alerts not sent when alerting disabled"""
        with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
            mock_analyze.side_effect = Exception("Error")

            with patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

                engine = AutonomousGrowthEngine(
                    social_config=mock_social_config,
                    kamiyo_api_url='https://test-api.kamiyo.ai',
                    enable_monitoring=True,
                    enable_alerting=False  # Disabled
                )

                engine.process_exploit(
                    exploit=sample_exploit,
                    auto_post=True
                )

                # Alert should not be sent
                assert not mock_alert_manager.send_alert.called


class TestHealthChecks:
    """Test health check integration"""

    def test_engine_reports_healthy_state(
        self,
        mock_social_config,
        mock_all_posters
    ):
        """Test engine reports healthy when operational"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=True
            )

            stats = engine.get_stats()

            # Should have platform status
            assert 'platform_status' in stats

            # Platforms should be ready
            for status in stats['platform_status'].values():
                assert status['ready'] is True

    def test_platform_health_status(
        self,
        mock_social_config,
        mock_all_posters
    ):
        """Test individual platform health status"""
        # Make one platform unhealthy
        mock_all_posters[Platform.DISCORD].get_status = Mock(return_value={
            'authenticated': False,
            'ready': False,
            'error': 'Authentication failed'
        })

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]), \
             patch('social.poster.RedditPoster', return_value=mock_all_posters[Platform.REDDIT]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            stats = engine.get_stats()
            status = stats['platform_status']

            # Discord should be unhealthy
            assert status['discord']['ready'] is False

            # Reddit should be healthy
            assert status['reddit']['ready'] is True


class TestPerformanceMetrics:
    """Test performance metric collection"""

    def test_processing_time_recorded(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test processing time is recorded"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            engine.process_exploit(
                exploit=sample_exploit,
                platforms=[Platform.DISCORD],
                auto_post=True
            )

            # Verify duration metrics called
            assert mock_metrics['record_generation_duration'].called

    def test_metrics_for_multiple_operations(
        self,
        sample_exploit,
        critical_exploit,
        mock_social_config,
        mock_all_posters,
        mock_metrics
    ):
        """Test metrics accumulate across multiple operations"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            # Process multiple exploits
            engine.process_exploit(sample_exploit, platforms=[Platform.DISCORD], auto_post=True)
            engine.process_exploit(critical_exploit, platforms=[Platform.DISCORD], auto_post=True)

            # Metrics should be called multiple times
            assert mock_metrics['track_post'].call_count >= 2
            assert mock_metrics['record_generation_duration'].call_count >= 2
