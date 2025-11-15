# -*- coding: utf-8 -*-
"""
Immunefi Aggregator
Fetches confirmed exploit reports and bounty payouts from Immunefi
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class ImmunefiAggregator(BaseAggregator):
    """Aggregates confirmed exploits from Immunefi bug bounty platform"""

    def __init__(self):
        super().__init__('immunefi')
        self.exploits_url = 'https://immunefi.com/explore/'
        self.leaderboard_url = 'https://immunefi.com/leaderboard/'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch confirmed exploits from Immunefi"""

        self.logger.info(f"Fetching from {self.exploits_url}")

        exploits = []

        try:
            # Try to scrape public exploit data
            # Note: Immunefi may require authentication for detailed data
            response = self.make_request(self.exploits_url)

            if response:
                exploits.extend(self._scrape_exploits(response.text))

            # Also check leaderboard for large payouts (indicates confirmed exploits)
            response = self.make_request(self.leaderboard_url)
            if response:
                exploits.extend(self._scrape_leaderboard(response.text))

            self.logger.info(f"Fetched {len(exploits)} reports from Immunefi")

        except Exception as e:
            self.logger.error(f"Failed to fetch Immunefi: {e}")

        return exploits

    def _scrape_exploits(self, html: str) -> List[Dict[str, Any]]:
        """Scrape exploit reports from Immunefi explore page"""

        exploits = []

        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find project cards or exploit listings
            # Note: Immunefi structure may vary
            cards = soup.find_all(['div', 'article'], class_=['project-card', 'bounty-card', 'exploit'])

            for card in cards:
                try:
                    # Extract project name
                    title_elem = card.find(['h2', 'h3', 'h4'], class_=['title', 'project-name'])
                    if not title_elem:
                        continue

                    protocol = title_elem.get_text(strip=True)

                    # Look for exploit/payout indicators
                    description_elem = card.find(['p', 'div'], class_=['description', 'summary'])
                    description = description_elem.get_text(strip=True) if description_elem else ''

                    # Only process if there's indication of actual exploit/payout
                    if not any(word in description.lower() for word in [
                        'paid', 'payout', 'bounty', 'critical', 'exploit', 'vulnerability found'
                    ]):
                        continue

                    # Extract amount
                    amount_elem = card.find(['span', 'div'], class_=['amount', 'payout', 'bounty'])
                    amount_text = amount_elem.get_text(strip=True) if amount_elem else ''
                    amount_usd = self.parse_amount(amount_text + ' ' + description)

                    # Extract chain
                    chain_elem = card.find(['span', 'div'], class_=['chain', 'blockchain', 'network'])
                    chain = chain_elem.get_text(strip=True) if chain_elem else None
                    if not chain:
                        chain = self.extract_chain(description) or 'Unknown'

                    # Extract or generate data
                    exploit = {
                        'protocol': protocol,
                        'chain': chain,
                        'amount_usd': amount_usd,
                        'description': description,
                        'url': self.exploits_url
                    }

                    parsed = self._parse_exploit(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse card: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Failed to scrape Immunefi exploits: {e}")

        return exploits

    def _scrape_leaderboard(self, html: str) -> List[Dict[str, Any]]:
        """Scrape leaderboard for high-value bounty payouts"""

        exploits = []

        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find leaderboard entries
            entries = soup.find_all(['tr', 'div'], class_=['leaderboard-entry', 'payout-row'])

            for entry in entries:
                try:
                    # Extract project
                    project_elem = entry.find(['td', 'div'], class_=['project', 'protocol'])
                    if not project_elem:
                        continue

                    protocol = project_elem.get_text(strip=True)

                    # Extract payout amount
                    amount_elem = entry.find(['td', 'div'], class_=['amount', 'payout'])
                    amount_text = amount_elem.get_text(strip=True) if amount_elem else ''
                    amount_usd = self.parse_amount(amount_text)

                    # Only include significant payouts (likely critical vulnerabilities)
                    if amount_usd < 10000:  # Less than $10k probably not critical exploit
                        continue

                    # Extract severity
                    severity_elem = entry.find(['td', 'div'], class_=['severity', 'level'])
                    severity = severity_elem.get_text(strip=True) if severity_elem else 'Unknown'

                    # Only include critical/high severity
                    if severity.lower() not in ['critical', 'high', 'unknown']:
                        continue

                    exploit = {
                        'protocol': protocol,
                        'amount_usd': amount_usd,
                        'severity': severity,
                        'description': f"Immunefi bounty payout: {severity} severity vulnerability",
                        'url': self.leaderboard_url
                    }

                    parsed = self._parse_exploit(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse leaderboard entry: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Failed to scrape Immunefi leaderboard: {e}")

        return exploits

    def _parse_exploit(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse exploit data into standardized format"""

        protocol = data.get('protocol', 'Unknown')
        chain = data.get('chain') or self.extract_chain(data.get('description', '')) or 'Unknown'
        amount_usd = data.get('amount_usd', 0.0)
        description = data.get('description', '')

        # Timestamp - Immunefi doesn't always show dates publicly
        timestamp = datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'immunefi')

        # Categorize
        category = self._categorize_report(data)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': data.get('url', self.exploits_url),
            'category': category,
            'description': description[:500],
            'recovery_status': 'Whitehat'  # Immunefi reports are whitehat disclosures
        }

    def _categorize_report(self, data: Dict[str, Any]) -> str:
        """Categorize the type of vulnerability"""

        text = data.get('description', '').lower()
        severity = data.get('severity', '').lower()

        # Map severity to category
        if 'critical' in severity:
            return 'Critical Vulnerability'
        elif 'high' in severity:
            return 'High Severity Bug'

        # Check description
        categories = {
            'Smart Contract Bug': ['smart contract', 'solidity'],
            'Reentrancy': ['reentrancy'],
            'Access Control': ['access control', 'privilege'],
            'Oracle Manipulation': ['oracle', 'price'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Bug Bounty'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = ImmunefiAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} reports from Immunefi:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Category: {exploit['category']}")
        print(f"   Status: {exploit['recovery_status']}")
