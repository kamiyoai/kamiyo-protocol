# -*- coding: utf-8 -*-
"""
CertiK Skynet Aggregator
Fetches security incidents from CertiK Skynet public alerts
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup
import time


class CertiKAggregator(BaseAggregator):
    """Aggregates exploits from CertiK Skynet alerts"""

    def __init__(self):
        super().__init__('certik')
        self.alerts_url = 'https://skynet.certik.com/alerts'
        self.api_url = 'https://www.certik.com/api/skynet/alerts'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from CertiK Skynet"""

        self.logger.info(f"Fetching from {self.api_url}")

        try:
            # Try API first
            response = self.make_request(
                self.api_url,
                headers={
                    'Accept': 'application/json',
                    'Referer': 'https://skynet.certik.com/'
                }
            )

            if response and response.headers.get('content-type', '').startswith('application/json'):
                return self._parse_api_response(response.json())

            # Fallback to web scraping
            self.logger.info("API failed, trying web scraping")
            return self._scrape_alerts()

        except Exception as e:
            self.logger.error(f"Failed to fetch CertiK: {e}")
            return []

    def _parse_api_response(self, data: Any) -> List[Dict[str, Any]]:
        """Parse API JSON response"""

        exploits = []

        try:
            # CertiK API structure may vary
            alerts = data if isinstance(data, list) else data.get('alerts', [])

            for alert in alerts:
                try:
                    # Only process confirmed exploits/hacks
                    alert_type = alert.get('type', '').lower()
                    if 'hack' not in alert_type and 'exploit' not in alert_type:
                        continue

                    exploit = self._parse_alert(alert)
                    if exploit and self.validate_exploit(exploit):
                        exploits.append(exploit)

                except Exception as e:
                    self.logger.error(f"Failed to parse alert: {e}")
                    continue

            self.logger.info(f"Fetched {len(exploits)} exploits from CertiK API")

        except Exception as e:
            self.logger.error(f"Failed to parse CertiK API response: {e}")

        return exploits

    def _scrape_alerts(self) -> List[Dict[str, Any]]:
        """Scrape alerts from CertiK website"""

        exploits = []

        try:
            response = self.make_request(self.alerts_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find alert cards (structure may vary)
            alert_cards = soup.find_all('div', class_=['alert-card', 'incident-card'])

            for card in alert_cards:
                try:
                    # Extract basic info
                    title = card.find(['h2', 'h3', 'div'], class_=['title', 'alert-title'])
                    description = card.find(['p', 'div'], class_=['description', 'alert-description'])

                    if not title:
                        continue

                    title_text = title.get_text(strip=True)
                    desc_text = description.get_text(strip=True) if description else ''

                    # Only process confirmed exploits
                    if not any(word in title_text.lower() for word in ['hack', 'exploit', 'attack', 'breach']):
                        continue

                    exploit = {
                        'title': title_text,
                        'description': desc_text,
                        'url': self.alerts_url
                    }

                    parsed = self._parse_alert(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse alert card: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} exploits from CertiK")

        except Exception as e:
            self.logger.error(f"Failed to scrape CertiK: {e}")

        return exploits

    def _parse_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        """Parse alert into standardized exploit format"""

        # Extract protocol/project name
        protocol = alert.get('project') or alert.get('protocol') or alert.get('title', 'Unknown')
        if isinstance(protocol, str):
            protocol = protocol.split('-')[0].split(':')[0].strip()

        # Extract chain
        chain = alert.get('chain') or alert.get('blockchain')
        if not chain:
            description = alert.get('description', '')
            chain = self.extract_chain(description + ' ' + str(protocol))
        chain = chain or 'Unknown'

        # Extract amount
        amount_str = alert.get('amount') or alert.get('loss') or ''
        description = alert.get('description', '')
        amount_usd = self.parse_amount(str(amount_str) + ' ' + description)

        # Parse timestamp
        timestamp_str = alert.get('timestamp') or alert.get('createdAt') or alert.get('date')
        timestamp = self.parse_date(timestamp_str) if timestamp_str else datetime.now()

        # Extract or generate tx_hash
        tx_hash = alert.get('txHash') or alert.get('transactionHash')
        if not tx_hash:
            tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10])

        # Build source URL
        alert_id = alert.get('id') or alert.get('alertId')
        source_url = alert.get('url') or (
            f"https://skynet.certik.com/alerts/{alert_id}" if alert_id else self.alerts_url
        )

        # Categorize
        category = self._categorize_alert(alert)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': source_url,
            'category': category,
            'description': description[:500] if description else '',
            'recovery_status': None
        }

    def _categorize_alert(self, alert: Dict[str, Any]) -> str:
        """Categorize the type of security incident"""

        text = str(alert.get('description', '')) + ' ' + str(alert.get('title', ''))
        text = text.lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Flash Loan': ['flash loan', 'flashloan'],
            'Oracle Manipulation': ['oracle', 'price manipulation'],
            'Access Control': ['access control', 'private key', 'admin'],
            'Bridge Exploit': ['bridge'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam'],
            'Smart Contract Bug': ['bug', 'vulnerability', 'exploit'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Unknown'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = CertiKAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from CertiK:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
