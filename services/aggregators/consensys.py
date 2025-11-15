# -*- coding: utf-8 -*-
"""
ConsenSys Diligence Aggregator
Fetches security audit reports and disclosed vulnerabilities from ConsenSys Diligence
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class ConsensysAggregator(BaseAggregator):
    """Aggregates disclosed vulnerabilities from ConsenSys Diligence"""

    def __init__(self):
        super().__init__('consensys_diligence')
        self.blog_url = 'https://consensys.io/diligence/blog/'
        self.audits_url = 'https://consensys.io/diligence/audits/'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch disclosed vulnerabilities from ConsenSys Diligence"""

        self.logger.info(f"Fetching from {self.blog_url}")

        exploits = []

        try:
            # Scrape blog for disclosed vulnerabilities
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} disclosures from ConsenSys Diligence")

        except Exception as e:
            self.logger.error(f"Failed to fetch ConsenSys Diligence: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape blog for vulnerability disclosures and postmortems"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog post cards
            posts = soup.find_all(['article', 'div'], class_=['post', 'blog-post', 'article-card'])

            for post in posts:
                try:
                    # Extract title
                    title_elem = post.find(['h2', 'h3', 'a'], class_=['title', 'post-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process vulnerability disclosures and postmortems
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'vulnerability', 'exploit', 'postmortem', 'disclosure',
                        'critical', 'security', 'hack', 'bug'
                    ]):
                        continue

                    # Extract link
                    link = title_elem.get('href') if title_elem.name == 'a' else None
                    if not link:
                        link_elem = post.find('a', href=True)
                        link = link_elem['href'] if link_elem else None

                    # Make link absolute
                    if link and not link.startswith('http'):
                        link = f"https://consensys.io{link}"

                    # Extract description
                    desc_elem = post.find(['p', 'div'], class_=['excerpt', 'description', 'summary'])
                    description = desc_elem.get_text(strip=True) if desc_elem else ''

                    # Extract date
                    date_elem = post.find(['time', 'span'], class_=['date', 'published'])
                    date_str = date_elem.get('datetime') or date_elem.get_text(strip=True) if date_elem else None

                    exploit = {
                        'title': title,
                        'description': description,
                        'url': link or self.blog_url,
                        'date': date_str
                    }

                    parsed = self._parse_disclosure(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse blog post: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} disclosures from ConsenSys blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape ConsenSys blog: {e}")

        return exploits

    def _parse_disclosure(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse disclosure into standardized exploit format"""

        title = data.get('title', '')
        description = data.get('description', '')

        # Extract protocol/project name from title
        protocol = self._extract_protocol(title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title) or 'Ethereum'  # ConsenSys primarily audits Ethereum

        # Extract amount if mentioned
        amount_usd = self.parse_amount(description + ' ' + title)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash (disclosures don't have tx hashes)
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'consensys')

        # Categorize
        category = self._categorize_disclosure(title, description)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': data.get('url', self.blog_url),
            'category': category,
            'description': description[:500] if description else title[:500],
            'recovery_status': None
        }

    def _extract_protocol(self, title: str) -> str:
        """Extract protocol/project name from title"""

        if not title:
            return 'Unknown'

        # Remove common prefixes/suffixes
        for word in ['Postmortem:', 'Disclosure:', 'Vulnerability', 'in', 'Security', 'Audit']:
            title = title.replace(word, '')

        # Clean up
        title = title.strip().strip(':').strip('-').strip()

        # Take first part if contains separators
        for sep in ['-', ':', '|']:
            if sep in title:
                parts = title.split(sep)
                for part in parts:
                    if len(part.strip()) > 2:
                        return part.strip()

        return title[:100] or 'Unknown'

    def _categorize_disclosure(self, title: str, description: str) -> str:
        """Categorize the type of vulnerability"""

        text = (title + ' ' + description).lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Access Control': ['access control', 'unauthorized', 'privilege'],
            'Integer Overflow': ['overflow', 'underflow'],
            'Front Running': ['front-running', 'frontrun', 'mev'],
            'Oracle Manipulation': ['oracle', 'price manipulation'],
            'Denial of Service': ['dos', 'denial of service'],
            'Logic Error': ['logic error', 'business logic'],
            'Smart Contract Bug': ['smart contract', 'solidity'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Security Disclosure'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = ConsensysAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} disclosures from ConsenSys Diligence:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
