#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Agent Poster
Finds relevant AI/agent posts and creates insightful quote tweets using Claude
"""

import logging
import os
import random
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import anthropic

from social.twitter_client import TwitterClient
from social.discord_client import DiscordClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AIAgentPoster:
    """
    Discovers and quote-tweets interesting AI agent content
    """

    # Leading accounts in AI and AI agents space
    TARGET_ACCOUNTS = [
        'PhalaNetwork',      # Phala Network
        'HiveIntel',         # Hive Intelligence
        'xai',               # xAI
        'abacusai',          # Abacus.AI
        'elonmusk',          # Elon Musk
        'AnthropicAI',       # Anthropic
        'OpenAI',            # OpenAI
        'gdb',               # Gavin Baker (AI investor)
        'sama',              # Sam Altman
        'ylecun',            # Yann LeCun
        'goodside',          # Riley Goodside
        'emollick',          # Ethan Mollick
        'tszzl',             # Andrej Karpathy
        'karpathy',          # Andrej Karpathy
        'bindureddy',        # Bindu Reddy
        'aidan_mclau',       # Aidan McLau
    ]

    # Topics to search for
    SEARCH_TOPICS = [
        'AI agents',
        'autonomous agents',
        'LLM agents',
        'agent frameworks',
        'multi-agent systems',
        'AI automation',
        'agent orchestration',
        'intelligent agents',
    ]

    def __init__(self):
        """Initialize with Twitter, Discord, and Claude clients"""
        self.twitter = TwitterClient()
        self.twitter.authenticate()

        # Initialize Discord client (optional)
        self.discord = DiscordClient()
        if self.discord.is_configured():
            logger.info("Discord webhook configured - will post to Discord")
        else:
            logger.info("Discord webhook not configured - Twitter only")

        # Initialize Claude client
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("Missing ANTHROPIC_API_KEY in environment")

        self.claude = anthropic.Anthropic(api_key=api_key)

        logger.info("AIAgentPoster initialized")

    def find_relevant_tweets(self, hours_back: int = 24) -> List[Dict]:
        """
        Find recent tweets from target accounts about AI agents

        Args:
            hours_back: How many hours back to search

        Returns:
            List of relevant tweets
        """
        all_tweets = []

        # Search by account
        for username in self.TARGET_ACCOUNTS[:3]:  # Sample 3 accounts to stay within rate limits
            query = f"from:{username} -is:retweet -is:reply"
            tweets = self.twitter.search_recent_tweets(query, max_results=10)

            if tweets:
                all_tweets.extend(tweets)
                logger.info(f"Found {len(tweets)} tweets from @{username}")

        # Also search by topic from any influential account
        for topic in random.sample(self.SEARCH_TOPICS, 2):  # Random 2 topics
            query = f'"{topic}" min_faves:50 -is:retweet'
            tweets = self.twitter.search_recent_tweets(query, max_results=10)

            if tweets:
                all_tweets.extend(tweets)
                logger.info(f"Found {len(tweets)} tweets about '{topic}'")

        # Filter out duplicates and sort by engagement
        seen_ids = set()
        unique_tweets = []
        for tweet in all_tweets:
            if tweet['id'] not in seen_ids:
                seen_ids.add(tweet['id'])
                unique_tweets.append(tweet)

        # Sort by engagement (likes + retweets)
        unique_tweets.sort(
            key=lambda t: t['metrics']['like_count'] + t['metrics']['retweet_count'],
            reverse=True
        )

        logger.info(f"Found {len(unique_tweets)} unique relevant tweets")
        return unique_tweets[:10]  # Return top 10

    def generate_quote_tweet(self, original_tweet: Dict) -> Optional[str]:
        """
        Use Claude to generate an insightful quote tweet

        Args:
            original_tweet: Tweet dict with text, author, etc.

        Returns:
            Generated quote tweet content or None if generation fails
        """
        author = original_tweet['author']['name']
        username = original_tweet['author']['username']
        text = original_tweet['text']

        # Direct prompt to Claude - no templates, no patterns
        prompt = f"""Quote this tweet from @{username} ({author}):

"{text}"

Write a 6-sentence thoughtful response that offers valuable insight related to this post. Write it like you're talking to a very intelligent human being that you've just met - be genuine, insightful, and interesting. Not promotional. Just real conversation.

Keep it under 280 characters total."""

        try:
            message = self.claude.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                temperature=0.9,  # Higher temperature for more natural variation
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            response_text = message.content[0].text.strip()

            # Make sure it fits in a tweet
            if len(response_text) > 280:
                # Ask Claude to shorten it
                shorten_prompt = f"Shorten this to under 280 characters while keeping the insight:\n\n{response_text}"
                message = self.claude.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=300,
                    temperature=0.7,
                    messages=[{"role": "user", "content": shorten_prompt}]
                )
                response_text = message.content[0].text.strip()

            logger.info(f"Generated quote tweet: {response_text[:100]}...")
            return response_text

        except Exception as e:
            logger.error(f"Error generating quote tweet with Claude: {e}")
            return None

    def post_daily_quote_tweet(self) -> Dict:
        """
        Main method: Find a relevant tweet and quote it with AI-generated insight

        Returns:
            dict with success status and details
        """
        logger.info("Starting daily AI agent quote tweet generation...")

        # Find relevant tweets
        tweets = self.find_relevant_tweets(hours_back=24)

        if not tweets:
            logger.warning("No relevant tweets found")
            return {
                'success': False,
                'error': 'No relevant tweets found'
            }

        # Try top tweets until we successfully generate and post
        for tweet in tweets[:3]:  # Try top 3
            logger.info(f"Processing tweet {tweet['id']} from @{tweet['author']['username']}")

            # Generate quote tweet content
            quote_content = self.generate_quote_tweet(tweet)

            if not quote_content:
                logger.warning(f"Failed to generate content for tweet {tweet['id']}, trying next...")
                continue

            # Post the quote tweet
            result = self.twitter.quote_tweet(
                tweet_id=tweet['id'],
                content=quote_content
            )

            if result['success']:
                logger.info(f"Successfully posted quote tweet: {result['url']}")

                # Also post to Discord if configured
                discord_result = None
                if self.discord.is_configured():
                    discord_result = self.discord.post_quote_tweet(
                        content=quote_content,
                        original_tweet=tweet,
                        twitter_url=result['url']
                    )

                    if discord_result['success']:
                        logger.info("Also posted to Discord")
                    else:
                        logger.warning(f"Discord posting failed: {discord_result.get('error')}")

                return {
                    'success': True,
                    'tweet_id': result['tweet_id'],
                    'url': result['url'],
                    'original_tweet': tweet['id'],
                    'original_author': tweet['author']['username'],
                    'content': quote_content,
                    'discord': discord_result
                }
            else:
                logger.warning(f"Failed to post quote tweet: {result['error']}, trying next...")

        return {
            'success': False,
            'error': 'Failed to generate or post quote tweet after multiple attempts'
        }


if __name__ == '__main__':
    """Test run"""
    poster = AIAgentPoster()
    result = poster.post_daily_quote_tweet()

    if result['success']:
        print(f"Success! Posted at: {result['url']}")
        print(f"Content: {result['content']}")
    else:
        print(f"Failed: {result['error']}")
