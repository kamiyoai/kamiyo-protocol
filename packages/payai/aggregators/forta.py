# -*- coding: utf-8 -*-
"""
Forta Network Aggregator
Fetches security alerts from Forta Network via GraphQL API
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import time


class FortaAggregator(BaseAggregator):
    """Aggregates exploits from Forta Network security alerts"""

    # Chain ID mapping
    CHAIN_MAPPING = {
        1: 'Ethereum',
        10: 'Optimism',
        25: 'Cronos',
        56: 'BSC',
        100: 'Gnosis',
        137: 'Polygon',
        250: 'Fantom',
        288: 'Boba',
        324: 'zkSync',
        1101: 'Polygon zkEVM',
        8453: 'Base',
        42161: 'Arbitrum',
        42220: 'Celo',
        43114: 'Avalanche',
        59144: 'Linea',
        534352: 'Scroll',
    }

    def __init__(self, api_key: Optional[str] = None):
        super().__init__('forta')
        self.api_url = 'https://api.forta.network/graphql'
        self.lookback_hours = 1
        self.max_alerts_per_request = 100

        # Get API key from parameter or environment variable
        self.api_key = api_key or os.getenv('FORTA_API_KEY')

        # Update session headers with API key if available
        if self.api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_key}'
            })

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from Forta Network"""

        # Check if API key is available
        if not self.api_key:
            self.logger.warning("Forta API key not configured. Set FORTA_API_KEY environment variable or pass api_key parameter.")
            return []

        self.logger.info(f"Fetching from Forta Network API")

        exploits = []

        try:
            # Calculate timestamp for lookback period (Unix timestamp)
            lookback_time = int((datetime.now() - timedelta(hours=self.lookback_hours)).timestamp())

            # Fetch alerts with pagination
            alerts = self._fetch_alerts(lookback_time)

            # Parse and normalize each alert
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
            self.logger.error(f"Failed to fetch Forta Network: {e}")

        return exploits

    def _fetch_alerts(self, created_since: int) -> List[Dict[str, Any]]:
        """Fetch alerts from Forta API with pagination"""

        all_alerts = []
        has_next_page = True
        cursor = None

        while has_next_page:
            try:
                # Build GraphQL query
                query = """
                query GetAlerts($first: Int!, $createdSince: Int!, $after: String) {
                  alerts(
                    first: $first
                    after: $after
                    input: {
                      severities: [CRITICAL, HIGH]
                      createdSince: $createdSince
                    }
                  ) {
                    pageInfo {
                      hasNextPage
                      endCursor {
                        alertId
                        blockNumber
                      }
                    }
                    alerts {
                      hash
                      name
                      description
                      severity
                      metadata
                      source {
                        bot {
                          id
                        }
                        transactionHash
                        block {
                          timestamp
                          chainId
                        }
                      }
                    }
                  }
                }
                """

                # Build variables
                variables = {
                    'first': self.max_alerts_per_request,
                    'createdSince': created_since
                }

                if cursor:
                    variables['after'] = cursor

                # Make GraphQL request
                response = self.make_request(
                    self.api_url,
                    method='POST',
                    json={
                        'query': query,
                        'variables': variables
                    },
                    timeout=30
                )

                if not response:
                    self.logger.error("Failed to fetch alerts from Forta API")
                    break

                data = response.json()

                # Check for errors
                if 'errors' in data:
                    self.logger.error(f"GraphQL errors: {data['errors']}")
                    break

                # Extract alerts and pagination info
                alerts_data = data.get('data', {}).get('alerts', {})
                alerts = alerts_data.get('alerts', [])
                page_info = alerts_data.get('pageInfo', {})

                all_alerts.extend(alerts)

                # Check pagination
                has_next_page = page_info.get('hasNextPage', False)
                end_cursor = page_info.get('endCursor')

                if has_next_page and end_cursor:
                    # Format cursor for next request
                    cursor = f"{end_cursor.get('alertId', '')}-{end_cursor.get('blockNumber', '')}"
                else:
                    has_next_page = False

                self.logger.info(f"Fetched {len(alerts)} alerts (total: {len(all_alerts)})")

                # Avoid rate limiting
                if has_next_page:
                    time.sleep(1)

            except Exception as e:
                self.logger.error(f"Error fetching alerts page: {e}")
                break

        return all_alerts

    def _parse_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        """Parse Forta alert into standardized exploit format"""

        # Extract basic fields
        alert_hash = alert.get('hash', '')
        name = alert.get('name', '')
        description = alert.get('description', '')
        severity = alert.get('severity', '')
        metadata = alert.get('metadata', {})

        # Extract source information
        source = alert.get('source', {})
        tx_hash = source.get('transactionHash')
        block = source.get('block', {})

        # Extract chain info
        chain_id = block.get('chainId')
        chain = self._map_chain_id(chain_id) or 'Unknown'

        # Extract timestamp
        timestamp_str = block.get('timestamp')
        timestamp = self._parse_timestamp(timestamp_str)

        # Extract protocol name from description or metadata
        protocol = self._extract_protocol(name, description, metadata)

        # Parse amount from description or metadata
        amount_usd = self._extract_amount(description, metadata)

        # Categorize the alert
        category = self._categorize_alert(name, description, metadata)

        # Use transaction hash if available, otherwise generate one
        if tx_hash:
            exploit_tx_hash = tx_hash
        else:
            exploit_tx_hash = self.generate_tx_hash(alert_hash, chain, timestamp.isoformat())

        # Build source URL
        source_url = f"https://explorer.forta.network/alert/{alert_hash}" if alert_hash else self.api_url

        return {
            'tx_hash': exploit_tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': source_url,
            'category': category,
            'description': f"{name}: {description}"[:500],
            'recovery_status': None
        }

    def _map_chain_id(self, chain_id: Optional[int]) -> Optional[str]:
        """Map chain ID to chain name"""
        if not chain_id:
            return None
        return self.CHAIN_MAPPING.get(chain_id)

    def _parse_timestamp(self, timestamp_str: Optional[str]) -> datetime:
        """Parse timestamp string to datetime"""
        if not timestamp_str:
            return datetime.now()

        try:
            # Try parsing as ISO format
            return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except Exception:
            pass

        try:
            # Try parsing as Unix timestamp
            timestamp_int = int(timestamp_str)
            return datetime.fromtimestamp(timestamp_int)
        except Exception:
            pass

        # Fallback to current time
        self.logger.warning(f"Failed to parse timestamp: {timestamp_str}")
        return datetime.now()

    def _extract_protocol(self, name: str, description: str, metadata: Dict[str, Any]) -> str:
        """Extract protocol name from alert data"""

        # Check metadata first
        if metadata:
            if 'protocol' in metadata:
                return metadata['protocol'][:100]
            if 'project' in metadata:
                return metadata['project'][:100]
            if 'contractName' in metadata:
                return metadata['contractName'][:100]

        # Extract from name or description
        text = name + ' ' + description

        # Common patterns to remove
        remove_patterns = [
            'Suspicious ', 'Potential ', 'Detected ', 'Alert: ',
            'High Value ', 'Large ', 'Critical ', 'Exploit '
        ]

        protocol_text = name
        for pattern in remove_patterns:
            protocol_text = protocol_text.replace(pattern, '')

        # Take first meaningful words
        words = protocol_text.split()
        if words:
            # Return first 1-3 words as protocol name
            protocol = ' '.join(words[:3])
            return protocol[:100] if protocol else 'Unknown'

        return 'Unknown'

    def _extract_amount(self, description: str, metadata: Dict[str, Any]) -> float:
        """Extract dollar amount from alert data"""

        # Check metadata for amount fields
        if metadata:
            amount_fields = ['amount', 'value', 'amountUSD', 'valueUSD', 'loss']
            for field in amount_fields:
                if field in metadata:
                    try:
                        return float(metadata[field])
                    except (ValueError, TypeError):
                        pass

        # Try parsing from description
        if description:
            amount = self.parse_amount(description)
            if amount > 0:
                return amount

        return 0.0

    def _categorize_alert(self, name: str, description: str, metadata: Dict[str, Any]) -> str:
        """Categorize the type of exploit based on alert data"""

        text = (name + ' ' + description).lower()

        # Add metadata as text if available
        if metadata:
            text += ' ' + str(metadata).lower()

        categories = {
            'Flash Loan': ['flash loan', 'flashloan', 'flash-loan', 'flash attack'],
            'Reentrancy': ['reentrancy', 'reentrant', 're-enter', 're-entrance'],
            'Oracle Manipulation': ['oracle', 'price manipulation', 'oracle attack', 'price oracle'],
            'Large Transfer': ['large transfer', 'high value transfer', 'unusual transfer', 'suspicious transfer'],
            'Access Control': ['access control', 'private key', 'admin key', 'privilege', 'unauthorized'],
            'Bridge Exploit': ['bridge', 'cross-chain', 'bridge attack'],
            'MEV': ['mev', 'sandwich', 'front-run', 'back-run', 'frontrun', 'backrun'],
            'Phishing': ['phishing', 'ice phishing', 'approval phishing'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam', 'rug-pull', 'liquidity removed'],
            'Smart Contract Bug': ['smart contract', 'bug', 'vulnerability', 'exploit'],
            'Tornado Cash': ['tornado cash', 'tornado', 'mixer', 'tumbler'],
            'Suspicious Activity': ['suspicious', 'anomalous', 'unusual', 'abnormal'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Security Alert'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Check for API key
    api_key = os.getenv('FORTA_API_KEY')
    if not api_key:
        print("\n" + "="*70)
        print("⚠️  FORTA API KEY REQUIRED")
        print("="*70)
        print("\nThe Forta Network API requires authentication.")
        print("\nTo get an API key:")
        print("1. Visit https://app.forta.network/")
        print("2. Sign in with your wallet")
        print("3. Go to 'My API Keys' in the top right menu")
        print("4. Click 'Create new API key'")
        print("\nTo use this aggregator, set the FORTA_API_KEY environment variable:")
        print("  export FORTA_API_KEY='your-api-key-here'")
        print("\nOr pass it as a parameter:")
        print("  aggregator = FortaAggregator(api_key='your-api-key-here')")
        print("="*70 + "\n")

    aggregator = FortaAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from Forta Network:")
    for i, exploit in enumerate(exploits[:10], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   TX: {exploit['tx_hash'][:20]}...")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   Category: {exploit['category']}")
        print(f"   Description: {exploit['description'][:100]}...")
        print(f"   URL: {exploit['source_url']}")
