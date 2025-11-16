# -*- coding: utf-8 -*-
"""
Chainalysis Aggregator
Fetches public security incidents from Chainalysis reports
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup


class ChainalysisAggregator(BaseAggregator):
    """Aggregates exploits from Chainalysis public reports"""

    def __init__(self):
        super().__init__('chainalysis')
        self.blog_url = 'https://www.chainalysis.com/blog/'
        self.reports_url = 'https://www.chainalysis.com/reports/'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from Chainalysis public reports"""

        self.logger.info(f"Fetching from {self.blog_url}")

        exploits = []

        try:
            # Fetch blog posts
            blog_exploits = self._scrape_blog()
            exploits.extend(blog_exploits)

            self.logger.info(f"Fetched {len(exploits)} exploits from Chainalysis")

        except Exception as e:
            self.logger.error(f"Failed to fetch Chainalysis: {e}")

        return exploits

    def _scrape_blog(self) -> List[Dict[str, Any]]:
        """Scrape Chainalysis blog for hack/exploit reports"""

        exploits = []

        try:
            response = self.make_request(self.blog_url)
            if not response:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog post cards
            posts = soup.find_all(['article', 'div'], class_=['post', 'blog-post', 'article'])

            for post in posts:
                try:
                    # Extract title and link
                    title_elem = post.find(['h2', 'h3', 'a'], class_=['title', 'post-title'])
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)
                    link = title_elem.get('href') if title_elem.name == 'a' else None

                    if not link:
                        link_elem = post.find('a', href=True)
                        link = link_elem['href'] if link_elem else None

                    # Make link absolute
                    if link and not link.startswith('http'):
                        link = f"https://www.chainalysis.com{link}"

                    # Only process hack/exploit/ransomware related posts
                    title_lower = title.lower()
                    if not any(word in title_lower for word in [
                        'hack', 'exploit', 'attack', 'breach', 'stolen', 'ransomware', 'theft'
                    ]):
                        continue

                    # Extract excerpt/description
                    excerpt_elem = post.find(['p', 'div'], class_=['excerpt', 'description', 'summary'])
                    excerpt = excerpt_elem.get_text(strip=True) if excerpt_elem else ''

                    # Extract date
                    date_elem = post.find(['time', 'span'], class_=['date', 'published', 'post-date'])
                    date_str = date_elem.get('datetime') or date_elem.get_text(strip=True) if date_elem else None

                    exploit = {
                        'title': title,
                        'description': excerpt,
                        'url': link or self.blog_url,
                        'date': date_str
                    }

                    parsed = self._parse_post(exploit)
                    if parsed and self.validate_exploit(parsed):
                        exploits.append(parsed)

                except Exception as e:
                    self.logger.error(f"Failed to parse blog post: {e}")
                    continue

            self.logger.info(f"Scraped {len(exploits)} exploits from Chainalysis blog")

        except Exception as e:
            self.logger.error(f"Failed to scrape Chainalysis blog: {e}")

        return exploits

    def _parse_post(self, post: Dict[str, Any]) -> Dict[str, Any]:
        """Parse blog post into standardized exploit format"""

        title = post.get('title', '')
        description = post.get('description', '')

        # Extract protocol/project name from title
        # Example: "Lazarus Group Exploits [Protocol]"
        protocol = self._extract_protocol(title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title) or 'Unknown'

        # Extract amount
        amount_usd = self.parse_amount(description + ' ' + title)

        # Parse timestamp
        date_str = post.get('date')
        timestamp = self.parse_date(date_str) if date_str else datetime.now()

        # Generate tx_hash (Chainalysis reports don't always have specific tx hashes)
        tx_hash = self.generate_tx_hash(protocol, chain, timestamp.isoformat()[:10])

        # Categorize
        category = self._categorize_post(title, description)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': post.get('url', self.blog_url),
            'category': category,
            'description': description[:500] if description else title[:500],
            'recovery_status': None
        }

    def _extract_protocol(self, title: str) -> str:
        """Extract protocol/target name from title"""

        if not title:
            return 'Unknown'

        # Remove common prefixes
        for prefix in [
            'Lazarus Group',
            'North Korea',
            'Chainalysis:',
            'Report:',
            'Analysis:'
        ]:
            title = title.replace(prefix, '')

        # Remove common keywords to isolate protocol name
        for keyword in ['Hack', 'Exploit', 'Attack', 'Breach', 'Theft', 'Stolen']:
            parts = title.split(keyword)
            if len(parts) > 1:
                # Take the part after the keyword if it's longer
                potential_protocol = parts[1].strip()
                if len(potential_protocol) > 3:
                    return potential_protocol.split('-')[0].split(':')[0].strip()

        return title.strip()[:100] or 'Unknown'

    def _categorize_post(self, title: str, description: str) -> str:
        """Categorize the type of security incident"""

        text = (title + ' ' + description).lower()

        categories = {
            'State-Sponsored': ['lazarus', 'north korea', 'state-sponsored', 'apt'],
            'Ransomware': ['ransomware', 'ransom'],
            'Bridge Exploit': ['bridge'],
            'Exchange Hack': ['exchange', 'cex'],
            'DeFi Exploit': ['defi', 'protocol'],
            'Smart Contract Bug': ['smart contract', 'vulnerability'],
            'Access Control': ['private key', 'compromised'],
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

    aggregator = ChainalysisAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from Chainalysis:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
