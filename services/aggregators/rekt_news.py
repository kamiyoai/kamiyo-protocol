# -*- coding: utf-8 -*-
"""
Rekt News Aggregator
Fetches exploit information from Rekt News RSS feed
"""

import feedparser
import re
from datetime import datetime
from typing import List, Dict, Any
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from aggregators.base import BaseAggregator


class RektNewsAggregator(BaseAggregator):
    """Aggregates exploits from Rekt News RSS feed"""

    def __init__(self):
        super().__init__('rekt_news')
        self.feed_url = 'https://rekt.news/feed.xml'

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch and parse exploits from Rekt News"""

        self.logger.info(f"Fetching from {self.feed_url}")

        try:
            # Parse RSS feed
            feed = feedparser.parse(self.feed_url)

            if feed.bozo:
                self.logger.error(f"Malformed RSS feed: {feed.bozo_exception}")
                return []

            exploits = []

            for entry in feed.entries:
                try:
                    exploit = self._parse_entry(entry)
                    if exploit and self.validate_exploit(exploit):
                        exploits.append(exploit)
                except Exception as e:
                    self.logger.error(f"Failed to parse entry: {e}")
                    continue

            self.logger.info(f"Fetched {len(exploits)} exploits from Rekt News")
            return exploits

        except Exception as e:
            self.logger.error(f"Failed to fetch Rekt News: {e}")
            return []

    def _parse_entry(self, entry) -> Dict[str, Any]:
        """Parse RSS entry into exploit data"""

        # Extract basic info
        title = entry.get('title', '')
        description = entry.get('description', '') or entry.get('summary', '')
        link = entry.get('link', '')
        published = entry.get('published', '')

        # Parse timestamp
        if published:
            timestamp = self.parse_date(published)
        else:
            timestamp = datetime.now()

        # Extract protocol name from title
        # Rekt News titles are typically: "Protocol Name - Rekt"
        protocol = self._extract_protocol(title)

        # Extract amount from description
        amount_usd = self._extract_amount(description + ' ' + title)

        # Extract chain
        chain = self.extract_chain(description + ' ' + title)

        # Generate pseudo tx_hash (Rekt doesn't always provide real ones)
        tx_hash = self.generate_tx_hash(protocol, timestamp.isoformat()[:10])

        # Categorize attack type
        category = self._categorize_attack(description + ' ' + title)

        return {
            'tx_hash': tx_hash,
            'chain': chain or 'Unknown',
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': link,
            'category': category,
            'description': self._clean_description(description),
            'recovery_status': self._extract_recovery_status(description)
        }

    def _extract_protocol(self, title: str) -> str:
        """Extract protocol name from title"""

        if not title:
            return 'Unknown'

        # Remove common suffixes
        for suffix in [' - Rekt', ' - REKT', ' Rekt', ' REKT']:
            if suffix in title:
                title = title.replace(suffix, '')

        return title.strip() or 'Unknown'

    def _extract_amount(self, text: str) -> float:
        """Extract loss amount from text"""

        if not text:
            return 0.0

        # Look for common patterns
        patterns = [
            r'\$(\d+(?:\.\d+)?)\s*(?:million|m)\b',
            r'\$(\d+(?:\.\d+)?)\s*(?:billion|b)\b',
            r'lost\s+\$?(\d+(?:\.\d+)?)\s*(?:million|m)\b',
            r'stolen\s+\$?(\d+(?:\.\d+)?)\s*(?:million|m)\b',
            r'drained\s+\$?(\d+(?:\.\d+)?)\s*(?:million|m)\b',
            r'exploited\s+for\s+\$?(\d+(?:\.\d+)?)\s*(?:million|m)\b',
        ]

        text = text.lower()

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                amount = float(match.group(1))
                if 'billion' in pattern or 'b' in text[match.start():match.end()]:
                    return amount * 1_000_000_000
                else:
                    return amount * 1_000_000

        # Use base class parser as fallback
        return self.parse_amount(text)

    def _categorize_attack(self, text: str) -> str:
        """Categorize attack type from text"""

        if not text:
            return 'Unknown'

        text = text.lower()

        # Category keywords
        categories = {
            'Reentrancy': ['reentrancy', 'reentrant', 're-enter'],
            'Flash Loan': ['flash loan', 'flashloan'],
            'Oracle Manipulation': ['oracle', 'price manipulation', 'twap'],
            'Access Control': ['private key', 'compromised', 'admin', 'privilege'],
            'Bridge Exploit': ['bridge', 'cross-chain'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam'],
            'Smart Contract Bug': ['bug', 'vulnerability', 'exploit'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        return 'Unknown'

    def _extract_recovery_status(self, text: str) -> str:
        """Extract recovery status from text"""

        if not text:
            return None

        text = text.lower()

        if any(word in text for word in ['recovered', 'returned', 'refunded']):
            return 'Recovered'
        elif any(word in text for word in ['partially recovered', 'some funds']):
            return 'Partially Recovered'
        elif any(word in text for word in ['bounty', 'whitehat', 'white hat']):
            return 'Whitehat'

        return None

    def _clean_description(self, description: str) -> str:
        """Clean HTML and excessive text from description"""

        if not description:
            return ''

        # Remove HTML tags
        description = re.sub(r'<[^>]+>', '', description)

        # Limit length
        if len(description) > 500:
            description = description[:497] + '...'

        return description.strip()


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = RektNewsAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} exploits from Rekt News:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
