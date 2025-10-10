# -*- coding: utf-8 -*-
"""
OpenZeppelin Aggregator
Fetches security advisories and audit disclosures from OpenZeppelin
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class OpenZeppelinAggregator(BaseAggregator):
    """Aggregates security findings from OpenZeppelin"""

    def __init__(self):
        super().__init__('openzeppelin')
        self.blog_url = 'https://blog.openzeppelin.com/'
        self.security_url = 'https://blog.openzeppelin.com/security-audits'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch security disclosures from OpenZeppelin"""

        self.logger.info(f"Fetching from {self.blog_url}")

        exploits = []

        try:
            # Scrape blog for security posts
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} disclosures from OpenZeppelin")

        except Exception as e:
            self.logger.error(f"Failed to fetch OpenZeppelin: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape blog for security disclosures"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog posts/articles
            posts = soup.find_all(['article', 'div'], class_=['post', 'article', 'blog-post'])

            for post in posts:
                try:
                    # Extract title
                    title_elem = post.find(['h1', 'h2', 'h3', 'a'], class_=['title', 'post-title', 'entry-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)

                    # Only process security-related posts
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'vulnerability', 'security', 'disclosure', 'postmortem',
                        'audit', 'exploit', 'bug', 'critical', 'hack'
                    ]):
                        continue

                    # Extract link
                    link = title_elem.get('href') if title_elem.name == 'a' else None
                    if not link:
                        link_elem = post.find('a', href=True)
                        link = link_elem['href'] if link_elem else None

                    # Make link absolute
                    if link and not link.startswith('http'):
                        link = f"https://blog.openzeppelin.com{link}"

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

            self.logger.info(f"Scraped {len(exploits)} disclosures from OpenZeppelin blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape OpenZeppelin blog: {e}")

        return exploits

    def _parse_disclosure(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse disclosure into standardized exploit format"""

        title = data.get('title', '')
        description = data.get('description', '')

        # Extract protocol/project name from title
        protocol = self._extract_protocol(title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title) or 'Ethereum'  # OpenZeppelin primarily works with Ethereum

        # Extract amount if mentioned
        amount_usd = self.parse_amount(description + ' ' + title)

        # Parse timestamp
        date_str = data.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10], 'openzeppelin')

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
            'OpenZeppelin',
            'Audit of',
            'Security Audit',
            'Postmortem:',
            'Disclosure:',
            'Vulnerability in',
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
                    if len(cleaned) > 2 and not cleaned.lower() in ['the', 'a', 'an']:
                        return cleaned

        return title[:100] or 'Unknown'

    def _categorize_disclosure(self, title: str, description: str) -> str:
        """Categorize the type of vulnerability"""

        text = (title + ' ' + description).lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Access Control': ['access control', 'unauthorized', 'ownable'],
            'Integer Overflow': ['overflow', 'underflow', 'safemath'],
            'Proxy Pattern': ['proxy', 'upgrade', 'delegatecall'],
            'Token Standard': ['erc20', 'erc721', 'erc1155', 'token'],
            'Governance': ['governance', 'voting', 'timelock'],
            'Smart Contract Bug': ['smart contract', 'solidity'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Security Advisory'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = OpenZeppelinAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} disclosures from OpenZeppelin:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
