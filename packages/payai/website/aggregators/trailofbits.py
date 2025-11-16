# -*- coding: utf-8 -*-
"""
Trail of Bits Aggregator
Fetches public security disclosures and audit findings from Trail of Bits
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class TrailOfBitsAggregator(BaseAggregator):
    """Aggregates security disclosures from Trail of Bits"""

    def __init__(self):
        super().__init__('trailofbits')
        self.blog_url = 'https://blog.trailofbits.com/'
        self.publications_url = 'https://github.com/trailofbits/publications'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch security disclosures from Trail of Bits"""

        self.logger.info(f"Fetching from {self.blog_url}")

        exploits = []

        try:
            # Scrape blog for vulnerability disclosures
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} disclosures from Trail of Bits")

        except Exception as e:
            self.logger.error(f"Failed to fetch Trail of Bits: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape blog for security disclosures"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog post cards/articles
            posts = soup.find_all(['article', 'div'], class_=['post', 'entry', 'article'])

            for post in posts:
                try:
                    # Extract title
                    title_elem = post.find(['h1', 'h2', 'h3', 'a'], class_=['title', 'entry-title', 'post-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process security/vulnerability related posts
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'vulnerability', 'exploit', 'disclosure', 'security',
                        'critical', 'audit', 'bug', 'finding'
                    ]):
                        continue

                    # Extract link
                    link = title_elem.get('href') if title_elem.name == 'a' else None
                    if not link:
                        link_elem = post.find('a', href=True)
                        link = link_elem['href'] if link_elem else None

                    # Make link absolute
                    if link and not link.startswith('http'):
                        link = f"https://blog.trailofbits.com{link}"

                    # Extract description/excerpt
                    desc_elem = post.find(['div', 'p'], class_=['excerpt', 'entry-summary', 'description'])
                    description = desc_elem.get_text(strip=True) if desc_elem else ''

                    # Extract date
                    date_elem = post.find(['time', 'span'], class_=['published', 'date', 'post-date'])
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

            self.logger.info(f"Scraped {len(exploits)} disclosures from Trail of Bits blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape Trail of Bits blog: {e}")

        return exploits

    def _parse_disclosure(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse disclosure into standardized exploit format"""

        title = data.get('title', '')
        description = data.get('description', '')

        # Extract protocol/project name from title
        protocol = self._extract_protocol(title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title) or 'Multiple'

        # Extract amount if mentioned
        amount_usd = self.parse_amount(description + ' ' + title)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'trailofbits')

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
            'Vulnerability in',
            'Security audit of',
            'Disclosure:',
            'Critical bug in',
            'Trail of Bits',
        ]:
            title = title.replace(phrase, '')

        # Clean up
        title = title.strip().strip(':').strip('-').strip()

        # Take first meaningful part
        for sep in ['-', ':', '|', 'and']:
            if sep in title:
                parts = title.split(sep)
                for part in parts:
                    cleaned = part.strip()
                    if len(cleaned) > 2 and not cleaned.lower() in ['a', 'an', 'the']:
                        return cleaned

        return title[:100] or 'Unknown'

    def _categorize_disclosure(self, title: str, description: str) -> str:
        """Categorize the type of vulnerability"""

        text = (title + ' ' + description).lower()

        categories = {
            'Memory Safety': ['memory', 'buffer overflow', 'use-after-free'],
            'Cryptographic': ['cryptographic', 'encryption', 'signature', 'random'],
            'Access Control': ['access control', 'authorization', 'permission'],
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Integer Overflow': ['integer overflow', 'underflow'],
            'Logic Error': ['logic error', 'business logic'],
            'Smart Contract Bug': ['smart contract', 'solidity', 'evm'],
            'Consensus': ['consensus', 'validator', 'staking'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Security Finding'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = TrailOfBitsAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} disclosures from Trail of Bits:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
