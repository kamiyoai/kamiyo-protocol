#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for AI Agent Poster
Tests all components without actually posting to Twitter
"""

import logging
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_twitter_auth():
    """Test Twitter authentication"""
    logger.info("=" * 80)
    logger.info("TEST 1: Twitter Authentication")
    logger.info("=" * 80)

    try:
        from social.twitter_client import TwitterClient

        # Check environment variables
        required_vars = [
            'TWITTER_API_KEY',
            'TWITTER_API_SECRET',
            'TWITTER_ACCESS_TOKEN',
            'TWITTER_ACCESS_SECRET'
        ]

        missing = [var for var in required_vars if not os.getenv(var)]
        if missing:
            logger.error(f"Missing environment variables: {', '.join(missing)}")
            logger.info("Set these in your environment:")
            for var in missing:
                logger.info(f"  export {var}='your_value_here'")
            return False

        client = TwitterClient()
        if client.authenticate():
            logger.info("Twitter authentication: SUCCESS")
            return True
        else:
            logger.error("Twitter authentication: FAILED")
            return False

    except Exception as e:
        logger.error(f"Twitter auth test failed: {e}", exc_info=True)
        return False


def test_claude_api():
    """Test Claude API"""
    logger.info("=" * 80)
    logger.info("TEST 2: Claude API")
    logger.info("=" * 80)

    try:
        import anthropic

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            logger.error("Missing ANTHROPIC_API_KEY environment variable")
            logger.info("Set it with: export ANTHROPIC_API_KEY='your_key_here'")
            return False

        client = anthropic.Anthropic(api_key=api_key)

        # Test API call
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": "Say 'API test successful' in 5 words or less."
                }
            ]
        )

        response = message.content[0].text
        logger.info(f"Claude response: {response}")
        logger.info("Claude API: SUCCESS")
        return True

    except Exception as e:
        logger.error(f"Claude API test failed: {e}", exc_info=True)
        return False


def test_tweet_search():
    """Test searching for tweets"""
    logger.info("=" * 80)
    logger.info("TEST 3: Tweet Search")
    logger.info("=" * 80)

    try:
        from social.twitter_client import TwitterClient

        client = TwitterClient()
        client.authenticate()

        # Search for recent tweets
        query = "from:elonmusk -is:retweet"
        tweets = client.search_recent_tweets(query, max_results=5)

        if tweets:
            logger.info(f"Found {len(tweets)} tweets")
            logger.info(f"Sample tweet: @{tweets[0]['author']['username']}: {tweets[0]['text'][:100]}...")
            logger.info("Tweet search: SUCCESS")
            return True
        else:
            logger.warning("No tweets found (might be rate limited or no recent tweets)")
            return True  # Not necessarily a failure

    except Exception as e:
        logger.error(f"Tweet search test failed: {e}", exc_info=True)
        return False


def test_content_generation():
    """Test AI content generation"""
    logger.info("=" * 80)
    logger.info("TEST 4: AI Content Generation")
    logger.info("=" * 80)

    try:
        from social.ai_agent_poster import AIAgentPoster

        poster = AIAgentPoster()

        # Create a mock tweet
        mock_tweet = {
            'id': '123456789',
            'text': 'AI agents are becoming more autonomous and capable every day. The future is closer than we think.',
            'author': {
                'name': 'Test User',
                'username': 'testuser',
                'id': '12345'
            },
            'metrics': {
                'like_count': 100,
                'retweet_count': 50
            }
        }

        content = poster.generate_quote_tweet(mock_tweet)

        if content:
            logger.info(f"Generated content ({len(content)} chars):")
            logger.info(f"  {content}")
            logger.info("Content generation: SUCCESS")
            return True
        else:
            logger.error("Failed to generate content")
            return False

    except Exception as e:
        logger.error(f"Content generation test failed: {e}", exc_info=True)
        return False


def test_full_discovery():
    """Test full tweet discovery pipeline"""
    logger.info("=" * 80)
    logger.info("TEST 5: Full Tweet Discovery")
    logger.info("=" * 80)

    try:
        from social.ai_agent_poster import AIAgentPoster

        poster = AIAgentPoster()
        tweets = poster.find_relevant_tweets(hours_back=24)

        if tweets:
            logger.info(f"Found {len(tweets)} relevant tweets")
            for i, tweet in enumerate(tweets[:3], 1):
                logger.info(f"  {i}. @{tweet['author']['username']}: {tweet['text'][:80]}...")
            logger.info("Tweet discovery: SUCCESS")
            return True
        else:
            logger.warning("No relevant tweets found")
            return True  # Not necessarily a failure

    except Exception as e:
        logger.error(f"Discovery test failed: {e}", exc_info=True)
        return False


def main():
    """Run all tests"""
    logger.info("Starting AI Agent Poster System Tests")
    logger.info("(No actual tweets will be posted)")
    logger.info("")

    results = {
        'Twitter Auth': test_twitter_auth(),
        'Claude API': test_claude_api(),
        'Tweet Search': test_tweet_search(),
        'Content Generation': test_content_generation(),
        'Full Discovery': test_full_discovery()
    }

    logger.info("")
    logger.info("=" * 80)
    logger.info("TEST RESULTS SUMMARY")
    logger.info("=" * 80)

    all_passed = True
    for test_name, result in results.items():
        status = "PASS" if result else "FAIL"
        logger.info(f"{test_name}: {status}")
        if not result:
            all_passed = False

    logger.info("=" * 80)

    if all_passed:
        logger.info("All tests PASSED! System is ready.")
        logger.info("")
        logger.info("To run the poster manually:")
        logger.info("  python social/run_daily.py")
        logger.info("")
        logger.info("To setup daily automation:")
        logger.info("  ./social/setup_cron.sh")
        return 0
    else:
        logger.error("Some tests FAILED. Fix issues before running.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
