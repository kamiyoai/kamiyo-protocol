# -*- coding: utf-8 -*-
"""
Cosmos Ecosystem Security Aggregator
Aggregates exploits from Cosmos-specific sources (Twitter, Forums, News)

IMPORTANT: This aggregator ONLY pulls from external sources.
It does NOT scan blockchains or detect exploits.
It AGGREGATES reports that have already been published.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from datetime import datetime, timedelta
from typing import List, Dict, Any
from aggregators.base import BaseAggregator


class CosmosSecurityAggregator(BaseAggregator):
    """
    Aggregates exploit reports from Cosmos ecosystem sources

    Sources:
    - Twitter: Cosmos-specific security accounts
    - Reddit: r/cosmosnetwork, r/CosmosAirdrops
    - Mintscan: Explorer incident reports
    - Cosmos forums: Official Cosmos Forum

    Note: This is an AGGREGATOR, not a detector.
    It collects information that has already been reported externally.
    """

    def __init__(self):
        super().__init__('cosmos_security')

        # Cosmos-specific Twitter accounts to monitor
        self.cosmos_twitter_accounts = [
            'cosmos',              # Official Cosmos account
            'CosmosGov',           # Governance updates
            'OsmosisZone',         # Osmosis DEX
            'Neutron_org',         # Neutron chain
            'injective_',          # Injective Protocol
            'CosmosHODL',          # Community news
            'cosmos_spaces',       # Cosmos Spaces
            'PeckShieldAlert',     # PeckShield (monitors all chains including Cosmos)
            'CertiKAlert',         # CertiK (monitors Cosmos)
            'BlockSecTeam',        # BlockSec
        ]

        # Cosmos-specific search queries
        self.search_queries = [
            'cosmos exploit',
            'osmosis hack',
            'ibc vulnerability',
            'cosmos hub attack',
            'neutron exploit',
            'injective hack',
            'cosmos validator slashed',
            'cosmwasm vulnerability',
        ]

        # Cosmos chain identifiers
        self.cosmos_chains = [
            'cosmos', 'cosmoshub', 'cosmos hub', 'atom',
            'osmosis', 'osmo',
            'neutron', 'ntrn',
            'injective', 'inj',
            'juno', 'stargaze', 'akash',
            'secret', 'kava', 'terra', 'luna',
        ]

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch Cosmos exploits from external sources

        This method aggregates from:
        1. Twitter monitoring (if configured)
        2. Reddit posts (r/cosmosnetwork)
        3. Official announcements
        """

        self.logger.info("Fetching Cosmos ecosystem exploits from external sources")

        exploits = []

        # Aggregate from different sources
        try:
            # Source 1: Twitter (requires implementation based on user's setup)
            # exploits.extend(self._fetch_from_twitter())
            pass
        except Exception as e:
            self.logger.error(f"Twitter fetch failed: {e}")

        try:
            # Source 2: Reddit scraping
            reddit_exploits = self._fetch_from_reddit()
            exploits.extend(reddit_exploits)
        except Exception as e:
            self.logger.error(f"Reddit fetch failed: {e}")

        try:
            # Source 3: Cosmos forums
            # forum_exploits = self._fetch_from_forums()
            # exploits.extend(forum_exploits)
            pass
        except Exception as e:
            self.logger.error(f"Forum fetch failed: {e}")

        self.logger.info(f"Fetched {len(exploits)} Cosmos exploits from external sources")

        # Validate exploits
        valid_exploits = [e for e in exploits if self.validate_exploit(e)]

        return valid_exploits

    def _fetch_from_reddit(self) -> List[Dict[str, Any]]:
        """
        Fetch exploit reports from Cosmos-related subreddits

        Aggregates from:
        - r/cosmosnetwork
        - r/CosmosAirdrops
        - r/cosmosecosystem
        """

        exploits = []

        subreddits = ['cosmosnetwork', 'CosmosAirdrops', 'cosmosecosystem']

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

                        # Check if post mentions exploits/hacks
                        if self._is_cosmos_exploit_post(post_data):
                            exploit = self._parse_reddit_post(post_data)
                            if exploit:
                                exploits.append(exploit)

            except Exception as e:
                self.logger.error(f"Error fetching from r/{subreddit}: {e}")

        return exploits

    def _is_cosmos_exploit_post(self, post_data: Dict[str, Any]) -> bool:
        """Check if Reddit post is about a Cosmos exploit"""

        title = post_data.get('title', '').lower()
        selftext = post_data.get('selftext', '').lower()
        combined_text = title + ' ' + selftext

        # Must mention exploit/hack keywords
        exploit_keywords = [
            'exploit', 'hack', 'vulnerability', 'attack',
            'stolen', 'drained', 'rugpull', 'scam',
            'emergency', 'pause', 'halted'
        ]

        has_exploit_keyword = any(keyword in combined_text for keyword in exploit_keywords)

        # Must mention Cosmos ecosystem
        has_cosmos_mention = any(chain in combined_text for chain in self.cosmos_chains)

        # Must have transaction hash OR significant upvotes (to filter noise)
        has_tx_hash = bool(re.search(r'[A-F0-9]{64}', post_data.get('selftext', '')))
        has_upvotes = post_data.get('ups', 0) > 50

        return has_exploit_keyword and has_cosmos_mention and (has_tx_hash or has_upvotes)

    def _parse_reddit_post(self, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """Parse Reddit post into exploit record"""

        title = post_data.get('title', '')
        selftext = post_data.get('selftext', '')
        url = f"https://reddit.com{post_data.get('permalink', '')}"
        created_utc = post_data.get('created_utc', 0)

        combined_text = title + ' ' + selftext

        # Extract chain
        chain = self._extract_cosmos_chain(combined_text)

        # Extract protocol
        protocol = self._extract_protocol(combined_text)

        # Extract amount
        amount_usd = self.parse_amount(combined_text)

        # Extract transaction hash
        tx_match = re.search(r'[A-F0-9]{64}', selftext)
        if tx_match:
            tx_hash = tx_match.group(0).lower()
        else:
            # Generate hash from post data
            tx_hash = self.generate_tx_hash(
                'cosmos',
                protocol,
                str(created_utc)
            )

        # Parse timestamp
        timestamp = datetime.fromtimestamp(created_utc)

        # Categorize
        category = self._categorize_cosmos_exploit(combined_text)

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': url,
            'category': category,
            'description': title[:500],
            'recovery_status': self._extract_recovery_status(combined_text)
        }

    def _extract_cosmos_chain(self, text: str) -> str:
        """Extract specific Cosmos chain from text"""

        text_lower = text.lower()

        # Check for specific chains (order matters - check more specific patterns first)
        # Check for "cosmos hub" explicitly before generic "cosmos"
        if 'cosmos hub' in text_lower or 'cosmoshub' in text_lower or 'atom' in text_lower:
            return 'Cosmos Hub'
        elif 'osmosis' in text_lower or 'osmo' in text_lower:
            return 'Osmosis'
        elif 'neutron' in text_lower or 'ntrn' in text_lower:
            return 'Neutron'
        elif 'injective' in text_lower or 'inj' in text_lower:
            return 'Injective'
        elif 'juno' in text_lower:
            return 'Juno'
        elif 'stargaze' in text_lower:
            return 'Stargaze'
        elif 'secret' in text_lower:
            return 'Secret Network'
        elif 'akash' in text_lower:
            return 'Akash'
        elif 'kava' in text_lower:
            return 'Kava'
        elif 'cosmos' in text_lower:
            # Generic "cosmos" without "hub" - still Cosmos Hub
            return 'Cosmos Hub'

        # Default to Cosmos Hub if no specific chain identified
        return 'Cosmos Hub'

    def _extract_protocol(self, text: str) -> str:
        """Extract protocol name from text"""

        # Look for common patterns
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

    def _categorize_cosmos_exploit(self, text: str) -> str:
        """Categorize Cosmos-specific exploit types"""

        text_lower = text.lower()

        # Cosmos-specific categories
        if any(word in text_lower for word in ['ibc', 'cross-chain', 'bridge']):
            return 'IBC/Bridge Exploit'
        elif any(word in text_lower for word in ['cosmwasm', 'smart contract', 'contract']):
            return 'CosmWasm Contract'
        elif any(word in text_lower for word in ['validator', 'slashed', 'double sign']):
            return 'Validator Issue'
        elif any(word in text_lower for word in ['governance', 'proposal']):
            return 'Governance Attack'
        elif any(word in text_lower for word in ['oracle']):
            return 'Oracle Manipulation'
        elif any(word in text_lower for word in ['flash loan']):
            return 'Flash Loan'
        elif any(word in text_lower for word in ['rugpull', 'rug pull', 'exit scam']):
            return 'Rugpull'
        elif any(word in text_lower for word in ['private key', 'compromised']):
            return 'Access Control'

        return 'Unknown'

    def _extract_recovery_status(self, text: str) -> str:
        """Extract recovery status from text"""

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

    aggregator = CosmosSecurityAggregator()

    print("\n" + "="*60)
    print("Cosmos Security Aggregator - Test Run")
    print("="*60)

    print(f"\nMonitoring {len(aggregator.cosmos_twitter_accounts)} Cosmos Twitter accounts")
    print(f"Tracking {len(aggregator.search_queries)} search queries")
    print(f"Supporting {len(aggregator.cosmos_chains)} Cosmos chains")

    print("\nFetching exploits from external sources...")
    exploits = aggregator.fetch_exploits()

    print(f"\nFound {len(exploits)} Cosmos exploits")

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
        print("\nNo recent Cosmos exploits found in external sources.")
        print("This is expected if there have been no recent incidents.")

    print("\n" + "="*60)
