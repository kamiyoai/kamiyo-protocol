# -*- coding: utf-8 -*-
"""
Test Kamiyo Watcher
Tests for API polling, WebSocket handling, and filtering logic
"""

import pytest
import asyncio
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from datetime import datetime, timedelta
import json
from social.models import ExploitData, Platform
from social.kamiyo_watcher import KamiyoWatcher


class TestKamiyoWatcher:
    """Test KamiyoWatcher class"""

    @pytest.fixture
    def mock_social_poster(self):
        """Create mock social poster"""
        poster = Mock()
        poster.platforms = {Platform.DISCORD: Mock()}
        poster.process_exploit = Mock(return_value={
            'success': True,
            'posting_results': {'results': {}}
        })
        return poster

    @pytest.fixture
    def watcher(self, mock_social_poster):
        """Create KamiyoWatcher instance"""
        return KamiyoWatcher(
            api_base_url='https://api.kamiyo.ai',
            social_poster=mock_social_poster,
            api_key='test_key',
            websocket_url='wss://api.kamiyo.ai/ws'
        )

    @pytest.fixture
    def sample_api_exploit(self):
        """Create sample API exploit response"""
        return {
            'tx_hash': '0xabc123',
            'protocol': 'Uniswap',
            'chain': 'Ethereum',
            'loss_amount_usd': 2_500_000.0,
            'exploit_type': 'Flash Loan',
            'timestamp': '2024-01-15T10:30:00Z',
            'description': 'Test exploit',
            'recovery_status': 'Unknown',
            'source': 'Rekt News',
            'source_url': 'https://rekt.news/test'
        }


class TestInitialization(TestKamiyoWatcher):
    """Test watcher initialization"""

    def test_initialization(self, watcher):
        """Test basic initialization"""
        assert watcher.api_base_url == 'https://api.kamiyo.ai'
        assert watcher.websocket_url == 'wss://api.kamiyo.ai/ws'
        assert watcher.api_key == 'test_key'
        assert 'Authorization' in watcher.headers
        assert watcher.headers['Authorization'] == 'Bearer test_key'

    def test_initialization_without_api_key(self, mock_social_poster):
        """Test initialization without API key"""
        watcher = KamiyoWatcher(
            api_base_url='https://api.kamiyo.ai',
            social_poster=mock_social_poster
        )

        assert 'Authorization' not in watcher.headers

    def test_initialization_strips_trailing_slash(self, mock_social_poster):
        """Test that trailing slash is removed from base URL"""
        watcher = KamiyoWatcher(
            api_base_url='https://api.kamiyo.ai/',
            social_poster=mock_social_poster
        )

        assert watcher.api_base_url == 'https://api.kamiyo.ai'

    @patch.dict('os.environ', {'SOCIAL_MIN_AMOUNT_USD': '500000'})
    def test_initialization_custom_min_amount(self, mock_social_poster):
        """Test initialization with custom minimum amount"""
        watcher = KamiyoWatcher(
            api_base_url='https://api.kamiyo.ai',
            social_poster=mock_social_poster
        )

        assert watcher.min_amount_usd == 500000.0

    @patch.dict('os.environ', {'SOCIAL_ENABLED_CHAINS': 'Ethereum,BSC,Polygon'})
    def test_initialization_chain_filter(self, mock_social_poster):
        """Test initialization with chain filter"""
        watcher = KamiyoWatcher(
            api_base_url='https://api.kamiyo.ai',
            social_poster=mock_social_poster
        )

        assert watcher.enabled_chains == ['Ethereum', 'BSC', 'Polygon']


class TestAPIFetching(TestKamiyoWatcher):
    """Test API fetching functionality"""

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_success(
        self, mock_get, watcher, sample_api_exploit
    ):
        """Test successfully fetching exploits from API"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'data': [sample_api_exploit]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        exploits = watcher.fetch_recent_exploits()

        assert len(exploits) == 1
        assert exploits[0]['protocol'] == 'Uniswap'
        mock_get.assert_called_once()

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_with_since(
        self, mock_get, watcher, sample_api_exploit
    ):
        """Test fetching exploits with since parameter"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'data': [sample_api_exploit]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        since = datetime.utcnow() - timedelta(hours=1)
        exploits = watcher.fetch_recent_exploits(since=since)

        # Should filter based on timestamp
        assert isinstance(exploits, list)

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_api_error(self, mock_get, watcher):
        """Test handling API errors"""
        mock_get.side_effect = Exception("API Error")

        exploits = watcher.fetch_recent_exploits()

        assert exploits == []

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_with_chain_filter(
        self, mock_get, watcher, sample_api_exploit
    ):
        """Test fetching with chain filter"""
        watcher.enabled_chains = ['Ethereum']

        mock_response = Mock()
        bsc_exploit = sample_api_exploit.copy()
        bsc_exploit['chain'] = 'BSC'

        mock_response.json.return_value = {
            'data': [sample_api_exploit, bsc_exploit]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        exploits = watcher.fetch_recent_exploits()

        # Should only return Ethereum exploit
        assert len(exploits) == 1
        assert exploits[0]['chain'] == 'Ethereum'

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_sends_api_key(self, mock_get, watcher):
        """Test that API key is sent in headers"""
        mock_response = Mock()
        mock_response.json.return_value = {'data': []}
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        watcher.fetch_recent_exploits()

        call_args = mock_get.call_args
        assert 'headers' in call_args.kwargs
        assert call_args.kwargs['headers']['Authorization'] == 'Bearer test_key'

    @patch('social.kamiyo_watcher.requests.get')
    def test_fetch_recent_exploits_min_amount_param(self, mock_get, watcher):
        """Test that minimum amount is sent as parameter"""
        mock_response = Mock()
        mock_response.json.return_value = {'data': []}
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        watcher.fetch_recent_exploits()

        call_args = mock_get.call_args
        assert 'params' in call_args.kwargs
        assert 'min_amount' in call_args.kwargs['params']


class TestDataConversion(TestKamiyoWatcher):
    """Test converting API data to ExploitData model"""

    def test_convert_to_exploit_data(self, watcher, sample_api_exploit):
        """Test converting API response to ExploitData"""
        exploit = watcher.convert_to_exploit_data(sample_api_exploit)

        assert isinstance(exploit, ExploitData)
        assert exploit.tx_hash == '0xabc123'
        assert exploit.protocol == 'Uniswap'
        assert exploit.chain == 'Ethereum'
        assert exploit.loss_amount_usd == 2_500_000.0
        assert exploit.exploit_type == 'Flash Loan'

    def test_convert_to_exploit_data_timestamp(self, watcher, sample_api_exploit):
        """Test timestamp conversion"""
        exploit = watcher.convert_to_exploit_data(sample_api_exploit)

        assert isinstance(exploit.timestamp, datetime)

    def test_convert_to_exploit_data_optional_fields(
        self, watcher, sample_api_exploit
    ):
        """Test converting with optional fields"""
        exploit = watcher.convert_to_exploit_data(sample_api_exploit)

        assert exploit.description == 'Test exploit'
        assert exploit.recovery_status == 'Unknown'
        assert exploit.source == 'Rekt News'
        assert exploit.source_url == 'https://rekt.news/test'


class TestFiltering(TestKamiyoWatcher):
    """Test exploit filtering logic"""

    def test_should_post_new_exploit(self, watcher):
        """Test that new exploit should be posted"""
        exploit = ExploitData(
            tx_hash='0x123',
            protocol='Test',
            chain='Ethereum',
            loss_amount_usd=1_000_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )

        assert watcher.should_post(exploit) is True

    def test_should_post_already_posted(self, watcher):
        """Test that already-posted exploit is skipped"""
        exploit = ExploitData(
            tx_hash='0x123',
            protocol='Test',
            chain='Ethereum',
            loss_amount_usd=1_000_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )

        watcher.posted_tx_hashes.add('0x123')

        assert watcher.should_post(exploit) is False

    def test_should_post_below_minimum_amount(self, watcher):
        """Test that low-value exploit is skipped"""
        watcher.min_amount_usd = 100_000.0

        exploit = ExploitData(
            tx_hash='0x123',
            protocol='Test',
            chain='Ethereum',
            loss_amount_usd=50_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )

        assert watcher.should_post(exploit) is False

    def test_should_post_chain_filter_match(self, watcher):
        """Test chain filter allows matching chain"""
        watcher.enabled_chains = ['Ethereum', 'BSC']

        exploit = ExploitData(
            tx_hash='0x123',
            protocol='Test',
            chain='Ethereum',
            loss_amount_usd=1_000_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )

        assert watcher.should_post(exploit) is True

    def test_should_post_chain_filter_no_match(self, watcher):
        """Test chain filter blocks non-matching chain"""
        watcher.enabled_chains = ['Ethereum', 'BSC']

        exploit = ExploitData(
            tx_hash='0x123',
            protocol='Test',
            chain='Polygon',
            loss_amount_usd=1_000_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )

        assert watcher.should_post(exploit) is False


class TestPolling(TestKamiyoWatcher):
    """Test polling functionality"""

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    def test_poll_and_post_no_exploits(
        self, mock_fetch, mock_sleep, watcher, mock_social_poster
    ):
        """Test polling when no new exploits"""
        mock_fetch.return_value = []
        mock_sleep.side_effect = KeyboardInterrupt()  # Stop after first iteration

        try:
            watcher.poll_and_post(interval=10)
        except KeyboardInterrupt:
            pass

        mock_fetch.assert_called_once()
        mock_social_poster.process_exploit.assert_not_called()

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    def test_poll_and_post_with_exploit(
        self, mock_should_post, mock_convert, mock_fetch, mock_sleep,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test polling and posting new exploit"""
        mock_fetch.return_value = [sample_api_exploit]
        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = True
        mock_social_poster.process_exploit.return_value = {
            'success': True,
            'posting_results': {'results': {'discord': {'success': True}}}
        }
        mock_sleep.side_effect = KeyboardInterrupt()

        try:
            watcher.poll_and_post(interval=10)
        except KeyboardInterrupt:
            pass

        mock_social_poster.process_exploit.assert_called_once()
        assert '0xabc123' in watcher.posted_tx_hashes

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    def test_poll_and_post_filtered_exploit(
        self, mock_should_post, mock_convert, mock_fetch, mock_sleep,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test that filtered exploits are not posted"""
        mock_fetch.return_value = [sample_api_exploit]
        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = False
        mock_sleep.side_effect = KeyboardInterrupt()

        try:
            watcher.poll_and_post(interval=10)
        except KeyboardInterrupt:
            pass

        mock_social_poster.process_exploit.assert_not_called()

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    def test_poll_and_post_handles_errors(
        self, mock_fetch, mock_sleep, watcher, mock_social_poster
    ):
        """Test that polling continues after errors"""
        mock_fetch.side_effect = [Exception("Test error"), KeyboardInterrupt()]
        mock_sleep.return_value = None

        try:
            watcher.poll_and_post(interval=10)
        except KeyboardInterrupt:
            pass

        # Should have attempted twice (once failed, once interrupted)
        assert mock_fetch.call_count == 2


class TestWebSocket(TestKamiyoWatcher):
    """Test WebSocket functionality"""

    @pytest.mark.asyncio
    async def test_watch_websocket_no_url(self, watcher):
        """Test WebSocket watching without URL configured"""
        watcher.websocket_url = None

        await watcher.watch_websocket()

        # Should return early without error

    @pytest.mark.asyncio
    @patch('social.kamiyo_watcher.websockets.connect')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    async def test_watch_websocket_new_exploit(
        self, mock_should_post, mock_convert, mock_websocket,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test WebSocket handling new exploit"""
        # Create mock WebSocket
        mock_ws = AsyncMock()
        mock_message = json.dumps({
            'type': 'new_exploit',
            'exploit': sample_api_exploit
        })

        async def mock_iter():
            yield mock_message
            raise KeyboardInterrupt()

        mock_ws.__aiter__.return_value = mock_iter()
        mock_websocket.return_value.__aenter__.return_value = mock_ws

        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = True
        mock_social_poster.process_exploit.return_value = {
            'success': True,
            'posting_results': {'results': {}}
        }

        try:
            await watcher.watch_websocket()
        except KeyboardInterrupt:
            pass

        mock_social_poster.process_exploit.assert_called_once()

    @pytest.mark.asyncio
    @patch('social.kamiyo_watcher.websockets.connect')
    async def test_watch_websocket_invalid_json(
        self, mock_websocket, watcher, mock_social_poster
    ):
        """Test WebSocket handling invalid JSON"""
        mock_ws = AsyncMock()

        async def mock_iter():
            yield "invalid json"
            raise KeyboardInterrupt()

        mock_ws.__aiter__.return_value = mock_iter()
        mock_websocket.return_value.__aenter__.return_value = mock_ws

        try:
            await watcher.watch_websocket()
        except KeyboardInterrupt:
            pass

        # Should handle error gracefully
        mock_social_poster.process_exploit.assert_not_called()

    @pytest.mark.asyncio
    @patch('social.kamiyo_watcher.websockets.connect')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    async def test_watch_websocket_filtered_exploit(
        self, mock_should_post, mock_convert, mock_websocket,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test WebSocket with filtered exploit"""
        mock_ws = AsyncMock()
        mock_message = json.dumps({
            'type': 'new_exploit',
            'exploit': sample_api_exploit
        })

        async def mock_iter():
            yield mock_message
            raise KeyboardInterrupt()

        mock_ws.__aiter__.return_value = mock_iter()
        mock_websocket.return_value.__aenter__.return_value = mock_ws

        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = False

        try:
            await watcher.watch_websocket()
        except KeyboardInterrupt:
            pass

        mock_social_poster.process_exploit.assert_not_called()

    @pytest.mark.asyncio
    @patch('social.kamiyo_watcher.websockets.connect')
    @patch('social.kamiyo_watcher.asyncio.sleep')
    async def test_watch_websocket_reconnect_on_error(
        self, mock_sleep, mock_websocket, watcher
    ):
        """Test WebSocket reconnects after connection error"""
        mock_sleep.side_effect = KeyboardInterrupt()
        mock_websocket.side_effect = Exception("Connection error")

        try:
            await watcher.watch_websocket()
        except KeyboardInterrupt:
            pass

        # Should have attempted to reconnect
        mock_sleep.assert_called()


class TestReviewCallback(TestKamiyoWatcher):
    """Test review callback functionality"""

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    def test_poll_with_review_callback(
        self, mock_should_post, mock_convert, mock_fetch, mock_sleep,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test polling with review callback"""
        mock_fetch.return_value = [sample_api_exploit]
        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = True
        mock_social_poster.process_exploit.return_value = {
            'success': True,
            'posting_results': {'results': {}}
        }
        mock_sleep.side_effect = KeyboardInterrupt()

        review_callback = Mock(return_value=True)

        try:
            watcher.poll_and_post(interval=10, review_callback=review_callback)
        except KeyboardInterrupt:
            pass

        # Should pass review_callback to process_exploit
        call_args = mock_social_poster.process_exploit.call_args
        assert call_args.kwargs.get('review_callback') == review_callback

    @patch('social.kamiyo_watcher.time.sleep')
    @patch.object(KamiyoWatcher, 'fetch_recent_exploits')
    @patch.object(KamiyoWatcher, 'convert_to_exploit_data')
    @patch.object(KamiyoWatcher, 'should_post')
    def test_poll_without_review_callback_auto_posts(
        self, mock_should_post, mock_convert, mock_fetch, mock_sleep,
        watcher, mock_social_poster, sample_api_exploit
    ):
        """Test polling without review callback auto-posts"""
        mock_fetch.return_value = [sample_api_exploit]
        exploit = ExploitData(
            tx_hash='0xabc123',
            protocol='Uniswap',
            chain='Ethereum',
            loss_amount_usd=2_500_000.0,
            exploit_type='Flash Loan',
            timestamp=datetime.utcnow()
        )
        mock_convert.return_value = exploit
        mock_should_post.return_value = True
        mock_social_poster.process_exploit.return_value = {
            'success': True,
            'posting_results': {'results': {}}
        }
        mock_sleep.side_effect = KeyboardInterrupt()

        try:
            watcher.poll_and_post(interval=10)
        except KeyboardInterrupt:
            pass

        # Should set auto_post=True
        call_args = mock_social_poster.process_exploit.call_args
        assert call_args.kwargs.get('auto_post') is True
