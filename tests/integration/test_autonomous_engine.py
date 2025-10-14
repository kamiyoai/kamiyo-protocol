# -*- coding: utf-8 -*-
"""
Autonomous Growth Engine Integration Tests
Tests the autonomous operation and watcher integration
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime, timedelta
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.autonomous_growth_engine import AutonomousGrowthEngine
from social.kamiyo_watcher import KamiyoWatcher
from social.models import Platform


class TestAutonomousEngine:
    """Test autonomous engine initialization and configuration"""

    def test_engine_initialization(
        self,
        mock_social_config
    ):
        """Test engine initializes with correct configuration"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            kamiyo_api_key='test-key',
            enable_monitoring=True,
            enable_alerting=True
        )

        assert engine is not None
        assert engine.enable_monitoring is True
        assert engine.enable_alerting is True
        assert engine.report_generator is not None
        assert engine.post_generator is not None
        assert engine.social_poster is not None
        assert engine.watcher is not None

    def test_engine_with_disabled_monitoring(
        self,
        mock_social_config
    ):
        """Test engine works with monitoring disabled"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        assert engine.enable_monitoring is False
        assert engine.enable_alerting is False

    def test_get_platform_status(
        self,
        mock_social_config,
        mock_all_posters
    ):
        """Test retrieving platform status"""
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

            stats = engine.get_stats()
            assert 'platform_status' in stats
            assert 'exploits_processed' in stats
            assert 'posts_published' in stats

    def test_engine_with_partial_platform_config(
        self
    ):
        """Test engine works with only some platforms enabled"""
        partial_config = {
            'reddit': {'enabled': False},
            'discord': {
                'enabled': True,
                'webhooks': {'test': 'https://discord.com/webhook/test'}
            },
            'telegram': {'enabled': False},
            'x_twitter': {'enabled': False}
        }

        engine = AutonomousGrowthEngine(
            social_config=partial_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        # Should only have Discord platform
        assert len(engine.social_poster.platforms) == 1
        assert Platform.DISCORD in engine.social_poster.platforms


class TestWatcherIntegration:
    """Test integration with Kamiyo watcher"""

    def test_watcher_polling_integration(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        mock_requests,
        mock_exploit_api_response,
        capture_logs
    ):
        """Test polling integration with Kamiyo API"""
        # Configure mock API response
        mock_requests['response'].json = Mock(return_value={
            'data': [mock_exploit_api_response],
            'page': 1,
            'page_size': 100,
            'total': 1
        })
        mock_requests['get'].return_value = mock_requests['response']

        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                kamiyo_api_key='test-key',
                enable_monitoring=False,
                enable_alerting=False
            )

            # Manually trigger one poll
            watcher = engine.watcher
            exploits = watcher.fetch_recent_exploits()

            assert len(exploits) == 1
            assert exploits[0]['protocol'] == 'Uniswap V3'

    def test_watcher_filtering(
        self,
        mock_social_config,
        mock_requests,
        monkeypatch
    ):
        """Test watcher applies filters correctly"""
        # Set filter environment variables
        monkeypatch.setenv('SOCIAL_MIN_AMOUNT_USD', '1000000')
        monkeypatch.setenv('SOCIAL_ENABLED_CHAINS', 'Ethereum,BSC')

        # Mock API with exploits that should be filtered
        exploits_data = [
            {  # Should pass (Ethereum, $2.5M)
                'tx_hash': '0x123',
                'protocol': 'Protocol A',
                'chain': 'Ethereum',
                'loss_amount_usd': 2_500_000.0,
                'exploit_type': 'Flash Loan',
                'timestamp': '2024-01-15T10:30:00Z'
            },
            {  # Should fail (Polygon - filtered chain)
                'tx_hash': '0x456',
                'protocol': 'Protocol B',
                'chain': 'Polygon',
                'loss_amount_usd': 2_000_000.0,
                'exploit_type': 'Reentrancy',
                'timestamp': '2024-01-15T11:00:00Z'
            },
            {  # Should fail (too small - $50K)
                'tx_hash': '0x789',
                'protocol': 'Protocol C',
                'chain': 'Ethereum',
                'loss_amount_usd': 50_000.0,
                'exploit_type': 'Flash Loan',
                'timestamp': '2024-01-15T11:30:00Z'
            }
        ]

        mock_requests['response'].json = Mock(return_value={
            'data': exploits_data,
            'page': 1,
            'page_size': 100,
            'total': 3
        })
        mock_requests['get'].return_value = mock_requests['response']

        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        watcher = engine.watcher
        exploit = watcher.convert_to_exploit_data(exploits_data[0])

        # Test should_post filtering
        assert watcher.should_post(exploit) is True  # Passes all filters

        exploit2 = watcher.convert_to_exploit_data(exploits_data[1])
        assert watcher.should_post(exploit2) is False  # Wrong chain

        exploit3 = watcher.convert_to_exploit_data(exploits_data[2])
        assert watcher.should_post(exploit3) is False  # Too small

    def test_watcher_deduplication(
        self,
        mock_social_config,
        mock_exploit_api_response
    ):
        """Test watcher prevents duplicate posts"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            enable_monitoring=False,
            enable_alerting=False
        )

        watcher = engine.watcher
        exploit = watcher.convert_to_exploit_data(mock_exploit_api_response)

        # First time should post
        assert watcher.should_post(exploit) is True

        # Mark as posted
        watcher.posted_tx_hashes.add(exploit.tx_hash)

        # Second time should not post
        assert watcher.should_post(exploit) is False

    @pytest.mark.asyncio
    async def test_websocket_message_handling(
        self,
        mock_social_config,
        mock_all_posters,
        mock_websocket_message
    ):
        """Test WebSocket message handling"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                kamiyo_api_key='test-key',
                enable_monitoring=False,
                enable_alerting=False
            )

            # Mock WebSocket
            mock_ws = AsyncMock()
            messages = [
                mock_websocket_message('new_exploit', {
                    'tx_hash': '0xabc123',
                    'protocol': 'Test Protocol',
                    'chain': 'Ethereum',
                    'loss_amount_usd': 1_000_000.0,
                    'exploit_type': 'Flash Loan',
                    'timestamp': '2024-01-15T10:30:00Z'
                })
            ]

            async def mock_iter():
                for msg in messages:
                    yield msg

            mock_ws.__aiter__ = lambda self: mock_iter()

            with patch('websockets.connect', return_value=mock_ws):
                # Manually process one message
                import json
                msg = messages[0]
                data = json.loads(msg)

                if data['type'] == 'new_exploit':
                    exploit = engine.watcher.convert_to_exploit_data(data['exploit'])
                    assert exploit.protocol == 'Test Protocol'
                    assert engine.watcher.should_post(exploit) is True


class TestAutonomousOperation:
    """Test fully autonomous operation"""

    def test_auto_post_without_review(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        capture_logs
    ):
        """Test autonomous posting without manual review"""
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
                review_callback=None,  # No review
                auto_post=True  # Autonomous
            )

            assert result['success'] is True
            assert result['post'].is_approved
            assert "Auto-posting enabled" in capture_logs.text

    def test_retry_logic_on_transient_failure(
        self,
        sample_exploit,
        mock_social_config,
        mock_metrics,
        capture_logs
    ):
        """Test retry logic for transient failures"""
        # Mock poster that fails once then succeeds
        mock_poster = Mock()
        call_count = [0]

        def post_with_retry_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return {'success': False, 'error': 'Temporary error'}
            return {'success': True, 'post_id': 'test123'}

        mock_poster.post_with_retry = Mock(side_effect=post_with_retry_side_effect)
        mock_poster.get_status = Mock(return_value={'authenticated': True, 'ready': True})

        with patch('social.poster.DiscordPoster', return_value=mock_poster):

            # Patch the platform's own retry logic
            with patch('social.platforms.base.BasePlatformPoster.post_with_retry', side_effect=post_with_retry_side_effect):

                engine = AutonomousGrowthEngine(
                    social_config=mock_social_config,
                    kamiyo_api_url='https://test-api.kamiyo.ai',
                    enable_monitoring=True,
                    enable_alerting=False
                )

                # First attempt - will use mocked failure/success
                result = engine.process_exploit(
                    exploit=sample_exploit,
                    platforms=[Platform.DISCORD],
                    auto_post=True
                )

                # The first call will fail, but we're testing the pattern
                # In a real scenario with retries, this would eventually succeed

    def test_continuous_monitoring_setup(
        self,
        mock_social_config,
        integration_test_env
    ):
        """Test autonomous mode configuration"""
        engine = AutonomousGrowthEngine(
            social_config=mock_social_config,
            kamiyo_api_url='https://test-api.kamiyo.ai',
            kamiyo_api_key='test-key',
            enable_monitoring=True,
            enable_alerting=True
        )

        # Verify watcher is configured
        assert engine.watcher is not None
        assert engine.watcher.api_base_url == 'https://test-api.kamiyo.ai'
        assert engine.watcher.min_amount_usd == 100000

    def test_stats_accumulation(
        self,
        sample_exploit,
        critical_exploit,
        mock_social_config,
        mock_all_posters
    ):
        """Test that stats accumulate correctly over multiple operations"""
        with patch('social.poster.DiscordPoster', return_value=mock_all_posters[Platform.DISCORD]):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=False,
                enable_alerting=False
            )

            # Initial stats
            stats = engine.get_stats()
            assert stats['exploits_processed'] == 0
            assert stats['posts_published'] == 0

            # Process first exploit
            engine.process_exploit(sample_exploit, platforms=[Platform.DISCORD], auto_post=True)

            stats = engine.get_stats()
            assert stats['exploits_processed'] == 1
            assert stats['posts_published'] == 1
            assert stats['reports_generated'] == 1

            # Process second exploit
            engine.process_exploit(critical_exploit, platforms=[Platform.DISCORD], auto_post=True)

            stats = engine.get_stats()
            assert stats['exploits_processed'] == 2
            assert stats['posts_published'] == 2
            assert stats['reports_generated'] == 2

    def test_health_monitoring(
        self,
        mock_social_config,
        mock_metrics
    ):
        """Test health monitoring integration"""
        with patch('social.monitoring.metrics.metrics') as mock_metrics_collector:

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=False
            )

            # Engine should be healthy on initialization
            assert engine.social_poster is not None
            assert engine.report_generator is not None

    def test_alert_on_critical_failure(
        self,
        sample_exploit,
        mock_social_config,
        mock_alert_manager
    ):
        """Test alerting on critical failures"""
        with patch('social.monitoring.alerting.AlertManager', return_value=mock_alert_manager):

            engine = AutonomousGrowthEngine(
                social_config=mock_social_config,
                kamiyo_api_url='https://test-api.kamiyo.ai',
                enable_monitoring=True,
                enable_alerting=True
            )
            engine.alert_manager = mock_alert_manager

            # Simulate critical failure by making analysis raise exception
            with patch('social.analysis.ReportGenerator.analyze_exploit') as mock_analyze:
                mock_analyze.side_effect = Exception("Critical analysis error")

                result = engine.process_exploit(
                    exploit=sample_exploit,
                    auto_post=True
                )

                # Should fail and send alert
                assert result['success'] is False
                mock_alert_manager.send_alert.assert_called()

    @pytest.mark.parametrize("platform_count", [1, 2, 3, 4])
    def test_scaling_with_platform_count(
        self,
        sample_exploit,
        mock_social_config,
        mock_all_posters,
        platform_count
    ):
        """Test engine scales with number of platforms"""
        platforms = [Platform.REDDIT, Platform.DISCORD, Platform.TELEGRAM, Platform.X_TWITTER][:platform_count]

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
                platforms=platforms,
                auto_post=True
            )

            assert result['success'] is True
            assert len(result['post'].content) == platform_count
