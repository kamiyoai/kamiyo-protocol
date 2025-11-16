"""
Hyperliquid WebSocket Client
Real-time monitoring client for Hyperliquid security events
"""

import asyncio
import json
import logging
import os
import signal
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, Callable, List, Set
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from websocket.circuit_breaker import CircuitBreaker
from websocket.message_buffer import MessageBuffer

logger = logging.getLogger(__name__)


class SubscriptionType(Enum):
    """Supported WebSocket subscription types"""
    TRADES = "trades"
    L2_BOOK = "l2Book"
    CANDLE = "candle"
    ALL_MIDS = "allMids"
    USER_FILLS = "userFills"
    USER_FUNDINGS = "userFundings"
    NOTIFICATION = "notification"
    WEB_DATA_2 = "webData2"


class HyperliquidWebSocketClient:
    """
    WebSocket client for real-time Hyperliquid monitoring

    Features:
    - Automatic reconnection with exponential backoff
    - Multiple subscription support
    - Message routing to handlers
    - Connection health monitoring
    - Integration with alert system
    """

    MAINNET_WS_URL = "wss://api.hyperliquid.xyz/ws"
    TESTNET_WS_URL = "wss://api.hyperliquid-testnet.xyz/ws"

    MAX_SUBSCRIPTIONS = 1000  # Hyperliquid limit per IP
    RECONNECT_DELAY = 5  # seconds
    MAX_RECONNECT_DELAY = 300  # 5 minutes max
    PING_INTERVAL = 30  # seconds
    PING_TIMEOUT = 10  # seconds

    def __init__(
        self,
        use_testnet: bool = False,
        enable_auto_reconnect: bool = True,
        subscriptions: Optional[List[Dict[str, Any]]] = None
    ):
        """
        Initialize WebSocket client

        Args:
            use_testnet: Whether to use testnet instead of mainnet
            enable_auto_reconnect: Enable automatic reconnection
            subscriptions: Initial subscriptions to create
        """
        self.ws_url = self.TESTNET_WS_URL if use_testnet else self.MAINNET_WS_URL
        self.enable_auto_reconnect = enable_auto_reconnect
        self.initial_subscriptions = subscriptions or []

        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.is_running = False
        self.reconnect_attempts = 0
        self.active_subscriptions: Set[str] = set()

        # Message handlers by subscription type
        self.handlers: Dict[str, List[Callable]] = {
            sub_type.value: [] for sub_type in SubscriptionType
        }

        self.circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=2
        )
        self.message_buffer = MessageBuffer(maxsize=10000)
        self.shutdown_event = asyncio.Event()

        # Statistics
        self.stats = {
            'messages_received': 0,
            'messages_sent': 0,
            'messages_processed': 0,
            'messages_failed': 0,
            'last_message_time': None,
            'connected_at': None,
            'reconnections': 0,
            'circuit_breaker_trips': 0,
        }

    def register_handler(
        self,
        subscription_type: SubscriptionType,
        handler: Callable[[Dict[str, Any]], None]
    ):
        """
        Register a handler for a specific subscription type

        Args:
            subscription_type: Type of subscription to handle
            handler: Callable that processes messages
        """
        if subscription_type.value not in self.handlers:
            self.handlers[subscription_type.value] = []

        self.handlers[subscription_type.value].append(handler)
        logger.info(f"Registered handler for {subscription_type.value}")

    async def connect(self):
        """Establish WebSocket connection"""
        if not self.circuit_breaker.can_attempt():
            raise ConnectionError(
                f"Circuit breaker {self.circuit_breaker.state.value}, "
                "connection attempts blocked"
            )

        try:
            logger.info(f"Connecting to Hyperliquid WebSocket: {self.ws_url}")

            self.websocket = await asyncio.wait_for(
                websockets.connect(
                    self.ws_url,
                    ping_interval=self.PING_INTERVAL,
                    ping_timeout=self.PING_TIMEOUT,
                    close_timeout=10,
                ),
                timeout=30
            )

            self.is_connected = True
            self.reconnect_attempts = 0
            self.stats['connected_at'] = datetime.now(timezone.utc)
            self.circuit_breaker.record_success()

            logger.info("WebSocket connected successfully")

            # Subscribe to initial subscriptions
            for sub in self.initial_subscriptions:
                await self.subscribe(sub)

        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            self.is_connected = False
            self.circuit_breaker.record_failure()

            if self.circuit_breaker.state.value == "open":
                self.stats['circuit_breaker_trips'] += 1
                logger.error(
                    "Circuit breaker opened, "
                    f"will retry after {self.circuit_breaker.recovery_timeout}s"
                )

            raise

    async def disconnect(self):
        """Close WebSocket connection gracefully"""
        self.is_running = False
        self.is_connected = False

        if self.websocket:
            try:
                await self.websocket.close()
                logger.info("WebSocket disconnected")
            except Exception as e:
                logger.error(f"Error disconnecting WebSocket: {e}")

        self.websocket = None
        self.active_subscriptions.clear()

    async def subscribe(self, subscription: Dict[str, Any]):
        """
        Subscribe to a data stream

        Args:
            subscription: Subscription configuration
                Example: {"type": "trades", "coin": "BTC"}

        Raises:
            ValueError: If max subscriptions exceeded
        """
        if len(self.active_subscriptions) >= self.MAX_SUBSCRIPTIONS:
            raise ValueError(
                f"Maximum subscriptions ({self.MAX_SUBSCRIPTIONS}) reached"
            )

        if not self.is_connected or not self.websocket:
            raise ConnectionError("WebSocket not connected")

        message = {
            "method": "subscribe",
            "subscription": subscription
        }

        try:
            await self.websocket.send(json.dumps(message))

            # Track subscription
            sub_key = self._get_subscription_key(subscription)
            self.active_subscriptions.add(sub_key)

            self.stats['messages_sent'] += 1
            logger.info(f"Subscribed to: {subscription}")

        except Exception as e:
            logger.error(f"Failed to subscribe to {subscription}: {e}")
            raise

    async def unsubscribe(self, subscription: Dict[str, Any]):
        """
        Unsubscribe from a data stream

        Args:
            subscription: Subscription configuration to remove
        """
        if not self.is_connected or not self.websocket:
            raise ConnectionError("WebSocket not connected")

        message = {
            "method": "unsubscribe",
            "subscription": subscription
        }

        try:
            await self.websocket.send(json.dumps(message))

            # Remove from tracking
            sub_key = self._get_subscription_key(subscription)
            self.active_subscriptions.discard(sub_key)

            self.stats['messages_sent'] += 1
            logger.info(f"Unsubscribed from: {subscription}")

        except Exception as e:
            logger.error(f"Failed to unsubscribe from {subscription}: {e}")
            raise

    def _get_subscription_key(self, subscription: Dict[str, Any]) -> str:
        """Generate unique key for subscription tracking"""
        return json.dumps(subscription, sort_keys=True)

    async def _handle_message(self, message: str):
        """
        Process incoming WebSocket message

        Args:
            message: Raw message string from WebSocket
        """
        try:
            data = json.loads(message)

            self.stats['messages_received'] += 1
            self.stats['last_message_time'] = datetime.now(timezone.utc)

            await self.message_buffer.add(data)

            # Process message
            await self._process_message(data)

        except json.JSONDecodeError:
            self.stats['messages_failed'] += 1
            logger.error(f"Failed to parse message: {message[:100]}")
        except Exception as e:
            self.stats['messages_failed'] += 1
            logger.error(f"Error handling message: {e}")

    async def _process_message(self, data: Dict[str, Any]):
        """Process parsed message through handlers"""
        try:
            # Extract channel/type from message
            channel = data.get('channel')
            sub_type = data.get('data', {}).get('type') if isinstance(data.get('data'), dict) else None

            # Route to appropriate handlers
            if channel:
                handlers = self.handlers.get(channel, [])
                for handler in handlers:
                    try:
                        await self._run_handler(handler, data)
                    except Exception as e:
                        logger.error(f"Handler error for channel {channel}: {e}")

            if sub_type:
                handlers = self.handlers.get(sub_type, [])
                for handler in handlers:
                    try:
                        await self._run_handler(handler, data)
                    except Exception as e:
                        logger.error(f"Handler error for type {sub_type}: {e}")

            self.stats['messages_processed'] += 1

        except Exception as e:
            self.stats['messages_failed'] += 1
            logger.error(f"Error processing message: {e}")

    async def _run_handler(self, handler: Callable, data: Dict[str, Any]):
        """Run handler (sync or async)"""
        if asyncio.iscoroutinefunction(handler):
            await handler(data)
        else:
            handler(data)

    async def _receive_messages(self):
        """Main message receiving loop"""
        while self.is_running and self.websocket:
            try:
                message = await self.websocket.recv()
                await self._handle_message(message)

            except ConnectionClosed:
                logger.warning("WebSocket connection closed")
                self.is_connected = False

                if self.enable_auto_reconnect:
                    await self._reconnect()
                else:
                    break

            except WebSocketException as e:
                logger.error(f"WebSocket error: {e}")
                self.is_connected = False

                if self.enable_auto_reconnect:
                    await self._reconnect()
                else:
                    break

            except Exception as e:
                logger.error(f"Unexpected error in receive loop: {e}")
                await asyncio.sleep(1)

    async def _reconnect(self):
        """Reconnect with exponential backoff"""
        self.reconnect_attempts += 1
        self.stats['reconnections'] = self.reconnect_attempts

        # Calculate delay with exponential backoff
        delay = min(
            self.RECONNECT_DELAY * (2 ** (self.reconnect_attempts - 1)),
            self.MAX_RECONNECT_DELAY
        )

        logger.info(
            f"Reconnecting in {delay}s (attempt {self.reconnect_attempts})..."
        )
        await asyncio.sleep(delay)

        try:
            await self.connect()
            logger.info("Reconnected successfully")

        except Exception as e:
            logger.error(f"Reconnection failed: {e}")

    async def run(self):
        """
        Start the WebSocket client

        This will:
        1. Connect to WebSocket
        2. Subscribe to configured streams
        3. Process messages indefinitely
        4. Auto-reconnect on disconnection
        """
        self.is_running = True

        try:
            await self.connect()
            await self._receive_messages()

        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Fatal error in WebSocket client: {e}")
        finally:
            await self.disconnect()

    async def run_for_duration(self, duration_seconds: int):
        """
        Run client for a specific duration (useful for testing)

        Args:
            duration_seconds: How long to run
        """
        self.is_running = True

        try:
            await self.connect()

            # Run receive loop with timeout
            await asyncio.wait_for(
                self._receive_messages(),
                timeout=duration_seconds
            )

        except asyncio.TimeoutError:
            logger.info(f"Completed {duration_seconds}s run")
        except Exception as e:
            logger.error(f"Error during timed run: {e}")
        finally:
            await self.disconnect()

    async def setup_signal_handlers(self):
        """Setup graceful shutdown handlers"""
        loop = asyncio.get_event_loop()

        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda: asyncio.create_task(self.shutdown())
            )

    async def shutdown(self):
        """Graceful shutdown"""
        logger.info("Initiating graceful shutdown...")
        self.shutdown_event.set()
        await self.disconnect()

    def is_healthy(self) -> bool:
        """Check if WebSocket connection is healthy"""
        if not self.is_connected:
            return False

        if self.circuit_breaker.state.value == "open":
            return False

        # Check if we've received messages recently (within 5 minutes)
        if self.stats['last_message_time']:
            elapsed = (datetime.now(timezone.utc) - self.stats['last_message_time']).total_seconds()
            if elapsed > 300:  # 5 minutes
                return False

        return True

    def get_health(self) -> Dict[str, Any]:
        """Get detailed health status"""
        return {
            'healthy': self.is_healthy(),
            'connected': self.is_connected,
            'running': self.is_running,
            'circuit_breaker': self.circuit_breaker.get_state(),
            'buffer_stats': self.message_buffer.get_stats(),
            'last_message_age': (
                (datetime.now(timezone.utc) - self.stats['last_message_time']).total_seconds()
                if self.stats['last_message_time'] else None
            )
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        stats = self.stats.copy()
        stats['is_connected'] = self.is_connected
        stats['is_healthy'] = self.is_healthy()
        stats['active_subscriptions'] = len(self.active_subscriptions)
        stats['ws_url'] = self.ws_url
        stats['circuit_breaker'] = self.circuit_breaker.get_state()
        stats['buffer'] = self.message_buffer.get_stats()

        if stats['connected_at']:
            uptime = (datetime.now(timezone.utc) - stats['connected_at']).total_seconds()
            stats['uptime_seconds'] = uptime

        # Calculate success rate
        total_messages = stats['messages_received']
        if total_messages > 0:
            stats['message_success_rate'] = stats['messages_processed'] / total_messages
        else:
            stats['message_success_rate'] = 0.0

        return stats

    # Convenience methods for common subscriptions

    async def subscribe_all_mids(self):
        """Subscribe to all mid prices (useful for oracle monitoring)"""
        await self.subscribe({"type": "allMids"})

    async def subscribe_trades(self, coin: str):
        """Subscribe to trades for a specific coin"""
        await self.subscribe({"type": "trades", "coin": coin})

    async def subscribe_user_fills(self, user: str):
        """Subscribe to fills for a specific user address"""
        await self.subscribe({"type": "userFills", "user": user})

    async def subscribe_l2_book(self, coin: str):
        """Subscribe to L2 order book for a coin"""
        await self.subscribe({"type": "l2Book", "coin": coin})

    async def subscribe_candle(self, coin: str, interval: str = "1m"):
        """
        Subscribe to candlestick data

        Args:
            coin: Asset to monitor
            interval: Candle interval (1m, 5m, 15m, 1h, etc.)
        """
        await self.subscribe({
            "type": "candle",
            "coin": coin,
            "interval": interval
        })
