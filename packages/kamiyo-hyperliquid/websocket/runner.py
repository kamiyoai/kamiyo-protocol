"""
WebSocket Runner
Starts real-time Hyperliquid monitoring with WebSocket client
"""

import asyncio
import logging
import os
import sys
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from websocket.client import HyperliquidWebSocketClient, SubscriptionType
from websocket.handlers import WebSocketHandlers
from alerts import get_alert_manager
from monitors.hlp_vault import HLPVaultMonitor
from monitors.oracle import OracleMonitor
from monitors.liquidation_analyzer import LiquidationAnalyzer


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class HyperliquidWebSocketRunner:
    """
    Main runner for Hyperliquid WebSocket monitoring

    Orchestrates:
    - WebSocket client
    - Message handlers
    - Alert system
    - Monitors
    """

    def __init__(
        self,
        use_testnet: bool = False,
        hlp_vault_address: str = None,
        monitored_addresses: List[str] = None
    ):
        """
        Initialize WebSocket runner

        Args:
            use_testnet: Use testnet instead of mainnet
            hlp_vault_address: HLP vault address to monitor
            monitored_addresses: Additional addresses to monitor
        """
        self.use_testnet = use_testnet

        # Get HLP vault address from env or parameter
        self.hlp_vault_address = hlp_vault_address or os.getenv(
            'HLP_VAULT_ADDRESS',
            '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'
        )

        # Get monitored addresses from env or parameter
        if monitored_addresses:
            self.monitored_addresses = monitored_addresses
        else:
            addresses_str = os.getenv('MONITORED_ADDRESSES', '')
            self.monitored_addresses = [
                addr.strip()
                for addr in addresses_str.split(',')
                if addr.strip()
            ]

        # Always monitor HLP vault
        if self.hlp_vault_address not in self.monitored_addresses:
            self.monitored_addresses.append(self.hlp_vault_address)

        logger.info(f"Monitoring {len(self.monitored_addresses)} addresses")

        # Initialize components
        self.alert_manager = get_alert_manager()
        self.oracle_monitor = None  # Will be initialized if needed
        self.liquidation_analyzer = None
        self.hlp_monitor = None

        # Initialize WebSocket client
        self.client = HyperliquidWebSocketClient(
            use_testnet=use_testnet,
            enable_auto_reconnect=True,
            subscriptions=self._get_initial_subscriptions()
        )

        # Initialize handlers
        self.handlers = WebSocketHandlers(
            alert_manager=self.alert_manager,
            oracle_monitor=self.oracle_monitor,
            liquidation_analyzer=self.liquidation_analyzer,
            hlp_monitor=self.hlp_monitor
        )

        # Register handlers
        self._register_handlers()

        logger.info("WebSocket runner initialized")

    def _get_initial_subscriptions(self) -> List[Dict[str, Any]]:
        """
        Get initial WebSocket subscriptions

        Returns:
            List of subscription configurations
        """
        subscriptions = []

        # Subscribe to all mid prices (for oracle monitoring)
        subscriptions.append({"type": "allMids"})

        # Subscribe to user fills for monitored addresses
        for address in self.monitored_addresses:
            subscriptions.append({
                "type": "userFills",
                "user": address
            })

        # Subscribe to high-value asset trades
        major_assets = ["BTC", "ETH", "SOL", "ARB"]
        for asset in major_assets:
            subscriptions.append({
                "type": "trades",
                "coin": asset
            })

        logger.info(f"Created {len(subscriptions)} initial subscriptions")
        return subscriptions

    def _register_handlers(self):
        """Register message handlers for different subscription types"""

        # Register handler for all mids (price updates)
        self.client.register_handler(
            SubscriptionType.ALL_MIDS,
            self.handlers.handle_all_mids
        )

        # Register handler for trades
        self.client.register_handler(
            SubscriptionType.TRADES,
            self.handlers.handle_trades
        )

        # Register handler for user fills (liquidations)
        self.client.register_handler(
            SubscriptionType.USER_FILLS,
            self.handlers.handle_user_fills
        )

        # Register handler for user fundings
        self.client.register_handler(
            SubscriptionType.USER_FUNDINGS,
            self.handlers.handle_user_fundings
        )

        # Register handler for order book
        self.client.register_handler(
            SubscriptionType.L2_BOOK,
            self.handlers.handle_l2_book
        )

        logger.info("Registered all message handlers")

    async def run(self):
        """Start the WebSocket monitoring"""
        logger.info("Starting Hyperliquid WebSocket monitoring...")
        logger.info(f"Testnet: {self.use_testnet}")
        logger.info(f"Monitoring addresses: {len(self.monitored_addresses)}")

        try:
            # Send startup notification
            if self.alert_manager:
                self.alert_manager.send_alert(
                    title="WebSocket Monitor Started",
                    message=f"Real-time monitoring active for {len(self.monitored_addresses)} addresses",
                    level="info",
                    metadata={
                        "testnet": self.use_testnet,
                        "monitored_addresses": len(self.monitored_addresses),
                        "hlp_vault": self.hlp_vault_address
                    }
                )

            # Run WebSocket client
            await self.client.run()

        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Fatal error in WebSocket runner: {e}")

            # Send error notification
            if self.alert_manager:
                self.alert_manager.alert_system_health(
                    component="WebSocket Monitor",
                    status="down",
                    error=str(e)
                )

            raise
        finally:
            logger.info("WebSocket monitoring stopped")

    async def run_for_duration(self, duration_seconds: int):
        """
        Run monitoring for a specific duration (useful for testing)

        Args:
            duration_seconds: How long to run
        """
        logger.info(f"Running WebSocket monitoring for {duration_seconds}s...")

        try:
            await self.client.run_for_duration(duration_seconds)

            # Print statistics
            stats = self.client.get_stats()
            handler_stats = self.handlers.get_stats()

            logger.info(f"WebSocket stats: {stats}")
            logger.info(f"Handler stats: {handler_stats}")

        except Exception as e:
            logger.error(f"Error during timed run: {e}")
            raise

    def get_stats(self) -> Dict[str, Any]:
        """Get monitoring statistics"""
        return {
            'websocket': self.client.get_stats(),
            'handlers': self.handlers.get_stats(),
            'monitored_addresses': len(self.monitored_addresses)
        }


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description='Hyperliquid WebSocket Real-time Monitor'
    )
    parser.add_argument(
        '--testnet',
        action='store_true',
        help='Use testnet instead of mainnet'
    )
    parser.add_argument(
        '--duration',
        type=int,
        default=None,
        help='Run for specific duration (seconds, for testing)'
    )
    parser.add_argument(
        '--hlp-vault',
        type=str,
        default=None,
        help='HLP vault address to monitor'
    )
    parser.add_argument(
        '--addresses',
        type=str,
        default=None,
        help='Comma-separated list of addresses to monitor'
    )

    args = parser.parse_args()

    # Parse monitored addresses
    monitored_addresses = []
    if args.addresses:
        monitored_addresses = [
            addr.strip()
            for addr in args.addresses.split(',')
            if addr.strip()
        ]

    # Create runner
    runner = HyperliquidWebSocketRunner(
        use_testnet=args.testnet,
        hlp_vault_address=args.hlp_vault,
        monitored_addresses=monitored_addresses
    )

    # Run
    if args.duration:
        await runner.run_for_duration(args.duration)
    else:
        await runner.run()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown complete")
