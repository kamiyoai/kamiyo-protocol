# -*- coding: utf-8 -*-
"""
Twitter/X Aggregator
Monitors security researchers and keywords for exploit mentions
Uses scraping approach (no expensive API needed)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
import time
from datetime import datetime
from typing import List, Dict, Any
from aggregators.base import BaseAggregator

# For now, we'll prepare the structure - actual scraping requires additional setup
# Users can plug in their preferred scraping method (playwright, selenium, or nitter instances)


class TwitterAggregator(BaseAggregator):
    """Aggregates exploits from Twitter/X security researchers"""

    def __init__(self):
        super().__init__('twitter')

        # Top security researchers and alert accounts
        self.accounts_to_monitor = [
            'pcaversaccio',      # Smart contract security
            'samczsun',          # Paradigm researcher
            'zachxbt',           # On-chain investigator
            'PeckShieldAlert',   # Real-time alerts
            'CertiKAlert',       # CertiK alerts
            'BlockSecTeam',      # BlockSec team
            'slowmist_team',     # SlowMist alerts
            'HalbornSecurity',   # Halborn security
            'immunefi',          # Bug bounty platform
            'BeosinAlert',       # Beosin alerts
            'AnciliaInc',        # On-chain monitoring
            'runtime_xyz'        # Formal verification
        ]

        # Search queries for exploit detection
        self.search_queries = [
            'rugpull crypto',
            'exploit defi',
            'hack blockchain',
            'drain contract',
            'flash loan attack',
            'vulnerability disclosed',
            'emergency pause protocol'
        ]

        # Patterns to detect exploit mentions
        self.exploit_patterns = [
            r'\$(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)\s*(?:lost|stolen|drained|exploited)',
            r'(?:exploit|hack|rugpull|drain)\s+(?:of|on)\s+(\w+)',
            r'tx:\s*0x[a-fA-F0-9]{64}',
            r'attacker:\s*0x[a-fA-F0-9]{40}',
        ]

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch exploits from Twitter

        NOTE: This is a framework. Users need to implement actual scraping
        based on their preferred method:

        1. Official API (requires paid tier)
        2. Playwright/Selenium scraping
        3. Nitter instances (free Twitter frontend)
        4. Third-party aggregators
        """

        self.logger.info("Twitter aggregator initialized")
        self.logger.info(f"Monitoring {len(self.accounts_to_monitor)} accounts")
        self.logger.info(f"Tracking {len(self.search_queries)} search queries")

        exploits = []

        # IMPLEMENTATION OPTIONS:

        # Option 1: Nitter (recommended for free access)
        # exploits.extend(self._fetch_from_nitter())

        # Option 2: Official API (if available)
        # exploits.extend(self._fetch_from_api())

        # Option 3: Direct scraping
        # exploits.extend(self._fetch_from_scraping())

        # For now, return empty list with instructions
        self.logger.warning("Twitter scraping not configured")
        self.logger.info("To enable Twitter monitoring:")
        self.logger.info("1. Implement _fetch_from_nitter() for free access")
        self.logger.info("2. Or add Twitter API credentials")
        self.logger.info("3. See aggregators/twitter.py for details")

        return exploits

    def _parse_tweet(self, tweet_text: str, author: str, tweet_url: str = None) -> Dict[str, Any]:
        """Parse tweet for exploit information"""

        # Extract protocol name
        protocol = self._extract_protocol_from_text(tweet_text)

        # Extract amount
        amount = self._extract_amount_from_text(tweet_text)

        # Extract chain
        chain = self.extract_chain(tweet_text)

        # Extract transaction hash if present
        tx_match = re.search(r'0x[a-fA-F0-9]{64}', tweet_text)
        tx_hash = tx_match.group(0) if tx_match else None

        # If no tx_hash, generate one
        if not tx_hash:
            tx_hash = self.generate_tx_hash(protocol, author, tweet_text[:50])

        # Categorize
        category = self._categorize_from_text(tweet_text)

        return {
            'tx_hash': tx_hash,
            'chain': chain or 'Unknown',
            'protocol': protocol,
            'amount_usd': amount,
            'timestamp': datetime.now(),
            'source': self.name,
            'source_url': tweet_url,
            'category': category,
            'description': tweet_text[:500],
            'recovery_status': None
        }

    def _extract_protocol_from_text(self, text: str) -> str:
        """Extract protocol name from tweet text"""

        # Look for common patterns
        patterns = [
            r'(?:exploit|hack|rugpull|drain)\s+(?:of|on)\s+(\w+)',
            r'(\w+)\s+(?:exploited|hacked|drained)',
            r'@(\w+)\s+(?:exploit|hack)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).title()

        return 'Unknown'

    def _extract_amount_from_text(self, text: str) -> float:
        """Extract dollar amount from tweet"""

        patterns = [
            r'\$(\d+(?:\.\d+)?)\s*(?:million|M)\b',
            r'\$(\d+(?:\.\d+)?)\s*(?:billion|B)\b',
            r'(\d+(?:\.\d+)?)\s*(?:million|M)\s+(?:lost|stolen|drained)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                amount = float(match.group(1))
                if 'billion' in text.lower() or 'B' in match.group(0):
                    return amount * 1_000_000_000
                else:
                    return amount * 1_000_000

        return 0.0

    def _categorize_from_text(self, text: str) -> str:
        """Categorize exploit type from text"""

        text_lower = text.lower()

        categories = {
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Flash Loan': ['flash loan', 'flashloan'],
            'Oracle Manipulation': ['oracle', 'price manipulation'],
            'Access Control': ['private key', 'compromised', 'multisig'],
            'Bridge Exploit': ['bridge', 'cross-chain'],
            'Rugpull': ['rug pull', 'rugpull', 'exit scam'],
            'Smart Contract Bug': ['bug', 'vulnerability'],
        }

        for category, keywords in categories.items():
            if any(keyword in text_lower for keyword in keywords):
                return category

        return 'Unknown'

    # IMPLEMENTATION HELPERS (uncomment when ready to use)

    def _fetch_from_nitter(self) -> List[Dict[str, Any]]:
        """
        Fetch from Nitter instance (free Twitter frontend)

        Example implementation:
        """
        # import requests
        # from bs4 import BeautifulSoup

        # exploits = []
        # nitter_instance = "https://nitter.net"  # Or other instance

        # for account in self.accounts_to_monitor:
        #     url = f"{nitter_instance}/{account}"
        #     response = self.make_request(url)
        #     if response:
        #         soup = BeautifulSoup(response.text, 'html.parser')
        #         tweets = soup.find_all('div', class_='tweet-content')
        #
        #         for tweet in tweets:
        #             text = tweet.get_text()
        #             if self._is_exploit_related(text):
        #                 exploit = self._parse_tweet(text, account)
        #                 exploits.append(exploit)

        # return exploits
        pass

    def _fetch_from_api(self) -> List[Dict[str, Any]]:
        """
        Fetch using official Twitter API (requires credentials)

        Example implementation:
        """
        # import tweepy

        # client = tweepy.Client(bearer_token=os.getenv('TWITTER_BEARER_TOKEN'))
        # exploits = []

        # for query in self.search_queries:
        #     tweets = client.search_recent_tweets(
        #         query=query,
        #         max_results=100,
        #         tweet_fields=['created_at', 'author_id']
        #     )
        #
        #     for tweet in tweets.data:
        #         if self._is_exploit_related(tweet.text):
        #             exploit = self._parse_tweet(tweet.text, tweet.author_id)
        #             exploits.append(exploit)

        # return exploits
        pass

    def _is_exploit_related(self, text: str) -> bool:
        """Check if tweet is likely about an exploit"""

        keywords = [
            'exploit', 'hack', 'rugpull', 'drain', 'stolen',
            'vulnerability', 'attack', 'breach', 'compromised'
        ]

        text_lower = text.lower()
        return any(keyword in text_lower for keyword in keywords)


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = TwitterAggregator()

    print("\nTwitter Aggregator Initialized")
    print(f"Monitoring: {len(aggregator.accounts_to_monitor)} accounts")
    print(f"Search queries: {len(aggregator.search_queries)}")

    print("\nTop accounts to monitor:")
    for i, account in enumerate(aggregator.accounts_to_monitor[:5], 1):
        print(f"  {i}. @{account}")

    print("\nTo enable Twitter scraping, implement one of:")
    print("  1. _fetch_from_nitter() - Free, no API needed")
    print("  2. _fetch_from_api() - Official API (paid)")
    print("  3. Custom scraping solution")

    # Test parsing
    sample_tweet = "$5.2M stolen from ExampleDEX on Ethereum via flash loan attack. Tx: 0x1234..."
    print(f"\nTest parsing: '{sample_tweet}'")
    parsed = aggregator._parse_tweet(sample_tweet, "test_user")
    print(f"  Protocol: {parsed['protocol']}")
    print(f"  Amount: ${parsed['amount_usd']:,.0f}")
    print(f"  Chain: {parsed['chain']}")
    print(f"  Category: {parsed['category']}")
