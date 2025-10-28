#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Webhook Client for AI-Generated Social Posts
Posts AI-generated quote tweets to Discord channels
"""

import os
import logging
import requests
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class DiscordClient:
    """Discord webhook poster for AI-generated social content"""

    MAX_CONTENT_LENGTH = 2000

    def __init__(self):
        """Initialize Discord webhook client"""
        # Get webhook URL from environment
        self.webhook_url = os.getenv('DISCORD_SOCIAL_WEBHOOK')

        if not self.webhook_url:
            logger.warning("DISCORD_SOCIAL_WEBHOOK not configured")

    def is_configured(self) -> bool:
        """Check if Discord webhook is configured"""
        return self.webhook_url is not None

    def post_quote_tweet(
        self,
        content: str,
        original_tweet: Dict,
        twitter_url: Optional[str] = None
    ) -> Dict:
        """
        Post AI-generated quote tweet to Discord

        Args:
            content: AI-generated quote tweet content
            original_tweet: Original tweet being quoted
            twitter_url: URL of the posted Twitter quote tweet (optional)

        Returns:
            dict: Result with success status
        """
        if not self.is_configured():
            return {
                'success': False,
                'error': 'Discord webhook not configured'
            }

        try:
            # Extract original tweet info
            author = original_tweet.get('author', {})
            author_name = author.get('name', 'Unknown')
            author_username = author.get('username', 'unknown')
            original_text = original_tweet.get('text', '')
            metrics = original_tweet.get('metrics', {})

            # Build embed
            embed = {
                'title': f"🤖 New AI Quote Tweet",
                'description': content,
                'color': 0x1DA1F2,  # Twitter blue
                'fields': [
                    {
                        'name': 'Quoting',
                        'value': f"@{author_username} ({author_name})",
                        'inline': True
                    },
                    {
                        'name': 'Engagement',
                        'value': f"{metrics.get('like_count', 0)} likes, {metrics.get('retweet_count', 0)} RTs",
                        'inline': True
                    },
                    {
                        'name': 'Original Tweet',
                        'value': original_text[:100] + ('...' if len(original_text) > 100 else ''),
                        'inline': False
                    }
                ],
                'footer': {
                    'text': 'KAMIYO AI Social Posting'
                }
            }

            # Add Twitter URL if available
            if twitter_url:
                embed['url'] = twitter_url
                embed['fields'].append({
                    'name': 'View on Twitter',
                    'value': f'[Click here]({twitter_url})',
                    'inline': False
                })

            # Build payload
            payload = {
                'content': '✨ Posted new AI-generated quote tweet',
                'embeds': [embed],
                'username': 'KAMIYO Social Bot',
                'avatar_url': 'https://kamiyo.ai/logo.png'
            }

            # Send to Discord
            response = requests.post(
                self.webhook_url,
                json=payload,
                timeout=10
            )

            if response.status_code in [200, 204]:
                logger.info("Posted quote tweet to Discord")
                return {
                    'success': True,
                    'webhook_url': self.webhook_url[:50] + '...'
                }
            else:
                error_msg = f"Discord webhook error {response.status_code}: {response.text}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'error': error_msg
                }

        except requests.exceptions.RequestException as e:
            logger.error(f"Discord webhook request error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        except Exception as e:
            logger.error(f"Discord posting error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
