# -*- coding: utf-8 -*-
"""
HackerOne Aggregator
Fetches public blockchain/crypto vulnerability disclosures from HackerOne
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class HackerOneAggregator(BaseAggregator):
    """Aggregates public vulnerability disclosures from HackerOne"""

    def __init__(self, api_token: str = None):
        super().__init__('hackerone')
        self.hacktivity_url = 'https://hackerone.com/hacktivity'
        self.api_url = 'https://api.hackerone.com/v1/hackers/hacktivity'
        self.api_token = api_token or os.getenv('HACKERONE_API_TOKEN')

        # Add API token if available
        if self.api_token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_token}'
            })

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch public disclosures from HackerOne"""

        self.logger.info(f"Fetching from {self.hacktivity_url}")

        exploits = []

        try:
            # Try API first if token available
            if self.api_token:
                api_exploits = self._fetch_from_api()
                exploits.extend(api_exploits)
            else:
                # Fallback to web scraping
                scraped_exploits = self._scrape_hacktivity()
                exploits.extend(scraped_exploits)

            self.logger.info(f"Fetched {len(exploits)} disclosures from HackerOne")

        except Exception as e:
            self.logger.error(f"Failed to fetch HackerOne: {e}")

        return exploits

    def _fetch_from_api(self) -> List[Dict[str, Any]]:
        """Fetch disclosures from HackerOne API"""

        exploits = []

        try:
            # Query for disclosed reports
            params = {
                'filter[disclosed]': 'true',
                'page[size]': 100,
                'sort': '-disclosed_at'
            }

            response = self.make_request(
                self.api_url,
                headers={'Accept': 'application/json'}
            )

            if not response:
                return []

            data = response.json()
            reports = data.get('data', [])

            for report in reports:
                try:
                    # Only process blockchain/crypto related reports
                    attributes = report.get('attributes', {})
                    title = attributes.get('title', '')

                    # Filter for crypto/blockchain keywords
                    if not self._is_crypto_related(title, attributes):
                        continue

                    exploit = self._parse_report(report)
                    if exploit and self.validate_exploit(exploit):
                        exploits.append(exploit)

                except Exception as e:
                    self.logger.error(f"Failed to parse report: {e}")
                    continue

            self.logger.info(f"Fetched {len(exploits)} reports from HackerOne API")

        except Exception as e:
            self.logger.error(f"Failed to fetch from HackerOne API: {e}")

        return exploits

    def _scrape_hacktivity(self) -> List[Dict[str, Any]]:
        """Scrape public disclosures from HackerOne Hacktivity page"""

        exploits = []

        try:
            response = self.make_request(self.hacktivity_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find disclosed reports
            # Note: HackerOne uses heavy JavaScript, so scraping may be limited
            reports = soup.find_all(['div', 'article'], class_=['hacktivity-item', 'report'])

            for report in reports:
                try:
                    # Extract title
                    title_elem = report.find(['h3', 'h4', 'a'], class_=['title', 'report-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process crypto/blockchain reports
                    if not self._is_crypto_related(title, {}):
                        continue

                    # Extract link
                    link = title_elem.get('href') if title_elem.name == 'a' else None
                    if link and not link.startswith('http'):
                        link = f"https://hackerone.com{link}"

                    # Extract bounty amount
                    bounty_elem = report.find(['span', 'div'], class_=['bounty', 'bounty-amount'])
                    bounty_text = bounty_elem.get_text(strip=True) if bounty_elem else ''
                    bounty_amount = self.parse_amount(bounty_text)

                    # Extract program/target
                    program_elem = report.find(['span', 'div'], class_=['program', 'team-name'])
                    program = program_elem.get_text(strip=True) if program_elem else 'Unknown'

                    # Extract date
                    date_elem = report.find(['time', 'span'], class_=['disclosed-at', 'timestamp'])
                    date_str = date_elem.get('datetime') or date_elem.get_text(strip=True) if date_elem else None

                    exploit = {
                        'title': title,
                        'program': program,
                        'bounty': bounty_amount,
                        'url': link or self.hacktivity_url,
                        'date': date_str
                    }

                    parsed = self._parse_report_dict(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse report: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} reports from HackerOne")

        except Exception as e:
            self.logger.error(f"Failed to scrape HackerOne: {e}")

        return exploits

    def _is_crypto_related(self, title: str, attributes: Dict[str, Any]) -> bool:
        """Check if report is related to blockchain/crypto"""

        text = (title + ' ' + str(attributes.get('vulnerability_information', ''))).lower()

        keywords = [
            'blockchain', 'crypto', 'ethereum', 'bitcoin', 'web3',
            'smart contract', 'solidity', 'defi', 'nft', 'wallet',
            'metamask', 'coinbase', 'binance', 'token', 'dao'
        ]

        return any(keyword in text for keyword in keywords)

    def _parse_report(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """Parse HackerOne API report into standardized format"""

        attributes = report.get('attributes', {})
        relationships = report.get('relationships', {})

        # Extract info
        title = attributes.get('title', 'Unknown')
        program_data = relationships.get('program', {}).get('data', {})
        program = program_data.get('attributes', {}).get('name', 'Unknown')

        # Extract bounty
        bounty = attributes.get('bounty_awarded', 0)

        # Extract date
        disclosed_at = attributes.get('disclosed_at')
        timestamp = self.parse_date(disclosed_at) if disclosed_at else datetime.now()

        # Extract chain (if mentioned)
        vuln_info = attributes.get('vulnerability_information', '')
        chain = self.extract_chain(vuln_info + ' ' + title) or 'Multiple'

        # Generate tx_hash
        report_id = report.get('id', '')
        tx_hash = self.generate_tx_hash(program, report_id, timestamp.isoformat()[:10])

        # Build source URL
        source_url = f"https://hackerone.com/reports/{report_id}" if report_id else self.hacktivity_url

        # Categorize
        category = self._categorize_vulnerability(title, vuln_info)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': program,
            'amount_usd': float(bounty),
            'timestamp': timestamp,
            'source': self.name,
            'source_url': source_url,
            'category': category,
            'description': f"HackerOne disclosure: {title}",
            'recovery_status': 'Whitehat'  # Bug bounty disclosures are whitehat
        }

    def _parse_report_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse scraped report dict into standardized format"""

        title = data.get('title', 'Unknown')
        program = data.get('program', 'Unknown')
        bounty = data.get('bounty', 0.0)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Extract chain
        chain = self.extract_chain(title) or 'Multiple'

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(program, title, timestamp.isoformat()[:10])

        # Categorize
        category = self._categorize_vulnerability(title, '')

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': program,
            'amount_usd': bounty,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': data.get('url', self.hacktivity_url),
            'category': category,
            'description': f"HackerOne disclosure: {title}",
            'recovery_status': 'Whitehat'
        }

    def _categorize_vulnerability(self, title: str, description: str) -> str:
        """Categorize the type of vulnerability"""

        text = (title + ' ' + description).lower()

        categories = {
            'Smart Contract Bug': ['smart contract', 'solidity', 'reentrancy'],
            'Authentication': ['authentication', 'auth bypass', 'session'],
            'Authorization': ['authorization', 'access control', 'privilege'],
            'Code Injection': ['injection', 'xss', 'sql', 'rce'],
            'Cryptographic': ['cryptographic', 'encryption', 'signature'],
            'Information Disclosure': ['information disclosure', 'data leak'],
            'Business Logic': ['business logic', 'logic error'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Bug Bounty Disclosure'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = HackerOneAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} disclosures from HackerOne:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Bounty: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
