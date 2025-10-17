# -*- coding: utf-8 -*-
"""
BlockSec Aggregator
Fetches exploit alerts from BlockSec's public sources
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup
import re


class BlockSecAggregator(BaseAggregator):
    """Aggregates exploits from BlockSec security alerts"""

    def __init__(self):
        super().__init__('blocksec')
        self.blog_url = 'https://blocksec.com/blog'
        self.twitter_handle = 'BlockSecTeam'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from BlockSec sources"""

        self.logger.info(f"Fetching from BlockSec blog")

        exploits = []

        try:
            # Scrape blog for security incident analysis
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} exploits from BlockSec")

        except Exception as e:
            self.logger.error(f"Failed to fetch BlockSec: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape BlockSec blog for security incident analysis"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog post entries
            articles = soup.find_all(['article', 'div'], class_=['post', 'blog-post', 'article', 'blog-item'])

            for article in articles:
                try:
                    # Extract title
                    title_elem = article.find(['h1', 'h2', 'h3', 'a'], class_=['title', 'post-title', 'entry-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)
                    title_lower = title.lower()

                    # Only process hack/exploit related posts
                    if not any(word in title_lower for word in [
                        'hack', 'exploit', 'attack', 'breach', 'vulnerability',
                        'incident', 'post-mortem', 'analysis', 'rugpull', 'drain'
                    ]):
                        continue

                    # Extract description
                    desc_elem = article.find(['p', 'div'], class_=['excerpt', 'description', 'summary'])
                    description = desc_elem.get_text(strip=True) if desc_elem else ''

                    # Extract link
                    link_elem = article.find('a', href=True)
                    link = link_elem['href'] if link_elem else self.blog_url
                    if not link.startswith('http'):
                        link = 'https://blocksec.com' + link

                    # Extract date
                    date_elem = article.find(['time', 'span'], class_=['date', 'published', 'post-date'])
                    date_str = date_elem.get_text(strip=True) if date_elem else None

                    exploit = {
                        'title': title,
                        'description': description,
                        'url': link,
                        'date': date_str
                    }

                    parsed = self._parse_alert(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse blog post: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} exploits from BlockSec blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape BlockSec blog: {e}")

        return exploits

    def _parse_alert(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse alert into standardized exploit format"""

        # Extract protocol name from title
        title = data.get('title', '')
        protocol = self._extract_protocol(title)

        # Extract text for parsing
        text = title + ' ' + data.get('description', '')

        # Extract chain
        chain = self.extract_chain(text) or 'Unknown'

        # Extract amount
        amount_usd = self.parse_amount(text)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'blocksec')

        # Categorize
        category = self._categorize_alert(text)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': data.get('url', self.blog_url),
            'category': category,
            'description': data.get('description', '')[:500],
            'recovery_status': None
        }

    def _extract_protocol(self, title: str) -> str:
        """Extract protocol name from title"""

        if not title:
            return 'Unknown'

        # Common BlockSec title patterns
        # e.g., "ProjectName Hack Analysis", "Post-Mortem: ProjectName Attack"

        # Remove common prefixes/suffixes
        for phrase in [
            'BlockSec:',
            'Security Alert:',
            'Hack Analysis:',
            'Post-Mortem:',
            'Analysis of',
            'Incident Report:',
            'Technical Analysis:',
        ]:
            title = title.replace(phrase, '')

        # Clean up
        title = title.strip().strip(':').strip('-').strip()

        # Take first part before separator
        for sep in [' - ', ' | ', ': ', 'Hack', 'Attack', 'Exploit', 'Incident']:
            if sep in title:
                parts = title.split(sep)
                if parts[0].strip():
                    return parts[0].strip()

        return title[:100] or 'Unknown'

    def _categorize_alert(self, text: str) -> str:
        """Categorize the type of exploit"""

        text_lower = text.lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant', 're-enter'],
            'Flash Loan': ['flash loan', 'flashloan', 'flash-loan'],
            'Oracle Manipulation': ['oracle', 'price manipulation', 'oracle attack'],
            'Access Control': ['access control', 'private key', 'admin key', 'privilege'],
            'Bridge Exploit': ['bridge', 'cross-chain'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam', 'rug-pull'],
            'Smart Contract Bug': ['smart contract', 'bug', 'vulnerability'],
            'MEV': ['mev', 'sandwich', 'front-run', 'back-run'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return category

        return 'Unknown'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = BlockSecAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from BlockSec:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
