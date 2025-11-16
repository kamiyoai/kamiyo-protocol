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
import hashlib
from datetime import datetime
from typing import List, Dict, Any
from aggregators.base import BaseAggregator

from bs4 import BeautifulSoup


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
            'runtime_xyz',       # Formal verification
            # Phase 1: Tier 1 security researchers
            'bantg',             # Yearn, catches exploits early
            'officer_cia',       # OSINT master
            'spreekaway',        # MEV researcher
            'bertcmiller',       # Flashbots MEV
            'Mudit__Gupta',      # CISO at Polygon
            'real_philogy',      # Smart contract security
            'pashovkrum',        # Independent auditor
            'bytes032'           # Security researcher
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

        # Phase 1: Enhanced alert patterns for early detection
        self.alert_patterns = [
            r'emergency.*pause',
            r'whitehack.*rescue',
            r'post.*mortem',
            r'\$\d+(?:\.\d+)?[MmBb].*(?:lost|stolen|drained|exploited)',
            r'vulnerability.*disclosed',
            r'critical.*bug.*found',
        ]

        # Phase 1: Protocol mention tracking for spike detection
        self.protocol_mentions = {}  # {protocol_name: [(timestamp, tweet_text), ...]}

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch exploits from Twitter using Nitter instances
        """

        self.logger.info("Twitter aggregator initialized")
        self.logger.info(f"Monitoring {len(self.accounts_to_monitor)} accounts")

        exploits = []

        # Fetch from Nitter (free Twitter frontend)
        exploits.extend(self._fetch_from_nitter())

        self.logger.info(f"Found {len(exploits)} exploit-related tweets")
        return exploits

    def _parse_tweet(self, tweet_text: str, author: str, tweet_url: str = None) -> Dict[str, Any]:
        """Parse tweet for exploit information"""

        # Extract protocol name
        protocol = self._extract_protocol_from_text(tweet_text)

        # Phase 1: Track protocol mention for spike detection
        self._track_protocol_mention(protocol, tweet_text)

        # Phase 1: Check for spike
        spike_detected = self._detect_spike(protocol)

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

        # Phase 1: Add spike indicator to description if detected
        description = tweet_text[:500]
        if spike_detected:
            description = f"[SPIKE DETECTED] {description}"

        return {
            'tx_hash': tx_hash,
            'chain': chain or 'Unknown',
            'protocol': protocol,
            'amount_usd': amount,
            'timestamp': datetime.now(),
            'source': self.name,
            'source_url': tweet_url,
            'category': category,
            'description': description,
            'recovery_status': None
        }

    def _extract_protocol_from_text(self, text: str) -> str:
        """Extract protocol name from tweet text"""

        # Look for common patterns
        patterns = [
            r'(?:stolen|drained|lost|exploited)\s+from\s+(\w+)',
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

    def _fetch_from_nitter(self) -> List[Dict[str, Any]]:
        """
        Fetch from Nitter instances (free Twitter frontend)
        Tries multiple instances for reliability
        """
        exploits = []

        # List of Nitter instances to try (expanded list for reliability)
        nitter_instances = [
            "https://nitter.net",
            "https://nitter.poast.org",
            "https://nitter.privacydev.net",
            "https://nitter.unixfox.eu",
            "https://nitter.42l.fr",
            "https://nitter.fdn.fr",
            "https://nitter.1d4.us",
            "https://nitter.kavin.rocks"
        ]

        # Track which accounts we've already processed to avoid duplicates
        processed_tweets = set()

        for account in self.accounts_to_monitor:
            self.logger.info(f"Fetching tweets from @{account}")

            # Try each Nitter instance until one works
            account_exploits = []
            for instance in nitter_instances:
                try:
                    url = f"{instance}/{account}"
                    response = self.make_request(url, timeout=10)

                    if not response:
                        self.logger.warning(f"Failed to fetch from {instance}, trying next...")
                        continue

                    # Parse HTML with BeautifulSoup
                    soup = BeautifulSoup(response.text, 'html.parser')

                    # Find all tweet items
                    timeline_items = soup.find_all('div', class_='timeline-item')

                    if not timeline_items:
                        self.logger.warning(f"No tweets found at {instance}/{account}")
                        continue

                    self.logger.info(f"Found {len(timeline_items)} tweets from @{account} on {instance}")

                    # Process each tweet
                    for item in timeline_items[:20]:  # Limit to last 20 tweets
                        try:
                            # Extract tweet content
                            tweet_content = item.find('div', class_='tweet-content')
                            if not tweet_content:
                                continue

                            text = tweet_content.get_text(strip=True)

                            # Generate unique ID for deduplication
                            tweet_id = hashlib.sha256(f"{account}:{text[:100]}".encode()).hexdigest()
                            if tweet_id in processed_tweets:
                                continue

                            # Check if tweet is exploit-related
                            if not self._is_exploit_related(text):
                                continue

                            # Extract tweet URL
                            tweet_link = item.find('a', class_='tweet-link')
                            tweet_url = None
                            if tweet_link and 'href' in tweet_link.attrs:
                                tweet_path = tweet_link['href']
                                tweet_url = f"https://twitter.com{tweet_path}"

                            # Parse tweet into exploit format
                            exploit = self._parse_tweet(text, account, tweet_url)

                            # Validate before adding
                            if self.validate_exploit(exploit):
                                account_exploits.append(exploit)
                                processed_tweets.add(tweet_id)
                                self.logger.info(f"Parsed exploit from @{account}: {exploit['protocol']}")

                        except Exception as e:
                            self.logger.error(f"Error parsing tweet from @{account}: {e}")
                            continue

                    # If we successfully got tweets, break and don't try other instances
                    if account_exploits:
                        exploits.extend(account_exploits)
                        break

                except Exception as e:
                    self.logger.error(f"Error fetching from {instance}: {e}")
                    continue

            # Rate limiting - be nice to Nitter instances
            time.sleep(2)

        return exploits

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

        # Check basic keywords
        if any(keyword in text_lower for keyword in keywords):
            return True

        # Phase 1: Check enhanced alert patterns
        for pattern in self.alert_patterns:
            if re.search(pattern, text_lower):
                return True

        return False

    def _detect_spike(self, protocol_name: str, window_minutes: int = 60) -> bool:
        """
        Phase 1: Detect sentiment spike for a protocol
        Returns True if mentions spiked >300% in last hour vs baseline
        """
        if protocol_name not in self.protocol_mentions:
            return False

        mentions = self.protocol_mentions[protocol_name]
        if len(mentions) < 10:  # Need baseline
            return False

        now = datetime.now()

        # Count mentions in last hour
        recent_count = sum(
            1 for timestamp, _ in mentions
            if (now - timestamp).total_seconds() < (window_minutes * 60)
        )

        # Count baseline (previous 24 hours, excluding last hour)
        baseline_count = sum(
            1 for timestamp, _ in mentions
            if (window_minutes * 60) < (now - timestamp).total_seconds() < (24 * 3600)
        )

        if baseline_count == 0:
            return False

        # Calculate hourly baseline average
        baseline_hourly = baseline_count / 23.0  # 23 hours of baseline

        # Check if spike >300%
        if recent_count > (baseline_hourly * 4.0):  # 400% = spike of 300%
            self.logger.warning(
                f"Spike detected for {protocol_name}: {recent_count} mentions "
                f"vs baseline {baseline_hourly:.1f}/hour"
            )
            return True

        return False

    def _track_protocol_mention(self, protocol_name: str, tweet_text: str):
        """Track protocol mention for spike detection"""
        if protocol_name == 'Unknown':
            return

        if protocol_name not in self.protocol_mentions:
            self.protocol_mentions[protocol_name] = []

        # Add new mention
        self.protocol_mentions[protocol_name].append((datetime.now(), tweet_text))

        # Cleanup old mentions (>7 days)
        cutoff = datetime.now()
        self.protocol_mentions[protocol_name] = [
            (ts, text) for ts, text in self.protocol_mentions[protocol_name]
            if (cutoff - ts).total_seconds() < (7 * 24 * 3600)
        ]


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

    print("\nNitter scraping is now enabled!")
    print("The aggregator will fetch from multiple Nitter instances for reliability.")

    # Test parsing
    sample_tweet = "$5.2M stolen from ExampleDEX on Ethereum via flash loan attack. Tx: 0x1234..."
    print(f"\nTest parsing: '{sample_tweet}'")
    parsed = aggregator._parse_tweet(sample_tweet, "test_user")
    print(f"  Protocol: {parsed['protocol']}")
    print(f"  Amount: ${parsed['amount_usd']:,.0f}")
    print(f"  Chain: {parsed['chain']}")
    print(f"  Category: {parsed['category']}")

    # Optional: Run a live test (commented out to avoid hitting Nitter unnecessarily)
    print("\nTo run a live test, uncomment the following lines:")
    print("  exploits = aggregator.fetch_exploits()")
    print("  print(f'\\nFound {len(exploits)} exploit-related tweets')")
    # exploits = aggregator.fetch_exploits()
    # print(f'\nFound {len(exploits)} exploit-related tweets')
    # for exploit in exploits[:3]:
    #     print(f"\n  - {exploit['protocol']} on {exploit['chain']}")
    #     print(f"    Amount: ${exploit['amount_usd']:,.0f}")
    #     print(f"    Category: {exploit['category']}")
