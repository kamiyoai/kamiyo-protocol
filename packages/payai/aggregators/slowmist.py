# -*- coding: utf-8 -*-
"""
SlowMist Aggregator
Fetches security incidents from SlowMist's Hacked database and blog
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class SlowMistAggregator(BaseAggregator):
    """Aggregates exploits from SlowMist Hacked database"""

    def __init__(self):
        super().__init__('slowmist')
        self.hacked_url = 'https://hacked.slowmist.io/'
        self.blog_url = 'https://slowmist.medium.com/'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from SlowMist sources"""

        self.logger.info(f"Fetching from {self.hacked_url}")

        exploits = []

        try:
            # Try to scrape hacked database
            hacked_exploits = self._scrape_hacked_db()
            exploits.extend(hacked_exploits)

            # Also scrape Medium blog for analysis posts
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} exploits from SlowMist")

        except Exception as e:
            self.logger.error(f"Failed to fetch SlowMist: {e}")

        return exploits

    def _scrape_hacked_db(self) -> List[Dict[str, Any]]:
        """Scrape SlowMist Hacked database"""

        exploits = []

        try:
            response = self.make_request(self.hacked_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find incident entries
            # Note: SlowMist Hacked uses dynamic loading, so might need API approach
            incidents = soup.find_all(['tr', 'div'], class_=['incident', 'hack-entry', 'table-row'])

            for incident in incidents:
                try:
                    # Extract project name
                    name_elem = incident.find(['td', 'div', 'span'], class_=['project', 'name'])
                    if not name_elem:
                        continue

                    protocol = name_elem.get_text(strip=True)

                    # Extract chain
                    chain_elem = incident.find(['td', 'div', 'span'], class_=['chain', 'blockchain'])
                    chain = chain_elem.get_text(strip=True) if chain_elem else 'Unknown'

                    # Extract loss amount
                    amount_elem = incident.find(['td', 'div', 'span'], class_=['loss', 'amount'])
                    amount_text = amount_elem.get_text(strip=True) if amount_elem else ''
                    amount_usd = self.parse_amount(amount_text)

                    # Extract date
                    date_elem = incident.find(['td', 'div', 'span'], class_=['date', 'time'])
                    date_str = date_elem.get_text(strip=True) if date_elem else None

                    # Extract attack type
                    type_elem = incident.find(['td', 'div', 'span'], class_=['type', 'attack-type'])
                    attack_type = type_elem.get_text(strip=True) if type_elem else 'Unknown'

                    exploit = {
                        'protocol': protocol,
                        'chain': chain,
                        'amount_usd': amount_usd,
                        'attack_type': attack_type,
                        'date': date_str,
                        'url': self.hacked_url
                    }

                    parsed = self._parse_incident(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse incident: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} incidents from SlowMist Hacked")

        except Exception as e:
            self.logger.error(f"Failed to scrape SlowMist Hacked: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape SlowMist Medium blog for security analysis"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find Medium articles
            articles = soup.find_all(['article', 'div'], class_=['postArticle', 'streamItem'])

            for article in articles:
                try:
                    # Extract title
                    title_elem = article.find(['h1', 'h2', 'h3'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process hack analysis posts
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'hack', 'exploit', 'attack', 'analysis', 'incident', 'security'
                    ]):
                        continue

                    # Extract link
                    link_elem = article.find('a', href=True)
                    link = link_elem['href'] if link_elem else self.blog_url

                    # Extract description/subtitle
                    desc_elem = article.find(['h4', 'div'], class_=['subtitle', 'description'])
                    description = desc_elem.get_text(strip=True) if desc_elem else ''

                    exploit = {
                        'title': title,
                        'description': description,
                        'url': link,
                        'date': None
                    }

                    parsed = self._parse_incident(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse blog post: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} analyses from SlowMist blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape SlowMist blog: {e}")

        return exploits

    def _parse_incident(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse incident into standardized exploit format"""

        # Get protocol name
        protocol = data.get('protocol') or self._extract_protocol(data.get('title', 'Unknown'))

        # Get chain
        chain = data.get('chain')
        if not chain:
            text = data.get('description', '') + ' ' + data.get('title', '')
            chain = self.extract_chain(text) or 'Unknown'

        # Get amount
        amount_usd = data.get('amount_usd', 0.0)
        if not amount_usd:
            text = data.get('description', '') + ' ' + data.get('title', '')
            amount_usd = self.parse_amount(text)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'slowmist')

        # Categorize
        category = self._categorize_incident(data)

        # Description
        description = data.get('description', '')
        if not description:
            attack_type = data.get('attack_type', '')
            description = f"SlowMist reported {attack_type} attack" if attack_type else ''

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': data.get('url', self.hacked_url),
            'category': category,
            'description': description[:500],
            'recovery_status': None
        }

    def _extract_protocol(self, title: str) -> str:
        """Extract protocol name from title"""

        if not title:
            return 'Unknown'

        # Remove common phrases
        for phrase in [
            'SlowMist:',
            'Analysis of',
            'Hack Analysis',
            'Security Incident',
            'Attack on',
        ]:
            title = title.replace(phrase, '')

        # Clean up
        title = title.strip().strip(':').strip('-').strip()

        # Take first part
        for sep in ['-', ':', '|', 'Hack', 'Attack', 'Exploit']:
            if sep in title:
                parts = title.split(sep)
                if parts[0].strip():
                    return parts[0].strip()

        return title[:100] or 'Unknown'

    def _categorize_incident(self, data: Dict[str, Any]) -> str:
        """Categorize the type of attack"""

        text = (data.get('title', '') + ' ' +
                data.get('description', '') + ' ' +
                data.get('attack_type', '')).lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Flash Loan': ['flash loan', 'flashloan'],
            'Oracle Manipulation': ['oracle', 'price manipulation'],
            'Access Control': ['access control', 'private key', 'admin'],
            'Bridge Exploit': ['bridge', 'cross-chain'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam'],
            'Phishing': ['phishing', 'social engineering'],
            'Smart Contract Bug': ['smart contract', 'vulnerability'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        # Use attack_type if available
        attack_type = data.get('attack_type', '').strip()
        if attack_type and attack_type != 'Unknown':
            return attack_type

        return 'Unknown'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = SlowMistAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from SlowMist:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
