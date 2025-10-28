#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Twitter Client for AI Agent Posting
Simplified client for quote tweeting with AI-generated content
"""

import logging
import os
from typing import Dict, List, Optional
import tweepy
from tweepy.errors import TweepyException

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TwitterClient:
    """Simplified Twitter client for quote tweeting"""

    MAX_TWEET_LENGTH = 280

    def __init__(self):
        """Initialize Twitter client with environment credentials"""
        # Support both X_* and TWITTER_* variable names
        self.api_key = os.getenv('X_API_KEY') or os.getenv('TWITTER_API_KEY')
        self.api_secret = os.getenv('X_API_SECRET') or os.getenv('TWITTER_API_SECRET')
        self.access_token = os.getenv('X_ACCESS_TOKEN') or os.getenv('TWITTER_ACCESS_TOKEN')
        self.access_secret = os.getenv('X_ACCESS_SECRET') or os.getenv('TWITTER_ACCESS_SECRET')
        self.bearer_token = os.getenv('X_BEARER_TOKEN') or os.getenv('TWITTER_BEARER_TOKEN')

        if not all([self.api_key, self.api_secret, self.access_token, self.access_secret]):
            raise ValueError("Missing Twitter credentials in environment variables")

        self.client = None
        self._authenticated = False

    def authenticate(self) -> bool:
        """Authenticate with Twitter API v2"""
        try:
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_secret,
                wait_on_rate_limit=True
            )

            # Test authentication
            self.client.get_me()
            self._authenticated = True
            logger.info("Authenticated to Twitter")
            return True

        except TweepyException as e:
            logger.error(f"Twitter authentication failed: {e}")
            self._authenticated = False
            return False

    def search_recent_tweets(
        self,
        query: str,
        max_results: int = 10
    ) -> List[Dict]:
        """
        Search for recent tweets

        Args:
            query: Twitter search query
            max_results: Maximum number of results (10-100)

        Returns:
            List of tweet dicts with id, text, author info
        """
        if not self._authenticated:
            if not self.authenticate():
                return []

        try:
            response = self.client.search_recent_tweets(
                query=query,
                max_results=max_results,
                tweet_fields=['created_at', 'public_metrics', 'author_id'],
                expansions=['author_id'],
                user_fields=['username', 'name']
            )

            if not response.data:
                logger.info(f"No tweets found for query: {query}")
                return []

            # Build user map for quick lookup
            users = {}
            if response.includes and 'users' in response.includes:
                users = {user.id: user for user in response.includes['users']}

            tweets = []
            for tweet in response.data:
                author = users.get(tweet.author_id)
                tweets.append({
                    'id': tweet.id,
                    'text': tweet.text,
                    'created_at': tweet.created_at,
                    'author': {
                        'id': tweet.author_id,
                        'username': author.username if author else 'unknown',
                        'name': author.name if author else 'Unknown'
                    },
                    'metrics': tweet.public_metrics
                })

            logger.info(f"Found {len(tweets)} tweets for query: {query}")
            return tweets

        except TweepyException as e:
            logger.error(f"Twitter search error: {e}")
            return []

    def quote_tweet(self, tweet_id: str, content: str) -> Dict:
        """
        Quote tweet with custom content

        Args:
            tweet_id: ID of tweet to quote
            content: Quote tweet content (max 280 chars)

        Returns:
            dict with success status, tweet_id, and url
        """
        if not self._authenticated:
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        # Truncate if needed
        if len(content) > self.MAX_TWEET_LENGTH:
            content = content[:self.MAX_TWEET_LENGTH - 3] + '...'
            logger.warning(f"Content truncated to {self.MAX_TWEET_LENGTH} chars")

        try:
            response = self.client.create_tweet(
                text=content,
                quote_tweet_id=tweet_id
            )

            posted_tweet_id = response.data['id']
            url = f"https://twitter.com/i/web/status/{posted_tweet_id}"

            logger.info(f"Posted quote tweet: {posted_tweet_id}")

            return {
                'success': True,
                'tweet_id': posted_tweet_id,
                'url': url
            }

        except TweepyException as e:
            error_msg = f"Quote tweet error: {e}"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }

    def get_user_id(self, username: str) -> Optional[str]:
        """Get user ID from username"""
        if not self._authenticated:
            if not self.authenticate():
                return None

        try:
            user = self.client.get_user(username=username)
            if user.data:
                return user.data.id
            return None
        except TweepyException as e:
            logger.error(f"Error getting user ID for @{username}: {e}")
            return None
