# -*- coding: utf-8 -*-
"""
Kamiyo API Watcher
Monitors Kamiyo platform for new exploits and triggers social media posting
"""

import os
import sys
import time
import logging
import requests
import asyncio
import websockets
import json
from typing import Dict, List, Optional, Callable
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.models import ExploitData, Platform
from social.poster import SocialMediaPoster

logger = logging.getLogger(__name__)


class KamiyoWatcher:
    """Watches Kamiyo API for new exploits and triggers social posting"""

    def __init__(
        self,
        api_base_url: str,
        social_poster: SocialMediaPoster,
        api_key: Optional[str] = None,
        websocket_url: Optional[str] = None,
        process_callback: Optional[Callable] = None
    ):
        """
        Initialize Kamiyo watcher

        Args:
            api_base_url: Base URL of Kamiyo API
            social_poster: Configured social media poster
            api_key: Optional API key for authenticated requests
            websocket_url: Optional WebSocket URL for real-time updates
            process_callback: Optional callback for processing exploits (for autonomous engine)
        """
        self.api_base_url = api_base_url.rstrip('/')
        self.social_poster = social_poster
        self.api_key = api_key
        self.websocket_url = websocket_url
        self.process_callback = process_callback

        self.headers = {}
        if api_key:
            self.headers['Authorization'] = f'Bearer {api_key}'

        # Track posted exploits to avoid duplicates
        self.posted_tx_hashes = set()

        # Track rate limit status
        self.rate_limited_until = None
        self.rate_limit_backoff = 15 * 60  # 15 minutes backoff on 429

        # On first run, check exploits from the viral max age window
        # This ensures we don't miss recent exploits that are still relevant
        viral_max_age_hours = int(os.getenv('VIRAL_MAX_AGE_HOURS', 720))  # Default 30 days
        self.last_check = datetime.utcnow() - timedelta(hours=viral_max_age_hours)

        # Limit backlog posting to avoid rate limits
        self.max_posts_per_cycle = int(os.getenv('MAX_POSTS_PER_CYCLE', 3))
        self.posts_this_cycle = 0

        # Filters
        self.min_amount_usd = float(os.getenv('SOCIAL_MIN_AMOUNT_USD', 100000))  # $100k minimum
        chains_str = os.getenv('SOCIAL_ENABLED_CHAINS', '')
        self.enabled_chains = chains_str.split(',') if chains_str else None

    def fetch_recent_exploits(self, since: Optional[datetime] = None) -> List[Dict]:
        """
        Fetch recent exploits from Kamiyo API

        Args:
            since: Only fetch exploits after this timestamp

        Returns:
            List of exploit dicts
        """
        try:
            params = {
                'page': 1,
                'page_size': 100,
                'min_amount': self.min_amount_usd
            }

            response = requests.get(
                f"{self.api_base_url}/exploits",
                headers=self.headers,
                params=params,
                timeout=30
            )

            response.raise_for_status()
            data = response.json()

            exploits = data.get('data', [])

            # Filter by timestamp if provided
            if since:
                exploits = [
                    e for e in exploits
                    if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) > since
                ]

            # Filter by chain if configured
            if self.enabled_chains:
                exploits = [
                    e for e in exploits
                    if e['chain'] in self.enabled_chains
                ]

            logger.info(f"Fetched {len(exploits)} recent exploits from Kamiyo API")
            return exploits

        except requests.RequestException as e:
            logger.error(f"Error fetching exploits from Kamiyo API: {e}")
            return []

    def convert_to_exploit_data(self, api_exploit: Dict) -> ExploitData:
        """
        Convert API response to ExploitData model

        Args:
            api_exploit: Exploit dict from API

        Returns:
            ExploitData instance
        """
        return ExploitData(
            tx_hash=api_exploit['tx_hash'],
            protocol=api_exploit['protocol'],
            chain=api_exploit['chain'],
            loss_amount_usd=api_exploit.get('amount_usd', 0),  # API returns 'amount_usd'
            exploit_type=api_exploit.get('category') or 'Unknown',  # API returns 'category'
            timestamp=datetime.fromisoformat(api_exploit['timestamp'].replace('Z', '+00:00')),
            description=api_exploit.get('description'),
            recovery_status=api_exploit.get('recovery_status'),
            source=api_exploit.get('source'),
            source_url=api_exploit.get('source_url')
        )

    def should_post(self, exploit: ExploitData) -> bool:
        """
        Determine if exploit should be posted

        Args:
            exploit: Exploit data

        Returns:
            bool: True if should post
        """
        # Skip if already posted
        if exploit.tx_hash in self.posted_tx_hashes:
            logger.debug(f"Skipping already posted exploit: {exploit.tx_hash[:16]}...")
            return False

        # Check minimum amount
        if exploit.loss_amount_usd < self.min_amount_usd:
            logger.debug(f"Skipping low-value exploit: {exploit.formatted_amount}")
            return False

        # Check chain filter
        if self.enabled_chains and exploit.chain not in self.enabled_chains:
            logger.debug(f"Skipping filtered chain: {exploit.chain}")
            return False

        return True

    def poll_and_post(
        self,
        interval: int = 60,
        review_callback: Optional[Callable] = None
    ):
        """
        Poll Kamiyo API at regular intervals and post new exploits

        Args:
            interval: Polling interval in seconds
            review_callback: Optional callback for post review
        """
        logger.info(f"Starting Kamiyo watcher (polling every {interval}s)")

        while True:
            try:
                # Check if we're rate limited
                if self.rate_limited_until and datetime.utcnow() < self.rate_limited_until:
                    wait_seconds = (self.rate_limited_until - datetime.utcnow()).total_seconds()
                    logger.warning(f"Rate limited. Waiting {wait_seconds:.0f}s before next attempt")
                    time.sleep(min(interval, wait_seconds))
                    continue

                # Reset posts counter for new cycle
                self.posts_this_cycle = 0

                # Fetch recent exploits
                exploits = self.fetch_recent_exploits(since=self.last_check)

                # Track the newest exploit timestamp we see
                newest_timestamp = self.last_check

                for api_exploit in exploits:
                    exploit = self.convert_to_exploit_data(api_exploit)

                    # Track newest timestamp
                    if exploit.timestamp > newest_timestamp:
                        newest_timestamp = exploit.timestamp

                    if not self.should_post(exploit):
                        continue

                    # Check if we've hit the post limit for this cycle
                    if self.posts_this_cycle >= self.max_posts_per_cycle:
                        logger.info(
                            f"Reached max posts per cycle ({self.max_posts_per_cycle}). "
                            f"Skipping {exploit.protocol} until next cycle"
                        )
                        continue

                    logger.info(
                        f"New exploit detected: {exploit.protocol} "
                        f"({exploit.formatted_amount}) on {exploit.chain}"
                    )

                    # Process exploit through autonomous engine or basic poster
                    if self.process_callback:
                        # Use autonomous growth engine for enhanced content
                        result = self.process_callback(
                            exploit,
                            platforms=list(self.social_poster.platforms.keys()),
                            review_callback=review_callback,
                            auto_post=review_callback is None
                        )
                    else:
                        # Fall back to basic social posting workflow
                        result = self.social_poster.process_exploit(
                            exploit,
                            platforms=list(self.social_poster.platforms.keys()),
                            review_callback=review_callback,
                            auto_post=review_callback is None  # Auto-post if no review callback
                        )

                    # Check for rate limit errors
                    if result.get('posting_results'):
                        for platform_result in result['posting_results'].get('results', {}).values():
                            error = platform_result.get('error', '')
                            if '429' in str(error) or 'Too Many Requests' in str(error):
                                self.rate_limited_until = datetime.utcnow() + timedelta(seconds=self.rate_limit_backoff)
                                logger.warning(
                                    f"Rate limit hit. Pausing posting until {self.rate_limited_until.strftime('%H:%M:%S')} UTC"
                                )
                                break

                    if result['success'] or result.get('partial'):
                        # Mark as posted
                        self.posted_tx_hashes.add(exploit.tx_hash)
                        self.posts_this_cycle += 1
                        logger.info(
                            f"Successfully posted exploit {self.posts_this_cycle}/{self.max_posts_per_cycle}: {exploit.protocol} "
                            f"to {sum(1 for r in result['posting_results']['results'].values() if r.get('success'))} platforms"
                        )
                        # Add delay between exploit posts to respect rate limits
                        time.sleep(5)
                    else:
                        logger.error(
                            f"Failed to post exploit: {exploit.protocol} - "
                            f"{result.get('reason', 'Unknown error')}"
                        )

                # Update last_check to the newest exploit timestamp we saw
                # This prevents reprocessing exploits and missing new ones
                self.last_check = newest_timestamp
                logger.debug(f"Updated last_check to {newest_timestamp}")

                # Wait before next poll
                time.sleep(interval)

            except KeyboardInterrupt:
                logger.info("Kamiyo watcher stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                time.sleep(interval)

    async def watch_websocket(
        self,
        review_callback: Optional[Callable] = None
    ):
        """
        Watch Kamiyo WebSocket for real-time exploit updates

        Args:
            review_callback: Optional callback for post review
        """
        if not self.websocket_url:
            logger.error("No WebSocket URL configured")
            return

        logger.info(f"Connecting to Kamiyo WebSocket: {self.websocket_url}")

        while True:
            try:
                async with websockets.connect(self.websocket_url) as websocket:
                    logger.info("Connected to Kamiyo WebSocket")

                    async for message in websocket:
                        try:
                            data = json.loads(message)

                            if data.get('type') == 'new_exploit':
                                api_exploit = data.get('exploit')
                                exploit = self.convert_to_exploit_data(api_exploit)

                                if not self.should_post(exploit):
                                    continue

                                logger.info(
                                    f"Real-time exploit detected: {exploit.protocol} "
                                    f"({exploit.formatted_amount}) on {exploit.chain}"
                                )

                                # Process through autonomous engine or basic poster
                                if self.process_callback:
                                    # Use autonomous growth engine for enhanced content
                                    result = self.process_callback(
                                        exploit,
                                        platforms=list(self.social_poster.platforms.keys()),
                                        review_callback=review_callback,
                                        auto_post=review_callback is None
                                    )
                                else:
                                    # Fall back to basic social posting workflow
                                    result = self.social_poster.process_exploit(
                                        exploit,
                                        platforms=list(self.social_poster.platforms.keys()),
                                        review_callback=review_callback,
                                        auto_post=review_callback is None
                                    )

                                if result['success'] or result.get('partial'):
                                    self.posted_tx_hashes.add(exploit.tx_hash)
                                    logger.info(f"Successfully posted real-time exploit: {exploit.protocol}")

                        except json.JSONDecodeError:
                            logger.error(f"Invalid JSON from WebSocket: {message}")
                        except Exception as e:
                            logger.error(f"Error processing WebSocket message: {e}")

            except websockets.exceptions.WebSocketException as e:
                logger.error(f"WebSocket error: {e}")
                logger.info("Reconnecting in 10 seconds...")
                await asyncio.sleep(10)
            except Exception as e:
                logger.error(f"Unexpected error in WebSocket loop: {e}")
                await asyncio.sleep(10)


# CLI for running the watcher
if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Social media config
    social_config = {
        'reddit': {
            'enabled': os.getenv('REDDIT_ENABLED', 'false').lower() == 'true',
            'client_id': os.getenv('REDDIT_CLIENT_ID'),
            'client_secret': os.getenv('REDDIT_CLIENT_SECRET'),
            'username': os.getenv('REDDIT_USERNAME'),
            'password': os.getenv('REDDIT_PASSWORD'),
            'subreddits': os.getenv('REDDIT_SUBREDDITS', 'defi,CryptoCurrency').split(',')
        },
        'discord': {
            'enabled': os.getenv('DISCORD_ENABLED', 'false').lower() == 'true',
            'webhooks': {
                name: url
                for name, url in (
                    item.split('=')
                    for item in os.getenv('DISCORD_SOCIAL_WEBHOOKS', '').split(',')
                    if '=' in item
                )
            }
        },
        'telegram': {
            'enabled': os.getenv('TELEGRAM_SOCIAL_ENABLED', 'false').lower() == 'true',
            'bot_token': os.getenv('TELEGRAM_SOCIAL_BOT_TOKEN'),
            'chat_ids': {
                name: chat_id
                for name, chat_id in (
                    item.split('=')
                    for item in os.getenv('TELEGRAM_SOCIAL_CHATS', '').split(',')
                    if '=' in item
                )
            }
        },
        'x_twitter': {
            'enabled': os.getenv('X_TWITTER_ENABLED', 'false').lower() == 'true',
            'api_key': os.getenv('X_API_KEY'),
            'api_secret': os.getenv('X_API_SECRET'),
            'access_token': os.getenv('X_ACCESS_TOKEN'),
            'access_secret': os.getenv('X_ACCESS_SECRET'),
            'bearer_token': os.getenv('X_BEARER_TOKEN')
        }
    }

    # Initialize social poster
    poster = SocialMediaPoster(social_config)

    # Initialize watcher
    watcher = KamiyoWatcher(
        api_base_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
        social_poster=poster,
        api_key=os.getenv('KAMIYO_API_KEY'),
        websocket_url=os.getenv('KAMIYO_WEBSOCKET_URL', 'wss://api.kamiyo.ai/ws')
    )

    # Choose mode
    mode = os.getenv('WATCHER_MODE', 'poll')  # 'poll' or 'websocket'

    if mode == 'websocket':
        logger.info("Starting in WebSocket mode")
        asyncio.run(watcher.watch_websocket())
    else:
        logger.info("Starting in polling mode")
        poll_interval = int(os.getenv('POLL_INTERVAL_SECONDS', 60))
        watcher.poll_and_post(interval=poll_interval)
