# -*- coding: utf-8 -*-
"""
Quantstamp Aggregator
Fetches security audit findings and disclosures from Quantstamp
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class QuantstampAggregator(BaseAggregator):
    """Aggregates security findings from Quantstamp audits and blog"""

    def __init__(self):
        super().__init__('quantstamp')
        self.blog_url = 'https://quantstamp.com/blog'
        self.audits_url = 'https://quantstamp.com/audits'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch security disclosures from Quantstamp"""

        self.logger.info(f"Fetching from {self.blog_url}")

        exploits = []

        try:
            # Scrape blog for security disclosures
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} disclosures from Quantstamp")

        except Exception as e:
            self.logger.error(f"Failed to fetch Quantstamp: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape blog for vulnerability disclosures and security posts"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog posts
            posts = soup.find_all(['article', 'div'], class_=['blog-post', 'post', 'article'])

            for post in posts:
                try:
                    # Extract title
                    title_elem = post.find(['h1', 'h2', 'h3'], class_=['title', 'post-title', 'entry-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process security-related posts
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'vulnerability', 'exploit', 'disclosure', 'security',
                        'audit', 'critical', 'bug', 'hack', 'breach'
                    ]):
                        continue

                    # Extract link
                    link_elem = post.find('a', href=True)
                    link = link_elem['href'] if link_elem else None

                    # Make link absolute
                    if link and not link.startswith('http'):
                        link = f"https://quantstamp.com{link}"

                    # Extract description
                    desc_elem = post.find(['p', 'div'], class_=['excerpt', 'description', 'summary'])
                    description = desc_elem.get_text(strip=True) if desc_elem else ''

                    # Extract date
                    date_elem = post.find(['time', 'span'], class_=['date', 'published', 'post-date'])
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

            self.logger.info(f"Scraped {len(exploits)} disclosures from Quantstamp blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape Quantstamp blog: {e}")

        return exploits

    def _parse_disclosure(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse disclosure into standardized exploit format"""

        title = data.get('title', '')
        description = data.get('description', '')

        # Extract protocol/project name from title
        protocol = self._extract_protocol(title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title) or 'Ethereum'  # Quantstamp primarily audits Ethereum

        # Extract amount if mentioned
        amount_usd = self.parse_amount(description + ' ' + title)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'quantstamp')

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

        # Remove common phrases
        for phrase in [
            'Audit of',
            'Security Audit:',
            'Quantstamp',
            'Vulnerability in',
            'Disclosure:',
        ]:
            title = title.replace(phrase, '')

        # Clean up
        title = title.strip().strip(':').strip('-').strip()

        # Take first meaningful part
        for sep in ['-', ':', '|']:
            if sep in title:
                parts = title.split(sep)
                for part in parts:
                    cleaned = part.strip()
                    if len(cleaned) > 2:
                        return cleaned

        return title[:100] or 'Unknown'

    def _categorize_disclosure(self, title: str, description: str) -> str:
        """Categorize the type of vulnerability"""

        text = (title + ' ' + description).lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Access Control': ['access control', 'unauthorized', 'privilege'],
            'Integer Overflow': ['overflow', 'underflow', 'integer'],
            'Oracle Manipulation': ['oracle', 'price feed'],
            'Front Running': ['front-running', 'mev'],
            'Logic Error': ['logic error', 'business logic'],
            'Smart Contract Bug': ['smart contract', 'solidity'],
            'Gas Optimization': ['gas', 'optimization'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Audit Finding'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = QuantstampAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} disclosures from Quantstamp:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
