# -*- coding: utf-8 -*-
"""
DeFiLlama Hacks Aggregator
Fetches historical exploit data from DeFiLlama Hacks API
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any


class DefiLlamaAggregator(BaseAggregator):
    """Aggregates exploits from DeFiLlama Hacks API"""

    def __init__(self):
        super().__init__('defillama')
        self.api_url = 'https://api.llama.fi/hacks'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from DeFiLlama API"""

        self.logger.info(f"Fetching from {self.api_url}")

        try:
            response = self.make_request(self.api_url)

            if not response:
                self.logger.error("Failed to fetch from DeFiLlama")
                return []

            data = response.json()

            if not isinstance(data, list):
                self.logger.error("Unexpected API response format")
                return []

            exploits = []

            for item in data:
                try:
                    exploit = self._parse_item(item)
                    if exploit and self.validate_exploit(exploit):
                        exploits.append(exploit)
                except Exception as e:
                    self.logger.error(f"Failed to parse item: {e}")
                    continue

            self.logger.info(f"Fetched {len(exploits)} exploits from DeFiLlama")
            return exploits

        except Exception as e:
            self.logger.error(f"Failed to fetch DeFiLlama: {e}")
            return []

    def _parse_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Parse API item into exploit data"""

        # DeFiLlama API fields mapping
        protocol = item.get('name', 'Unknown')
        chain = self._normalize_chain(item.get('chain', 'Unknown'))
        amount_usd = float(item.get('amount', 0))

        # Parse date
        date_str = item.get('date', '')
        if date_str:
            try:
                # DeFiLlama uses format like "2023-03-13" or Unix timestamp
                if isinstance(date_str, str):
                    timestamp = datetime.strptime(date_str, '%Y-%m-%d')
                else:
                    timestamp = datetime.fromtimestamp(date_str)
            except:
                timestamp = datetime.now()
        else:
            timestamp = datetime.now()

        # Get or generate tx_hash
        tx_hash = item.get('txHash') or item.get('tx_hash')
        if not tx_hash:
            tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10])

        # Category/technique
        category = item.get('technique', item.get('classification', 'Unknown'))

        # Build source URL if available
        source_url = item.get('source') or f"https://defillama.com/hacks"

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': source_url,
            'category': category,
            'description': item.get('description', ''),
            'recovery_status': None
        }

    def _normalize_chain(self, chain) -> str:
        """Normalize chain names to standard format"""

        if not chain:
            return 'Unknown'

        # Handle chain as list (DeFiLlama returns lists for multi-chain exploits)
        if isinstance(chain, list):
            if len(chain) > 0:
                chain = chain[0]  # Take first chain
            else:
                return 'Multi-chain'

        if not isinstance(chain, str):
            return 'Unknown'

        chain = chain.strip()

        # Map common variations
        chain_map = {
            'eth': 'Ethereum',
            'ethereum': 'Ethereum',
            'bsc': 'BSC',
            'binance': 'BSC',
            'bnb': 'BSC',
            'polygon': 'Polygon',
            'matic': 'Polygon',
            'arbitrum': 'Arbitrum',
            'optimism': 'Optimism',
            'avalanche': 'Avalanche',
            'avax': 'Avalanche',
            'fantom': 'Fantom',
            'ftm': 'Fantom',
            'solana': 'Solana',
            'sol': 'Solana',
            'cosmos': 'Cosmos',
            'atom': 'Cosmos',
        }

        chain_lower = chain.lower()
        return chain_map.get(chain_lower, chain.title())


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = DefiLlamaAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from DeFiLlama:")

    # Show top 10 by amount
    exploits_sorted = sorted(exploits, key=lambda x: x['amount_usd'], reverse=True)

    for i, exploit in enumerate(exploits_sorted[:10], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
