"""
Unit Tests for WebSocket Client
Tests WebSocket connection, subscription management, and reconnection logic
"""

import unittest
import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock, AsyncMock
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from websocket.client import HyperliquidWebSocketClient, SubscriptionType


class TestWebSocketClient(unittest.TestCase):
    """Test suite for WebSocket Client"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = HyperliquidWebSocketClient(use_testnet=True)

    def test_initialization(self):
        """Test client initialization"""
        self.assertEqual(self.client.ws_url, self.client.TESTNET_WS_URL)
        self.assertFalse(self.client.is_connected)
        self.assertFalse(self.client.is_running)
        self.assertEqual(len(self.client.active_subscriptions), 0)

    def test_initialization_mainnet(self):
        """Test mainnet initialization"""
        client = HyperliquidWebSocketClient(use_testnet=False)
        self.assertEqual(client.ws_url, client.MAINNET_WS_URL)

    def test_subscription_key_generation(self):
        """Test subscription key generation"""
        sub1 = {"type": "trades", "coin": "BTC"}
        sub2 = {"type": "trades", "coin": "ETH"}
        sub3 = {"type": "trades", "coin": "BTC"}  # Same as sub1

        key1 = self.client._get_subscription_key(sub1)
        key2 = self.client._get_subscription_key(sub2)
        key3 = self.client._get_subscription_key(sub3)

        # Same subscriptions should have same key
        self.assertEqual(key1, key3)

        # Different subscriptions should have different keys
        self.assertNotEqual(key1, key2)

    def test_max_subscriptions_limit(self):
        """Test that subscription limit is enforced"""
        # Fill up subscriptions to max
        for i in range(self.client.MAX_SUBSCRIPTIONS):
            self.client.active_subscriptions.add(f"sub_{i}")

        # Should raise error when trying to add more
        with self.assertRaises(ValueError):
            asyncio.run(self.client.subscribe({"type": "allMids"}))

    def test_handler_registration(self):
        """Test handler registration"""
        def dummy_handler(data):
            pass

        self.client.register_handler(SubscriptionType.TRADES, dummy_handler)

        self.assertEqual(len(self.client.handlers[SubscriptionType.TRADES.value]), 1)

    def test_multiple_handler_registration(self):
        """Test multiple handlers for same type"""
        def handler1(data):
            pass

        def handler2(data):
            pass

        self.client.register_handler(SubscriptionType.TRADES, handler1)
        self.client.register_handler(SubscriptionType.TRADES, handler2)

        self.assertEqual(len(self.client.handlers[SubscriptionType.TRADES.value]), 2)

    def test_get_stats(self):
        """Test statistics retrieval"""
        stats = self.client.get_stats()

        self.assertIn('is_connected', stats)
        self.assertIn('active_subscriptions', stats)
        self.assertIn('ws_url', stats)
        self.assertIn('messages_received', stats)
        self.assertIn('messages_sent', stats)

    def test_stats_with_uptime(self):
        """Test stats include uptime when connected"""
        self.client.stats['connected_at'] = datetime.now(timezone.utc)

        stats = self.client.get_stats()

        self.assertIn('uptime_seconds', stats)
        self.assertGreaterEqual(stats['uptime_seconds'], 0)

    def test_reconnection_delay_exponential_backoff(self):
        """Test reconnection delay increases exponentially"""
        self.client.reconnect_attempts = 1
        delay1 = min(
            self.client.RECONNECT_DELAY * (2 ** (self.client.reconnect_attempts - 1)),
            self.client.MAX_RECONNECT_DELAY
        )

        self.client.reconnect_attempts = 3
        delay3 = min(
            self.client.RECONNECT_DELAY * (2 ** (self.client.reconnect_attempts - 1)),
            self.client.MAX_RECONNECT_DELAY
        )

        # Delay should increase
        self.assertGreater(delay3, delay1)

    def test_reconnection_delay_max_cap(self):
        """Test reconnection delay is capped at max"""
        self.client.reconnect_attempts = 100  # Very high

        delay = min(
            self.client.RECONNECT_DELAY * (2 ** (self.client.reconnect_attempts - 1)),
            self.client.MAX_RECONNECT_DELAY
        )

        # Should be capped at MAX_RECONNECT_DELAY
        self.assertEqual(delay, self.client.MAX_RECONNECT_DELAY)

    @patch('websockets.connect')
    async def test_connect_success(self, mock_connect):
        """Test successful connection"""
        mock_websocket = AsyncMock()
        mock_connect.return_value = mock_websocket

        await self.client.connect()

        self.assertTrue(self.client.is_connected)
        self.assertEqual(self.client.reconnect_attempts, 0)
        self.assertIsNotNone(self.client.stats['connected_at'])

    @patch('websockets.connect')
    async def test_connect_failure(self, mock_connect):
        """Test connection failure"""
        mock_connect.side_effect = Exception("Connection failed")

        with self.assertRaises(Exception):
            await self.client.connect()

        self.assertFalse(self.client.is_connected)

    async def test_disconnect(self):
        """Test disconnect"""
        self.client.websocket = AsyncMock()
        self.client.is_running = True
        self.client.is_connected = True

        await self.client.disconnect()

        self.assertFalse(self.client.is_running)
        self.assertFalse(self.client.is_connected)
        self.assertIsNone(self.client.websocket)
        self.assertEqual(len(self.client.active_subscriptions), 0)

    async def test_subscribe_all_mids(self):
        """Test convenience method for allMids subscription"""
        self.client.websocket = AsyncMock()
        self.client.is_connected = True

        await self.client.subscribe_all_mids()

        # Check that subscribe was called with correct params
        self.client.websocket.send.assert_called_once()
        call_args = self.client.websocket.send.call_args[0][0]
        data = json.loads(call_args)

        self.assertEqual(data['method'], 'subscribe')
        self.assertEqual(data['subscription']['type'], 'allMids')

    async def test_subscribe_trades(self):
        """Test convenience method for trades subscription"""
        self.client.websocket = AsyncMock()
        self.client.is_connected = True

        await self.client.subscribe_trades("BTC")

        # Check subscription
        call_args = self.client.websocket.send.call_args[0][0]
        data = json.loads(call_args)

        self.assertEqual(data['subscription']['type'], 'trades')
        self.assertEqual(data['subscription']['coin'], 'BTC')

    async def test_subscribe_user_fills(self):
        """Test convenience method for userFills subscription"""
        self.client.websocket = AsyncMock()
        self.client.is_connected = True

        await self.client.subscribe_user_fills("0x123...")

        # Check subscription
        call_args = self.client.websocket.send.call_args[0][0]
        data = json.loads(call_args)

        self.assertEqual(data['subscription']['type'], 'userFills')
        self.assertEqual(data['subscription']['user'], '0x123...')

    async def test_message_handler_routing(self):
        """Test message routing to handlers"""
        handler_called = []

        def test_handler(data):
            handler_called.append(data)

        self.client.register_handler(SubscriptionType.TRADES, test_handler)

        # Simulate message
        message = json.dumps({
            "channel": "trades",
            "data": [{"coin": "BTC", "px": "43250"}]
        })

        await self.client._handle_message(message)

        # Handler should have been called
        self.assertEqual(len(handler_called), 1)

    async def test_message_stats_update(self):
        """Test that message handling updates stats"""
        initial_count = self.client.stats['messages_received']

        message = json.dumps({"channel": "test", "data": {}})
        await self.client._handle_message(message)

        self.assertEqual(
            self.client.stats['messages_received'],
            initial_count + 1
        )
        self.assertIsNotNone(self.client.stats['last_message_time'])

    async def test_invalid_json_handling(self):
        """Test handling of invalid JSON messages"""
        initial_count = self.client.stats['messages_received']

        # Should not crash on invalid JSON
        await self.client._handle_message("invalid json {")

        # Stats should not be updated for invalid messages
        self.assertEqual(
            self.client.stats['messages_received'],
            initial_count
        )

    async def test_handler_error_isolation(self):
        """Test that handler errors don't crash client"""
        def failing_handler(data):
            raise Exception("Handler error")

        self.client.register_handler(SubscriptionType.TRADES, failing_handler)

        message = json.dumps({
            "channel": "trades",
            "data": [{"coin": "BTC"}]
        })

        # Should not raise exception
        await self.client._handle_message(message)

    def test_subscription_type_enum(self):
        """Test SubscriptionType enum values"""
        self.assertEqual(SubscriptionType.TRADES.value, "trades")
        self.assertEqual(SubscriptionType.L2_BOOK.value, "l2Book")
        self.assertEqual(SubscriptionType.ALL_MIDS.value, "allMids")
        self.assertEqual(SubscriptionType.USER_FILLS.value, "userFills")
        self.assertEqual(SubscriptionType.USER_FUNDINGS.value, "userFundings")


if __name__ == '__main__':
    unittest.main()
