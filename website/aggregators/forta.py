# -*- coding: utf-8 -*-
"""
Forta Network Aggregator
Fetches security alerts from Forta's decentralized threat detection network
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import json


class FortaAggregator(BaseAggregator):
    """Aggregates security alerts from Forta Network"""

    def __init__(self):
        super().__init__('forta')
        self.graphql_url = 'https://api.forta.network/graphql'
        self.api_key = os.environ.get('FORTA_API_KEY', '')

        # Known exploit detection bots (high-confidence)
        # These bots are well-known for detecting actual exploits
        self.exploit_bots = [
            '0x8badbf2ad65abc3df5b1d9cc388e419d9255ef999fb69aac6bf395646cf01c14',  # Exploit Detector Bot
            '0x2c8452ff81b4fa918a8df4441ead5fedd1d4302d7e43226f79cb812ea4962ece',  # Smart Price Change Bot
            '0x4c7e56a9a753e29ca92bd57dd593bdab0c03e762bdd04e2bc578cb82b842c1f3',  # Flash Loan Detector Bot
            '0x457aa09ca38d60410c8ffa1761f535f23959195a56c9b82e0207801e86b34d99',  # Reentrancy Bot
            '0x0b069cddde485c14666b35e13c0e0919e6bbb00ea7b0df711e45701b77841f23',  # Oracle Manipulation Bot
        ]

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch security alerts from Forta Network"""

        if not self.api_key:
            self.logger.warning("Forta API key not configured (FORTA_API_KEY env var). Skipping.")
            return []

        self.logger.info(f"Fetching from Forta Network GraphQL API")

        exploits = []

        try:
            # Fetch alerts from the last 7 days
            alerts = self._fetch_recent_alerts(days=7)

            # Parse each alert
            for alert in alerts:
                try:
                    parsed = self._parse_alert(alert)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)
                except Exception as e:
                    self.logger.error(f"Failed to parse alert: {e}")
                    continue

            self.logger.info(f"Fetched {len(exploits)} exploits from Forta Network")

        except Exception as e:
            self.logger.error(f"Failed to fetch from Forta: {e}")

        return exploits

    def _fetch_recent_alerts(self, days: int = 7) -> List[Dict[str, Any]]:
        """Fetch recent alerts from Forta Network GraphQL API"""

        alerts = []

        # Calculate timestamp for N days ago
        start_date = datetime.now() - timedelta(days=days)
        start_timestamp = start_date.isoformat()

        # GraphQL query for high-severity alerts
        query = """
        query FortaAlerts($input: AlertsInput) {
          alerts(input: $input) {
            pageInfo {
              hasNextPage
              endCursor {
                alertId
                blockNumber
              }
            }
            alerts {
              createdAt
              name
              description
              protocol
              findingType
              severity
              addresses
              source {
                transactionHash
                block {
                  number
                  chainId
                  timestamp
                }
                bot {
                  id
                  name
                }
              }
              metadata
            }
          }
        }
        """

        # Query variables - fetch CRITICAL and HIGH severity alerts only
        variables = {
            "input": {
                "severities": ["CRITICAL", "HIGH"],
                "createdSince": int(start_date.timestamp()),
                "first": 100,  # Fetch up to 100 alerts
            }
        }

        # If we have specific bot IDs, filter by them
        if self.exploit_bots:
            variables["input"]["bots"] = self.exploit_bots

        try:
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}'
            }

            response = self.make_request(
                self.graphql_url,
                method='POST',
                headers=headers,
                json={'query': query, 'variables': variables}
            )

            if not response:
                return []

            data = response.json()

            if 'errors' in data:
                self.logger.error(f"GraphQL errors: {data['errors']}")
                return []

            if 'data' in data and 'alerts' in data['data']:
                alerts = data['data']['alerts'].get('alerts', [])
                self.logger.info(f"Fetched {len(alerts)} alerts from Forta")

        except Exception as e:
            self.logger.error(f"Failed to fetch Forta alerts: {e}")

        return alerts

    def _parse_alert(self, alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse Forta alert into standardized exploit format"""

        try:
            # Extract basic info
            name = alert.get('name', '')
            description = alert.get('description', '')
            severity = alert.get('severity', '')
            finding_type = alert.get('findingType', '')

            # Extract source info
            source = alert.get('source', {})
            tx_hash = source.get('transactionHash')

            # Skip alerts without transaction hash (not actual exploits)
            if not tx_hash:
                return None

            # Extract block info
            block = source.get('block', {})
            chain_id = block.get('chainId', 0)
            timestamp_str = block.get('timestamp')

            # Parse timestamp
            if timestamp_str:
                timestamp = self.parse_date(timestamp_str)
            else:
                timestamp = self.parse_date(alert.get('createdAt', ''))

            if not timestamp:
                timestamp = datetime.now()

            # Map chain ID to chain name
            chain = self._map_chain_id(chain_id)

            # Extract protocol name
            protocol = alert.get('protocol', '')
            if not protocol:
                # Try to extract from name/description
                protocol = self._extract_protocol_from_text(name + ' ' + description)

            # Extract metadata for amount if available
            metadata = alert.get('metadata', {})
            amount_usd = self._extract_amount_from_metadata(metadata)

            # If no amount in metadata, try parsing from text
            if amount_usd == 0:
                amount_usd = self.parse_amount(name + ' ' + description)

            # Categorize the alert
            category = self._categorize_alert(name, description, finding_type, metadata)

            # Bot info
            bot = source.get('bot', {})
            bot_name = bot.get('name', 'Unknown Bot')

            # Build source URL
            source_url = f"https://explorer.forta.network/alert/{tx_hash}"

            return {
                'tx_hash': tx_hash,
                'chain': chain,
                'protocol': protocol or 'Unknown',
                'amount_usd': amount_usd,
                'timestamp': timestamp,
                'source': self.name,
                'source_url': source_url,
                'category': category,
                'description': f"{name}. {description}"[:500],
                'recovery_status': None
            }

        except Exception as e:
            self.logger.error(f"Failed to parse Forta alert: {e}")
            return None

    def _map_chain_id(self, chain_id: int) -> str:
        """Map EVM chain ID to chain name"""

        chain_mapping = {
            1: 'Ethereum',
            10: 'Optimism',
            25: 'Cronos',
            56: 'BSC',
            100: 'Gnosis',
            137: 'Polygon',
            250: 'Fantom',
            42161: 'Arbitrum',
            43114: 'Avalanche',
            8453: 'Base',
            59144: 'Linea',
            534352: 'Scroll',
        }

        return chain_mapping.get(chain_id, f'Chain-{chain_id}')

    def _extract_protocol_from_text(self, text: str) -> str:
        """Extract protocol name from alert text"""

        # Common patterns in Forta alerts
        # e.g., "Uniswap exploit detected", "Attack on Curve Finance"

        if not text:
            return 'Unknown'

        # Remove common prefixes
        for phrase in [
            'Attack on',
            'Exploit detected on',
            'Suspicious activity on',
            'Flash loan attack on',
            'Oracle manipulation on',
        ]:
            text = text.replace(phrase, '')

        # Clean up
        text = text.strip().strip(':').strip('-').strip()

        # Take first meaningful part
        parts = text.split()
        if parts:
            return ' '.join(parts[:3])  # First 3 words as protocol name

        return 'Unknown'

    def _extract_amount_from_metadata(self, metadata: Dict[str, Any]) -> float:
        """Extract dollar amount from Forta alert metadata"""

        if not metadata:
            return 0.0

        # Common metadata fields that might contain amounts
        amount_fields = [
            'amount',
            'value',
            'loss',
            'stolenAmount',
            'drainedValue',
            'usdValue',
            'totalValue'
        ]

        for field in amount_fields:
            if field in metadata:
                try:
                    value = metadata[field]
                    # If it's a string, parse it
                    if isinstance(value, str):
                        return self.parse_amount(value)
                    # If it's a number, return it
                    elif isinstance(value, (int, float)):
                        return float(value)
                except:
                    continue

        return 0.0

    def _categorize_alert(
        self,
        name: str,
        description: str,
        finding_type: str,
        metadata: Dict[str, Any]
    ) -> str:
        """Categorize the type of exploit based on Forta alert"""

        text = (name + ' ' + description + ' ' + finding_type).lower()

        categories = {
            'Flash Loan': ['flash loan', 'flashloan', 'flash-loan', 'flash attack'],
            'Reentrancy': ['reentrancy', 'reentrant', 're-enter', 're-entrance'],
            'Oracle Manipulation': ['oracle', 'price manipulation', 'price oracle'],
            'Access Control': ['access control', 'private key', 'admin', 'privilege escalation'],
            'Bridge Exploit': ['bridge', 'cross-chain', 'bridge attack'],
            'Phishing': ['phishing', 'phish', 'fake token'],
            'Rugpull': ['rug pull', 'rugpull', 'rug-pull', 'exit scam'],
            'MEV': ['mev', 'sandwich', 'front-run', 'back-run', 'frontrun'],
            'Smart Contract Bug': ['vulnerability', 'bug', 'exploit', 'critical'],
            'Drain': ['drain', 'drained', 'draining'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        # Check metadata for category hints
        if metadata:
            if 'attackType' in metadata:
                return metadata['attackType']
            if 'category' in metadata:
                return metadata['category']

        return finding_type.replace('_', ' ').title() if finding_type else 'Unknown'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = FortaAggregator()

    if not aggregator.api_key:
        print("\n⚠️  Forta API key not set!")
        print("Set FORTA_API_KEY environment variable to test this aggregator.")
        print("Get an API key from: https://app.forta.network/")
    else:
        exploits = aggregator.fetch_exploits()

        print(f"\nFetched {len(exploits)} exploits from Forta Network:")
        for i, exploit in enumerate(exploits[:10], 1):
            print(f"\n{i}. {exploit['protocol']}")
            print(f"   Chain: {exploit['chain']}")
            print(f"   Amount: ${exploit['amount_usd']:,.0f}")
            print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d %H:%M')}")
            print(f"   Category: {exploit['category']}")
            print(f"   TX: {exploit['tx_hash'][:16]}...")
