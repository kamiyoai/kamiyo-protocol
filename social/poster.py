# -*- coding: utf-8 -*-
"""
Social Media Poster - Main Orchestrator
Generates posts from exploits, manages review workflow, posts to multiple platforms
"""

import os
import sys
import logging
from typing import Dict, List, Optional
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.models import ExploitData, SocialPost, Platform, PostStatus
from social.post_generator import PostGenerator
from social.platforms import (
    RedditPoster,
    DiscordPoster,
    TelegramPoster,
    XTwitterPoster
)

logger = logging.getLogger(__name__)


class SocialMediaPoster:
    """Main orchestrator for social media posting"""

    def __init__(self, config: Dict):
        """
        Initialize social media poster

        Args:
            config: Configuration dict with platform settings
        """
        self.config = config
        self.generator = PostGenerator()

        # Initialize platform posters
        self.platforms = {}

        if config.get('reddit', {}).get('enabled'):
            self.platforms[Platform.REDDIT] = RedditPoster(config['reddit'])

        if config.get('discord', {}).get('enabled'):
            self.platforms[Platform.DISCORD] = DiscordPoster(config['discord'])

        if config.get('telegram', {}).get('enabled'):
            self.platforms[Platform.TELEGRAM] = TelegramPoster(config['telegram'])

        if config.get('x_twitter', {}).get('enabled'):
            self.platforms[Platform.X_TWITTER] = XTwitterPoster(config['x_twitter'])

        logger.info(f"Initialized {len(self.platforms)} platform posters")

    def create_post_from_exploit(
        self,
        exploit: ExploitData,
        platforms: Optional[List[Platform]] = None
    ) -> SocialPost:
        """
        Create social media post from exploit data

        Args:
            exploit: Exploit data from Kamiyo platform
            platforms: List of platforms to post to (None = all enabled)

        Returns:
            SocialPost ready for review
        """
        if platforms is None:
            platforms = list(self.platforms.keys())

        # Generate post with platform-specific content
        post = self.generator.generate_post(exploit, platforms)

        logger.info(
            f"Created post for {exploit.protocol} exploit "
            f"({exploit.formatted_amount}) targeting {len(platforms)} platforms"
        )

        return post

    def review_post(self, post: SocialPost, review_callback=None) -> bool:
        """
        Submit post for human review

        Args:
            post: Generated post
            review_callback: Optional callback function for review

        Returns:
            bool: True if approved, False if rejected
        """
        if review_callback:
            approved = review_callback(post)
        else:
            # Default: auto-approve (for testing)
            approved = True
            logger.warning("No review callback provided, auto-approving post")

        post.mark_reviewed(approved)

        if approved:
            logger.info(f"Post approved for {post.exploit_data.protocol}")
        else:
            logger.info(f"Post rejected for {post.exploit_data.protocol}")

        return approved

    def post_to_platforms(self, post: SocialPost) -> Dict:
        """
        Post approved content to all configured platforms

        Args:
            post: Approved social post

        Returns:
            dict: Results from all platforms
        """
        if not post.is_approved:
            return {
                'success': False,
                'error': 'Post not approved'
            }

        results = {}
        all_success = True

        for platform in post.platforms:
            poster = self.platforms.get(platform)
            if not poster:
                logger.warning(f"No poster configured for {platform.value}")
                results[platform.value] = {
                    'success': False,
                    'error': 'Platform not configured'
                }
                all_success = False
                continue

            content = post.content.get(platform)
            if not content:
                logger.warning(f"No content generated for {platform.value}")
                results[platform.value] = {
                    'success': False,
                    'error': 'No content generated'
                }
                all_success = False
                continue

            # Platform-specific posting
            try:
                if platform == Platform.REDDIT:
                    title = f"🚨 {post.exploit_data.protocol} Exploit - {post.exploit_data.formatted_amount} Lost"
                    result = poster.post_with_retry(content, title=title)

                elif platform == Platform.DISCORD:
                    # Use rich embed for Discord
                    result = poster.post_exploit_alert({
                        'protocol': post.exploit_data.protocol,
                        'chain': post.exploit_data.chain,
                        'loss_amount_usd': post.exploit_data.loss_amount_usd,
                        'exploit_type': post.exploit_data.exploit_type,
                        'tx_hash': post.exploit_data.tx_hash,
                        'recovery_status': post.exploit_data.recovery_status,
                        'description': post.exploit_data.description,
                        'source_url': post.exploit_data.source_url,
                        'timestamp': post.exploit_data.timestamp.isoformat()
                    })

                elif platform == Platform.TELEGRAM:
                    result = poster.post_with_retry(
                        content,
                        parse_mode='HTML',
                        disable_web_page_preview=False
                    )

                elif platform == Platform.X_TWITTER:
                    # Check if content is already a thread (list) or needs threading
                    if isinstance(content, list):
                        # Content is already a thread from autonomous_growth_engine
                        result = poster.post_thread(content)
                    elif len(content) > 280:
                        # Content is a long string, split into tweets
                        tweets = poster.split_into_tweets(content)
                        result = poster.post_thread(tweets)
                    else:
                        # Content is a short string, post as single tweet
                        result = poster.post_with_retry(content)

                else:
                    result = poster.post_with_retry(content)

                results[platform.value] = result
                post.posting_results[platform] = result

                if not result.get('success'):
                    all_success = False

            except Exception as e:
                logger.error(f"Error posting to {platform.value}: {e}")
                results[platform.value] = {
                    'success': False,
                    'error': str(e)
                }
                all_success = False

        # Update post status
        if all_success:
            post.mark_posted()
        else:
            if any(r.get('success') for r in results.values()):
                post.status = PostStatus.POSTED  # Partial success
            else:
                post.mark_failed()

        return {
            'success': all_success,
            'partial': any(r.get('success') for r in results.values()) and not all_success,
            'results': results,
            'post_status': post.status.value
        }

    def process_exploit(
        self,
        exploit: ExploitData,
        platforms: Optional[List[Platform]] = None,
        review_callback=None,
        auto_post: bool = False
    ) -> Dict:
        """
        Full workflow: create post, review, and post to platforms

        Args:
            exploit: Exploit data
            platforms: Platforms to post to
            review_callback: Review callback function
            auto_post: Skip review and auto-post (use with caution)

        Returns:
            dict: Complete workflow result
        """
        # Step 1: Create post
        post = self.create_post_from_exploit(exploit, platforms)

        # Step 2: Review
        if auto_post:
            post.mark_reviewed(approved=True)
            approved = True
        else:
            approved = self.review_post(post, review_callback)

        if not approved:
            return {
                'success': False,
                'reason': 'Post rejected during review',
                'post': post
            }

        # Step 3: Post to platforms
        posting_result = self.post_to_platforms(post)

        return {
            'success': posting_result['success'],
            'partial': posting_result.get('partial', False),
            'post': post,
            'posting_results': posting_result
        }

    def get_platform_status(self) -> Dict:
        """
        Get status of all configured platforms

        Returns:
            dict: Status for each platform
        """
        status = {}
        for platform_enum, poster in self.platforms.items():
            status[platform_enum.value] = poster.get_status()
        return status


# CLI for testing
if __name__ == "__main__":
    import json

    # Example configuration
    config = {
        'reddit': {
            'enabled': False,  # Set to True when credentials configured
            'client_id': os.getenv('REDDIT_CLIENT_ID'),
            'client_secret': os.getenv('REDDIT_CLIENT_SECRET'),
            'username': os.getenv('REDDIT_USERNAME'),
            'password': os.getenv('REDDIT_PASSWORD'),
            'subreddits': ['test']  # Use test subreddit
        },
        'discord': {
            'enabled': True,  # Webhooks don't need auth
            'webhooks': {
                'test': os.getenv('DISCORD_TEST_WEBHOOK')
            }
        },
        'telegram': {
            'enabled': False,  # Set to True when credentials configured
            'bot_token': os.getenv('TELEGRAM_BOT_TOKEN'),
            'chat_ids': {
                'test': os.getenv('TELEGRAM_TEST_CHAT_ID')
            }
        },
        'x_twitter': {
            'enabled': False,  # Set to True when credentials configured
            'api_key': os.getenv('X_API_KEY'),
            'api_secret': os.getenv('X_API_SECRET'),
            'access_token': os.getenv('X_ACCESS_TOKEN'),
            'access_secret': os.getenv('X_ACCESS_SECRET'),
            'bearer_token': os.getenv('X_BEARER_TOKEN')
        }
    }

    # Create poster
    poster = SocialMediaPoster(config)

    # Example exploit
    exploit = ExploitData(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Uniswap V3",
        chain="Ethereum",
        loss_amount_usd=2_500_000.00,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow(),
        description="Flash loan attack exploited price oracle manipulation vulnerability in liquidity pool",
        recovery_status="Partial Recovery - 60% recovered by whitehat",
        source="Rekt News",
        source_url="https://rekt.news/example"
    )

    # Get platform status
    print("="*60)
    print("PLATFORM STATUS")
    print("="*60)
    status = poster.get_platform_status()
    print(json.dumps(status, indent=2))

    # Create and review post
    print("\n" + "="*60)
    print("CREATING POST")
    print("="*60)

    post = poster.create_post_from_exploit(
        exploit,
        platforms=[Platform.DISCORD]  # Only Discord for testing
    )

    print(f"\nPost created for: {exploit.protocol} - {exploit.formatted_amount}")
    print(f"Status: {post.status.value}")
    print(f"Platforms: {[p.value for p in post.platforms]}")

    # Show generated content
    for platform, content in post.content.items():
        print(f"\n{'-'*60}")
        print(f"{platform.value.upper()} CONTENT:")
        print(f"{'-'*60}")
        print(content)

    # Simple CLI review
    print("\n" + "="*60)
    print("REVIEW POST")
    print("="*60)
    approval = input("Approve this post? (y/n): ").lower().strip()
    approved = approval == 'y'

    poster.review_post(post, review_callback=lambda p: approved)

    if not approved:
        print("\nPost rejected. Exiting.")
        sys.exit(0)

    # Post to platforms
    print("\n" + "="*60)
    print("POSTING TO PLATFORMS")
    print("="*60)

    result = poster.post_to_platforms(post)

    print(f"\nOverall Success: {result['success']}")
    print(f"Partial Success: {result.get('partial', False)}")
    print(f"\nResults:")
    print(json.dumps(result['results'], indent=2))
