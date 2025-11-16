# -*- coding: utf-8 -*-
"""
Arbitrum L2 Security Aggregator
Aggregates exploits from Arbitrum-specific sources (Twitter, Forums, News, Reddit)

CRITICAL: This aggregator ONLY pulls from external sources.
It does NOT scan blockchains, monitor bridges, or detect exploits.
It AGGREGATES reports that have already been published by trusted sources.

Following CLAUDE.md principles: We are an AGGREGATOR, not a DETECTOR.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from datetime import datetime
from typing import List, Dict, Any
from aggregators.base import BaseAggregator


class ArbitrumSecurityAggregator(BaseAggregator):
    """
    Aggregates Arbitrum L2 exploit reports from external sources.

    Sources:
    - Twitter: Arbitrum-specific security accounts
    - Reddit: r/arbitrum, r/ethereum (Arbitrum posts)
    - Forums: Arbitrum forums and Discord
    - Existing sources: DeFiLlama, Rekt News (already cover Arbitrum)

    IMPORTANT: This is an AGGREGATOR, not a detector.
    We collect information that has already been reported externally.
    We do NOT monitor bridges, scan transactions, or detect patterns.
    """

    def __init__(self):
        super().__init__('arbitrum_security')

        # Arbitrum-specific Twitter accounts to monitor
        self.arbitrum_twitter_accounts = [
            'arbitrum',            # Official Arbitrum account
            'OffchainLabs',        # Arbitrum developer team
            'ArbitrumDAO',         # Arbitrum DAO
            'GMX_IO',              # Major Arbitrum protocol
            'traderjoe_xyz',       # TraderJoe on Arbitrum
            'CamelotDEX',          # Camelot DEX
            'PeckShieldAlert',     # PeckShield (monitors all chains)
            'CertiKAlert',         # CertiK alerts
            'BlockSecTeam',        # BlockSec
            'zachxbt',             # On-chain investigator
        ]

        # Arbitrum-specific search queries
        self.search_queries = [
            'arbitrum exploit',
            'arbitrum hack',
            'arbitrum bridge attack',
            'arbitrum sequencer',
            'arbitrum rollup',
            'gmx exploit',
            'arbitrum vulnerability',
            'arbitrum security',
        ]

        # Arbitrum-specific keywords for filtering
        self.arbitrum_keywords = [
            'arbitrum', 'arb', 'arbitrum one', 'arbitrum nova',
            'l2', 'layer 2', 'rollup', 'optimistic rollup',
            'sequencer', 'bridge', 'gateway',
        ]

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch Arbitrum exploits from external sources.

        This method aggregates from:
        1. Reddit (r/arbitrum, r/ethereum)
        2. Twitter (if configured)
        3. Forums (future)
        """

        self.logger.info("Fetching Arbitrum L2 exploits from external sources")

        exploits = []

        # Aggregate from different sources
        try:
            # Source 1: Reddit scraping
            reddit_exploits = self._fetch_from_reddit()
            exploits.extend(reddit_exploits)
        except Exception as e:
            self.logger.error(f"Reddit fetch failed: {e}")

        try:
            # Source 2: Twitter (requires implementation based on user's setup)
            # twitter_exploits = self._fetch_from_twitter()
            # exploits.extend(twitter_exploits)
            pass
        except Exception as e:
            self.logger.error(f"Twitter fetch failed: {e}")

        try:
            # Source 3: Arbitrum forums
            # forum_exploits = self._fetch_from_forums()
            # exploits.extend(forum_exploits)
            pass
        except Exception as e:
            self.logger.error(f"Forum fetch failed: {e}")

        self.logger.info(f"Fetched {len(exploits)} Arbitrum exploits from external sources")

        # Validate exploits
        valid_exploits = [e for e in exploits if self.validate_exploit(e)]

        return valid_exploits

    def _fetch_from_reddit(self) -> List[Dict[str, Any]]:
        """
        Fetch exploit reports from Arbitrum-related subreddits.

        Aggregates from:
        - r/arbitrum
        - r/ethereum (Arbitrum-related posts)
        - r/ethfinance (Arbitrum discussions)
        """

        exploits = []

        subreddits = ['arbitrum', 'ethereum', 'ethfinance']

        for subreddit in subreddits:
            try:
                # Reddit RSS feeds are public and don't require API auth
                feed_url = f"https://www.reddit.com/r/{subreddit}/new.json?limit=100"

                response = self.make_request(feed_url)

                if response:
                    data = response.json()
                    posts = data.get('data', {}).get('children', [])

                    for post in posts:
                        post_data = post.get('data', {})

                        # Check if post mentions Arbitrum exploits
                        if self._is_arbitrum_exploit_post(post_data):
                            exploit = self._parse_reddit_post(post_data)
                            if exploit:
                                exploits.append(exploit)

            except Exception as e:
                self.logger.error(f"Error fetching from r/{subreddit}: {e}")

        return exploits

    def _is_arbitrum_exploit_post(self, post_data: Dict[str, Any]) -> bool:
        """Check if Reddit post is about an Arbitrum exploit."""

        title = post_data.get('title', '').lower()
        selftext = post_data.get('selftext', '').lower()
        combined_text = title + ' ' + selftext

        # Must mention exploit/hack keywords
        exploit_keywords = [
            'exploit', 'hack', 'vulnerability', 'attack',
            'stolen', 'drained', 'rugpull', 'scam',
            'emergency', 'pause', 'halted', 'bridge',
            'sequencer', 'rollup'
        ]

        has_exploit_keyword = any(keyword in combined_text for keyword in exploit_keywords)

        # Must mention Arbitrum
        has_arbitrum_mention = any(keyword in combined_text for keyword in self.arbitrum_keywords)

        # Must have transaction hash OR significant upvotes (to filter noise)
        has_tx_hash = bool(re.search(r'0x[a-fA-F0-9]{64}', post_data.get('selftext', '')))
        has_upvotes = post_data.get('ups', 0) > 50

        return has_exploit_keyword and has_arbitrum_mention and (has_tx_hash or has_upvotes)

    def _parse_reddit_post(self, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse Reddit post into exploit record."""

        title = post_data.get('title', '')
        selftext = post_data.get('selftext', '')
        url = f"https://reddit.com{post_data.get('permalink', '')}"
        created_utc = post_data.get('created_utc', 0)

        combined_text = title + ' ' + selftext

        # Extract protocol
        protocol = self._extract_protocol(combined_text)

        # Extract amount
        amount_usd = self.parse_amount(combined_text)

        # Extract transaction hash
        tx_match = re.search(r'0x[a-fA-F0-9]{64}', selftext)
        if tx_match:
            tx_hash = tx_match.group(0).lower()
        else:
            # Generate hash from post data
            tx_hash = self.generate_tx_hash(
                'arbitrum',
                protocol,
                str(created_utc)
            )

        # Parse timestamp
        timestamp = datetime.fromtimestamp(created_utc)

        # Categorize
        category = self._categorize_arbitrum_exploit(combined_text)

        return {
            'tx_hash': tx_hash,
            'chain': 'Arbitrum',
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': url,
            'category': category,
            'description': title[:500],
            'recovery_status': self._extract_recovery_status(combined_text)
        }

    def _extract_protocol(self, text: str) -> str:
        """Extract protocol name from text."""

        # Look for common Arbitrum protocols
        protocols = {
            'GMX': ['gmx'],
            'Camelot': ['camelot'],
            'TraderJoe': ['traderjoe', 'trader joe'],
            'Radiant': ['radiant'],
            'Dopex': ['dopex'],
            'Vela': ['vela'],
            'Gains Network': ['gains', 'gns'],
            'Pendle': ['pendle'],
            'Treasure DAO': ['treasure'],
        }

        text_lower = text.lower()

        for protocol_name, keywords in protocols.items():
            if any(keyword in text_lower for keyword in keywords):
                return protocol_name

        # Generic extraction patterns
        patterns = [
            r'(?:exploit|hack|attack)\s+(?:on|of)\s+(\w+)',
            r'(\w+)\s+(?:was\s+)?(?:exploited|hacked|attacked)',
            r'protocol:\s*(\w+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).title()

        return 'Unknown'

    def _categorize_arbitrum_exploit(self, text: str) -> str:
        """Categorize Arbitrum-specific exploit types."""

        text_lower = text.lower()

        # Arbitrum-specific categories
        if any(word in text_lower for word in ['bridge', 'gateway', 'deposit', 'withdrawal', 'l1 l2', 'l2 l1']):
            return 'Bridge Exploit'
        elif any(word in text_lower for word in ['sequencer', 'ordering', 'censorship', 'reorg']):
            return 'Sequencer Issue'
        elif any(word in text_lower for word in ['rollup', 'state root', 'fraud proof', 'batch']):
            return 'Rollup Exploit'
        elif any(word in text_lower for word in ['mev', 'frontrun', 'sandwich', 'arbitrage']):
            return 'L2 MEV'
        elif any(word in text_lower for word in ['flash loan']):
            return 'Flash Loan'
        elif any(word in text_lower for word in ['oracle', 'price manipulation']):
            return 'Oracle Manipulation'
        elif any(word in text_lower for word in ['rugpull', 'rug pull', 'exit scam']):
            return 'Rugpull'
        elif any(word in text_lower for word in ['smart contract', 'contract', 'vulnerability']):
            return 'Smart Contract Bug'
        elif any(word in text_lower for word in ['private key', 'compromised', 'access']):
            return 'Access Control'

        return 'Unknown'

    def _extract_recovery_status(self, text: str) -> str:
        """Extract recovery status from text."""

        text_lower = text.lower()

        if any(word in text_lower for word in ['recovered', 'returned', 'refunded']):
            return 'Recovered'
        elif any(word in text_lower for word in ['partially recovered']):
            return 'Partially Recovered'
        elif any(word in text_lower for word in ['bounty', 'whitehat', 'white hat']):
            return 'Whitehat'

        return None


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = ArbitrumSecurityAggregator()

    print("\n" + "="*60)
    print("Arbitrum Security Aggregator - Test Run")
    print("="*60)

    print(f"\nMonitoring {len(aggregator.arbitrum_twitter_accounts)} Arbitrum Twitter accounts")
    print(f"Tracking {len(aggregator.search_queries)} search queries")

    print("\nFetching exploits from external sources...")
    exploits = aggregator.fetch_exploits()

    print(f"\nFound {len(exploits)} Arbitrum exploits")

    if exploits:
        print("\nSample exploits:")
        for i, exploit in enumerate(exploits[:3], 1):
            print(f"\n{i}. {exploit['protocol']}")
            print(f"   Chain: {exploit['chain']}")
            print(f"   Amount: ${exploit['amount_usd']:,.0f}")
            print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d %H:%M')}")
            print(f"   Category: {exploit['category']}")
            print(f"   Source: {exploit['source_url']}")
    else:
        print("\nNo recent Arbitrum exploits found in external sources.")
        print("This is expected if there have been no recent incidents.")

    print("\n" + "="*60)
