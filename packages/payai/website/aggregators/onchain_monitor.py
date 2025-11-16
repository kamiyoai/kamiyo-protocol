# -*- coding: utf-8 -*-
"""
On-Chain Monitor
Real-time monitoring of blockchain transactions for suspicious activity
Detects exploits before they're reported by aggregating actual on-chain data
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from aggregators.base import BaseAggregator


class OnChainMonitor(BaseAggregator):
    """Monitors blockchain for suspicious transactions and exploit patterns"""

    def __init__(self, chains: List[str] = None):
        super().__init__('onchain_monitor')

        # Chains to monitor (default to Ethereum)
        self.chains = chains or ['ethereum']

        # Known attacker addresses (updated periodically from threat intel)
        self.known_attackers = set([
            # Add known attacker addresses here
            # Can be loaded from external file or API
        ])

        # Known protocol addresses to monitor
        self.monitored_protocols = {}

        # Suspicious patterns
        self.alert_thresholds = {
            'large_withdrawal': 1_000_000,  # $1M+ in single tx
            'tvl_drop_percent': 10,         # 10%+ TVL drop
            'rapid_withdrawals': 5,         # 5+ large withdrawals in 1 hour
        }

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Monitor on-chain activity for exploit patterns

        NOTE: Requires RPC provider (Alchemy, Infura, QuickNode)
        Set environment variable: WEB3_PROVIDER_URI
        """

        self.logger.info("On-chain monitor initialized")

        # Check if Web3 is available
        try:
            from web3 import Web3
            provider_uri = os.getenv('WEB3_PROVIDER_URI')

            if not provider_uri:
                self.logger.warning("WEB3_PROVIDER_URI not set")
                self.logger.info("Set environment variable to enable on-chain monitoring")
                self.logger.info("Example: export WEB3_PROVIDER_URI='https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY'")
                return []

            w3 = Web3(Web3.HTTPProvider(provider_uri))

            if not w3.is_connected():
                self.logger.error("Failed to connect to Web3 provider")
                return []

            self.logger.info(f"Connected to {provider_uri}")

            # Fetch recent blocks and analyze
            exploits = self._analyze_recent_activity(w3)

            return exploits

        except ImportError:
            self.logger.error("web3 library not installed")
            self.logger.info("Install with: pip install web3")
            return []
        except Exception as e:
            self.logger.error(f"On-chain monitoring error: {e}")
            return []

    def _analyze_recent_activity(self, w3) -> List[Dict[str, Any]]:
        """Analyze recent blocks for suspicious activity"""

        exploits = []

        try:
            latest_block = w3.eth.block_number
            blocks_to_scan = 10  # Last 10 blocks (~2 minutes)

            self.logger.info(f"Scanning blocks {latest_block - blocks_to_scan} to {latest_block}")

            for block_num in range(latest_block - blocks_to_scan, latest_block + 1):
                block = w3.eth.get_block(block_num, full_transactions=True)

                for tx in block.transactions:
                    # Check for suspicious patterns
                    if self._is_suspicious_transaction(tx, w3):
                        exploit = self._create_exploit_from_tx(tx, w3)
                        if exploit:
                            exploits.append(exploit)

        except Exception as e:
            self.logger.error(f"Error analyzing blocks: {e}")

        return exploits

    def _is_suspicious_transaction(self, tx, w3) -> bool:
        """Determine if transaction is potentially an exploit"""

        try:
            # Large value transfer
            value_eth = w3.from_wei(tx.value, 'ether')
            if value_eth > 100:  # >100 ETH
                return True

            # From known attacker
            if tx['from'] in self.known_attackers:
                return True

            # Contract interaction with large value
            if tx.to and tx.value > 0:
                code = w3.eth.get_code(tx.to)
                if code and len(code) > 2:  # Is contract
                    return True

        except Exception as e:
            self.logger.debug(f"Error checking transaction: {e}")

        return False

    def _create_exploit_from_tx(self, tx, w3) -> Optional[Dict[str, Any]]:
        """Create exploit record from suspicious transaction"""

        try:
            value_usd = self._estimate_usd_value(tx.value, w3)

            # Get contract name if possible
            protocol = self._identify_protocol(tx.to, w3) if tx.to else 'Unknown'

            return {
                'tx_hash': tx.hash.hex(),
                'chain': 'Ethereum',  # Extend for multi-chain
                'protocol': protocol,
                'amount_usd': value_usd,
                'timestamp': datetime.now(),
                'source': self.name,
                'source_url': f"https://etherscan.io/tx/{tx.hash.hex()}",
                'category': 'Suspicious Transaction',
                'description': f"Large transaction detected: {value_usd:,.0f} USD",
                'recovery_status': None
            }

        except Exception as e:
            self.logger.error(f"Error creating exploit from tx: {e}")
            return None

    def _estimate_usd_value(self, value_wei, w3) -> float:
        """Estimate USD value of transaction (simplified)"""

        value_eth = w3.from_wei(value_wei, 'ether')

        # In production, fetch real ETH/USD price
        # For now, use approximate value
        eth_price_usd = 2500  # Update with real price feed

        return float(value_eth) * eth_price_usd

    def _identify_protocol(self, address, w3) -> str:
        """Try to identify protocol from address"""

        # In production, maintain database of protocol addresses
        # Or use services like Etherscan API

        known_protocols = {
            # Add known protocol addresses
        }

        return known_protocols.get(address, 'Unknown Contract')

    def monitor_continuous(self, callback):
        """
        Continuously monitor blockchain for new transactions

        Example usage:
            monitor = OnChainMonitor()
            monitor.monitor_continuous(lambda exploit: print(exploit))
        """

        from web3 import Web3

        provider_uri = os.getenv('WEB3_PROVIDER_URI')
        if not provider_uri:
            self.logger.error("WEB3_PROVIDER_URI not set")
            return

        w3 = Web3(Web3.HTTPProvider(provider_uri))

        if not w3.is_connected():
            self.logger.error("Failed to connect to Web3")
            return

        self.logger.info("Starting continuous monitoring (Ctrl+C to stop)")

        # Subscribe to pending transactions
        # Note: Requires WebSocket provider for real-time
        last_block = w3.eth.block_number

        try:
            while True:
                current_block = w3.eth.block_number

                if current_block > last_block:
                    # New block(s) available
                    for block_num in range(last_block + 1, current_block + 1):
                        block = w3.eth.get_block(block_num, full_transactions=True)

                        for tx in block.transactions:
                            if self._is_suspicious_transaction(tx, w3):
                                exploit = self._create_exploit_from_tx(tx, w3)
                                if exploit:
                                    callback(exploit)

                    last_block = current_block

                time.sleep(1)  # Check every second

        except KeyboardInterrupt:
            self.logger.info("Monitoring stopped")


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    monitor = OnChainMonitor()

    print("\nOn-Chain Monitor Initialized")
    print(f"Chains: {monitor.chains}")
    print(f"Alert thresholds: {monitor.alert_thresholds}")

    print("\nTo enable on-chain monitoring:")
    print("1. Set WEB3_PROVIDER_URI environment variable")
    print("   Example: export WEB3_PROVIDER_URI='https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY'")
    print("2. Install web3: pip install web3")
    print("3. Run: python aggregators/onchain_monitor.py")

    print("\nRecommended providers:")
    print("  - Alchemy: https://alchemy.com (2M compute units/mo free)")
    print("  - Infura: https://infura.io (100k requests/day free)")
    print("  - QuickNode: https://quicknode.com (Free tier available)")

    # Try to run if configured
    exploits = monitor.fetch_exploits()

    if exploits:
        print(f"\n✓ Found {len(exploits)} suspicious transactions")
        for exploit in exploits[:3]:
            print(f"  - {exploit['protocol']}: ${exploit['amount_usd']:,.0f}")
    else:
        print("\n(Configure Web3 provider to enable monitoring)")
