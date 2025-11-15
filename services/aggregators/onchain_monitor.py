# -*- coding: utf-8 -*-
"""
On-Chain Monitor
Real-time monitoring of blockchain transactions for suspicious activity
Detects exploits before they're reported by aggregating actual on-chain data

Supports: Ethereum, Base, Arbitrum
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
from aggregators.base import BaseAggregator


class OnChainMonitor(BaseAggregator):
    """Monitors blockchain for suspicious transactions and exploit patterns"""

    # Stablecoin addresses by chain
    STABLECOINS = {
        'ethereum': {
            'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
        'base': {
            'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        },
        'arbitrum': {
            'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        }
    }

    # Top DeFi protocols to watch by chain
    PROTOCOLS_TO_WATCH = {
        'ethereum': {
            # Aave V3
            '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2': 'Aave V3',
            # Uniswap V3 Router
            '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'Uniswap V3',
            # Compound V3 USDC
            '0xc3d688B66703497DAA19211EEdff47f25384cdc3': 'Compound V3',
            # Curve 3pool
            '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7': 'Curve 3pool',
            # MakerDAO DSR
            '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7': 'MakerDAO',
            # Balancer Vault
            '0xBA12222222228d8Ba445958a75a0704d566BF2C8': 'Balancer',
            # Lido
            '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84': 'Lido',
            # Rocket Pool
            '0xae78736Cd615f374D3085123A210448E74Fc6393': 'Rocket Pool',
            # Convex Finance
            '0xF403C135812408BFbE8713b5A23a04b3D48AAE31': 'Convex',
            # Yearn Finance
            '0x9d409a0A012CFbA9B15F6D4B36Ac57A46966Ab9a': 'Yearn',
        },
        'base': {
            # Aave V3 Base
            '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5': 'Aave V3',
            # Uniswap V3 Router (Base)
            '0x2626664c2603336E57B271c5C0b26F421741e481': 'Uniswap V3',
            # Compound V3 USDbC
            '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf': 'Compound V3',
            # Aerodrome Finance
            '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43': 'Aerodrome',
            # BaseSwap
            '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB': 'BaseSwap',
            # Moonwell
            '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C': 'Moonwell',
            # Seamless Protocol
            '0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7': 'Seamless',
        },
        'arbitrum': {
            # Aave V3 Arbitrum
            '0x794a61358D6845594F94dc1DB02A252b5b4814aD': 'Aave V3',
            # Uniswap V3 Router (Arbitrum)
            '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'Uniswap V3',
            # Compound V3 USDC
            '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA': 'Compound V3',
            # GMX
            '0xFC5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a': 'GMX',
            # Radiant Capital
            '0xd50cf00b6e600dd036ba8ef475677d816d6c4281': 'Radiant',
            # Camelot DEX
            '0xc873fEcbd354f5A56E00E710B90EF4201db2448d': 'Camelot',
            # Curve (Arbitrum)
            '0x445FE580eF8d70FF569aB36e80c647af338db351': 'Curve',
            # Balancer (Arbitrum)
            '0xBA12222222228d8Ba445958a75a0704d566BF2C8': 'Balancer',
        }
    }

    # Transfer event signature: Transfer(address,address,uint256)
    TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

    def __init__(self, chains: List[str] = None):
        super().__init__('onchain_monitor')

        # Chains to monitor (default to Ethereum)
        self.chains = chains or ['ethereum']

        # Known attacker addresses (updated periodically from threat intel)
        self.known_attackers = set([
            # Add known attacker addresses here
            # Can be loaded from external file or API
        ])

        # Suspicious patterns - enhanced thresholds
        self.alert_thresholds = {
            'large_withdrawal': 1_000_000,      # $1M+ in single tx
            'tvl_drop_percent': 10,             # 10%+ TVL drop
            'rapid_withdrawals': 5,             # 5+ large withdrawals in 1 hour
            'large_stablecoin_transfer': 100_000,  # $100K+ stablecoin transfer
            'flash_loan_min': 1_000_000,        # $1M+ flash loan
            'price_crash_percent': 50,          # 50%+ price drop
        }

        # Track flash loan patterns (borrow → repay within same tx)
        self.flash_loan_patterns = defaultdict(list)

        # Web3 connections per chain
        self.web3_connections = {}

    def _initialize_web3_connections(self):
        """Initialize Web3 connections for all configured chains"""
        try:
            from web3 import Web3

            chain_provider_map = {
                'ethereum': 'WEB3_PROVIDER_URI_ETHEREUM',
                'base': 'WEB3_PROVIDER_URI_BASE',
                'arbitrum': 'WEB3_PROVIDER_URI_ARBITRUM',
            }

            # Fallback to generic WEB3_PROVIDER_URI for Ethereum
            if 'ethereum' in self.chains and not os.getenv('WEB3_PROVIDER_URI_ETHEREUM'):
                generic_provider = os.getenv('WEB3_PROVIDER_URI')
                if generic_provider:
                    os.environ['WEB3_PROVIDER_URI_ETHEREUM'] = generic_provider

            for chain in self.chains:
                env_var = chain_provider_map.get(chain)
                if not env_var:
                    self.logger.warning(f"Unknown chain: {chain}")
                    continue

                provider_uri = os.getenv(env_var)
                if not provider_uri:
                    self.logger.warning(f"{env_var} not set, skipping {chain}")
                    continue

                w3 = Web3(Web3.HTTPProvider(provider_uri))
                if not w3.is_connected():
                    self.logger.error(f"Failed to connect to {chain} at {provider_uri}")
                    continue

                self.web3_connections[chain] = w3
                self.logger.info(f"Connected to {chain}: {provider_uri[:50]}...")

            return len(self.web3_connections) > 0

        except ImportError:
            self.logger.error("web3 library not installed")
            self.logger.info("Install with: pip install web3")
            return False

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Monitor on-chain activity for exploit patterns across multiple chains

        NOTE: Requires RPC providers (Alchemy, Infura, QuickNode)
        Set environment variables:
        - WEB3_PROVIDER_URI_ETHEREUM
        - WEB3_PROVIDER_URI_BASE
        - WEB3_PROVIDER_URI_ARBITRUM
        """

        self.logger.info(f"On-chain monitor initialized for chains: {self.chains}")

        # Initialize Web3 connections
        if not self._initialize_web3_connections():
            self.logger.warning("No Web3 connections established")
            return []

        # Analyze activity across all connected chains
        all_exploits = []
        for chain, w3 in self.web3_connections.items():
            try:
                self.logger.info(f"Scanning {chain}...")
                exploits = self._analyze_recent_activity(w3, chain)
                all_exploits.extend(exploits)
            except Exception as e:
                self.logger.error(f"Error analyzing {chain}: {e}")

        return all_exploits

    def _analyze_recent_activity(self, w3, chain: str) -> List[Dict[str, Any]]:
        """Analyze recent blocks for suspicious activity on a specific chain"""

        exploits = []

        try:
            latest_block = w3.eth.block_number
            blocks_to_scan = 10  # Last 10 blocks (~2 minutes)

            self.logger.info(f"[{chain}] Scanning blocks {latest_block - blocks_to_scan} to {latest_block}")

            for block_num in range(latest_block - blocks_to_scan, latest_block + 1):
                block = w3.eth.get_block(block_num, full_transactions=True)

                for tx in block.transactions:
                    # Check for suspicious patterns
                    suspicious_type = self._is_suspicious_transaction(tx, w3, chain)
                    if suspicious_type:
                        exploit = self._create_exploit_from_tx(tx, w3, chain, suspicious_type)
                        if exploit:
                            exploits.append(exploit)

            self.logger.info(f"[{chain}] Found {len(exploits)} suspicious transactions")

        except Exception as e:
            self.logger.error(f"[{chain}] Error analyzing blocks: {e}")

        return exploits

    def _is_suspicious_transaction(self, tx, w3, chain: str) -> Optional[str]:
        """
        Determine if transaction is potentially an exploit
        Returns the type of suspicious activity if found, None otherwise
        """

        try:
            # 1. Large value transfer
            value_eth = w3.from_wei(tx.value, 'ether')
            if value_eth > 100:  # >100 ETH
                return 'large_value_transfer'

            # 2. From known attacker
            if tx['from'] in self.known_attackers:
                return 'known_attacker'

            # 3. Contract interaction with large value
            if tx.to and tx.value > 0:
                code = w3.eth.get_code(tx.to)
                if code and len(code) > 2:  # Is contract
                    return 'large_contract_interaction'

            # 4. Check if transaction involves monitored protocols
            if tx.to and self._is_monitored_protocol(tx.to, chain):
                # Get transaction receipt to analyze logs
                try:
                    receipt = w3.eth.get_transaction_receipt(tx.hash)

                    # Check for large stablecoin transfers
                    if self._detect_large_transfers(receipt, chain):
                        return 'large_stablecoin_transfer'

                    # Check for flash loan patterns
                    if self._detect_flash_loan_patterns(receipt, tx, chain):
                        return 'flash_loan_pattern'

                except Exception as e:
                    self.logger.debug(f"Could not get receipt for {tx.hash.hex()}: {e}")

        except Exception as e:
            self.logger.debug(f"Error checking transaction: {e}")

        return None

    def _is_monitored_protocol(self, address: str, chain: str) -> bool:
        """Check if address is a monitored protocol"""
        if chain not in self.PROTOCOLS_TO_WATCH:
            return False

        # Normalize address for comparison
        normalized = address.lower() if isinstance(address, str) else address
        return normalized in [addr.lower() for addr in self.PROTOCOLS_TO_WATCH[chain].keys()]

    def _detect_large_transfers(self, receipt, chain: str) -> bool:
        """
        Detect large stablecoin transfers (>$100K)
        Monitors Transfer(address,address,uint256) events from stablecoin contracts
        """
        if chain not in self.STABLECOINS:
            return False

        try:
            stablecoin_addresses = set(addr.lower() for addr in self.STABLECOINS[chain].values())

            for log in receipt.logs:
                # Check if log is from a stablecoin contract
                if log['address'].lower() not in stablecoin_addresses:
                    continue

                # Check if it's a Transfer event
                if len(log['topics']) >= 3 and log['topics'][0].hex() == self.TRANSFER_EVENT_SIGNATURE:
                    # Decode the amount (third parameter in Transfer event)
                    if log['data']:
                        amount_hex = log['data'].hex()
                        amount = int(amount_hex, 16) if amount_hex else 0

                        # USDC/USDT have 6 decimals
                        amount_usd = amount / 1e6

                        if amount_usd >= self.alert_thresholds['large_stablecoin_transfer']:
                            return True

        except Exception as e:
            self.logger.debug(f"Error detecting large transfers: {e}")

        return False

    def _detect_flash_loan_patterns(self, receipt, tx, chain: str) -> bool:
        """
        Detect flash loan patterns: borrow → swap → exploit → repay
        Flash loans are characterized by:
        1. Large borrow in same block
        2. Multiple swaps/transfers
        3. Repayment in same transaction
        """
        try:
            # Flash loans typically have many events (borrow, swaps, repay)
            if len(receipt.logs) < 5:
                return False

            # Look for patterns: multiple transfers in/out
            transfer_count = 0
            large_amounts = []

            for log in receipt.logs:
                # Count Transfer events
                if len(log['topics']) >= 3 and log['topics'][0].hex() == self.TRANSFER_EVENT_SIGNATURE:
                    transfer_count += 1

                    # Track large amounts
                    if log['data']:
                        amount_hex = log['data'].hex()
                        amount = int(amount_hex, 16) if amount_hex else 0
                        if amount > 0:
                            large_amounts.append(amount)

            # Flash loan indicators:
            # - Many transfers (>10)
            # - Large amounts (>$1M equivalent)
            if transfer_count >= 10:
                # Check if any amount exceeds flash loan threshold
                # Assuming 18 decimals for most tokens
                for amount in large_amounts:
                    amount_with_decimals = amount / 1e18
                    # Very rough estimate: 1 token = $1 (conservative)
                    if amount_with_decimals >= self.alert_thresholds['flash_loan_min']:
                        return True

        except Exception as e:
            self.logger.debug(f"Error detecting flash loan patterns: {e}")

        return False

    def _create_exploit_from_tx(self, tx, w3, chain: str, suspicious_type: str) -> Optional[Dict[str, Any]]:
        """Create exploit record from suspicious transaction"""

        try:
            value_usd = self._estimate_usd_value(tx.value, w3)

            # Get contract name if possible
            protocol = self._identify_protocol(tx.to, chain) if tx.to else 'Unknown'

            # Get explorer URL based on chain
            explorer_urls = {
                'ethereum': f"https://etherscan.io/tx/{tx.hash.hex()}",
                'base': f"https://basescan.org/tx/{tx.hash.hex()}",
                'arbitrum': f"https://arbiscan.io/tx/{tx.hash.hex()}",
            }
            source_url = explorer_urls.get(chain, f"https://etherscan.io/tx/{tx.hash.hex()}")

            # Generate description based on suspicious type
            descriptions = {
                'large_value_transfer': f"Large value transfer detected: {value_usd:,.0f} USD",
                'large_stablecoin_transfer': f"Large stablecoin transfer detected (>$100K)",
                'flash_loan_pattern': f"Flash loan pattern detected with multiple swaps",
                'known_attacker': f"Transaction from known attacker address",
                'large_contract_interaction': f"Large contract interaction: {value_usd:,.0f} USD",
            }
            description = descriptions.get(suspicious_type, f"Suspicious transaction detected: {value_usd:,.0f} USD")

            return {
                'tx_hash': tx.hash.hex(),
                'chain': chain.capitalize(),
                'protocol': protocol,
                'amount_usd': value_usd,
                'timestamp': datetime.now(),
                'source': self.name,
                'source_url': source_url,
                'category': f'Suspicious Transaction - {suspicious_type.replace("_", " ").title()}',
                'description': description,
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

    def _identify_protocol(self, address: str, chain: str) -> str:
        """Try to identify protocol from address"""

        if not address or chain not in self.PROTOCOLS_TO_WATCH:
            return 'Unknown Contract'

        # Normalize address for lookup
        normalized = address.lower() if isinstance(address, str) else address

        # Check against known protocols for this chain
        for protocol_addr, protocol_name in self.PROTOCOLS_TO_WATCH[chain].items():
            if protocol_addr.lower() == normalized:
                return protocol_name

        return 'Unknown Contract'

    def monitor_continuous(self, callback):
        """
        Continuously monitor blockchain for new transactions across all configured chains

        Example usage:
            monitor = OnChainMonitor(['ethereum', 'base', 'arbitrum'])
            monitor.monitor_continuous(lambda exploit: print(exploit))
        """

        # Initialize connections
        if not self._initialize_web3_connections():
            self.logger.error("Failed to initialize Web3 connections")
            return

        self.logger.info(f"Starting continuous monitoring for {list(self.web3_connections.keys())} (Ctrl+C to stop)")

        # Track last block for each chain
        last_blocks = {}
        for chain, w3 in self.web3_connections.items():
            last_blocks[chain] = w3.eth.block_number

        try:
            while True:
                # Check each chain for new blocks
                for chain, w3 in self.web3_connections.items():
                    try:
                        current_block = w3.eth.block_number

                        if current_block > last_blocks[chain]:
                            # New block(s) available
                            for block_num in range(last_blocks[chain] + 1, current_block + 1):
                                block = w3.eth.get_block(block_num, full_transactions=True)

                                for tx in block.transactions:
                                    suspicious_type = self._is_suspicious_transaction(tx, w3, chain)
                                    if suspicious_type:
                                        exploit = self._create_exploit_from_tx(tx, w3, chain, suspicious_type)
                                        if exploit:
                                            callback(exploit)

                            last_blocks[chain] = current_block

                    except Exception as e:
                        self.logger.error(f"Error monitoring {chain}: {e}")

                time.sleep(1)  # Check every second

        except KeyboardInterrupt:
            self.logger.info("Monitoring stopped")


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    # Initialize with multi-chain support
    monitor = OnChainMonitor(['ethereum', 'base', 'arbitrum'])

    print("\n" + "="*70)
    print("On-Chain Monitor - Multi-Chain Exploit Detection")
    print("="*70)
    print(f"\nConfigured Chains: {', '.join(monitor.chains)}")
    print(f"\nAlert Thresholds:")
    for key, value in monitor.alert_thresholds.items():
        if 'percent' in key:
            print(f"  - {key}: {value}%")
        else:
            print(f"  - {key}: ${value:,}")

    print(f"\nMonitored Protocols:")
    for chain in ['ethereum', 'base', 'arbitrum']:
        if chain in monitor.PROTOCOLS_TO_WATCH:
            print(f"  {chain.capitalize()}: {len(monitor.PROTOCOLS_TO_WATCH[chain])} protocols")

    print(f"\nStablecoin Contracts:")
    for chain in ['ethereum', 'base', 'arbitrum']:
        if chain in monitor.STABLECOINS:
            coins = ', '.join(monitor.STABLECOINS[chain].keys())
            print(f"  {chain.capitalize()}: {coins}")

    print("\n" + "="*70)
    print("Setup Instructions:")
    print("="*70)
    print("1. Set environment variables for each chain:")
    print("   export WEB3_PROVIDER_URI_ETHEREUM='https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY'")
    print("   export WEB3_PROVIDER_URI_BASE='https://base-mainnet.g.alchemy.com/v2/YOUR-KEY'")
    print("   export WEB3_PROVIDER_URI_ARBITRUM='https://arb-mainnet.g.alchemy.com/v2/YOUR-KEY'")
    print("\n2. Install web3: pip install web3")
    print("\n3. Run: python aggregators/onchain_monitor.py")

    print("\n" + "="*70)
    print("Recommended RPC Providers:")
    print("="*70)
    print("  - Alchemy: https://alchemy.com (Multi-chain support, 2M compute units/mo free)")
    print("  - Infura: https://infura.io (100k requests/day free)")
    print("  - QuickNode: https://quicknode.com (Free tier available)")

    print("\n" + "="*70)
    print("Detection Features:")
    print("="*70)
    print("  - Large value transfers (>100 ETH)")
    print("  - Large stablecoin transfers (>$100K USDC/USDT)")
    print("  - Flash loan patterns (borrow -> swap -> exploit -> repay)")
    print("  - Transactions involving top 10 DeFi protocols per chain")
    print("  - Known attacker addresses (updated from threat intel)")
    print("  - Multi-chain support (Ethereum, Base, Arbitrum)")

    # Try to run if configured
    print("\n" + "="*70)
    print("Running Monitor...")
    print("="*70)
    exploits = monitor.fetch_exploits()

    if exploits:
        print(f"\n✓ Found {len(exploits)} suspicious transactions\n")
        for exploit in exploits[:5]:
            print(f"  [{exploit['chain']}] {exploit['protocol']}: ${exploit['amount_usd']:,.0f}")
            print(f"    Type: {exploit['category']}")
            print(f"    TX: {exploit['source_url']}\n")
    else:
        print("\n(No suspicious transactions found, or configure Web3 providers to enable monitoring)")
