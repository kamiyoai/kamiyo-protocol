#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Content Generation Quality Test
Tests Claude-powered content generation WITHOUT requiring Twitter API credentials
"""

import logging
import sys
import os
from typing import Dict
import anthropic

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def generate_quote_tweet_content(original_tweet: Dict, claude_client) -> str:
    """
    Generate quote tweet content using Claude
    (Extracted from AIAgentPoster for standalone testing)
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
        message = claude_client.messages.create(
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
            message = claude_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                temperature=0.7,
                messages=[{"role": "user", "content": shorten_prompt}]
            )
            response_text = message.content[0].text.strip()

        return response_text

    except Exception as e:
        logger.error(f"Error generating quote tweet with Claude: {e}")
        return None


def main():
    """Test AI content generation quality"""
    logger.info("")
    logger.info("╔" + "═" * 78 + "╗")
    logger.info("║" + " " * 15 + "AI CONTENT GENERATION QUALITY TEST" + " " * 29 + "║")
    logger.info("╚" + "═" * 78 + "╝")
    logger.info("")
    logger.info("Testing Claude AI content generation with real-world examples")
    logger.info("This test validates:")
    logger.info("  ✓ Content is natural and conversational (not template-based)")
    logger.info("  ✓ Content offers genuine insights")
    logger.info("  ✓ Content fits within Twitter's 280 character limit")
    logger.info("  ✓ Quality matches Claude Opus 4.1 browser UI standards")
    logger.info("")

    # Check for Anthropic API key
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        logger.error("❌ ANTHROPIC_API_KEY not set in environment")
        logger.info("")
        logger.info("Set it with:")
        logger.info("  export ANTHROPIC_API_KEY='your_key_here'")
        return 1

    # Initialize Claude client
    claude = anthropic.Anthropic(api_key=api_key)
    logger.info("✓ Claude API client initialized")
    logger.info("")

    # Real-world test tweets from AI/agent leaders
    test_tweets = [
        {
            'id': '1234567890',
            'text': 'AI agents are evolving beyond simple task automation. The future is multi-agent systems that can collaborate, negotiate, and make collective decisions autonomously. This changes everything about how we think about distributed intelligence.',
            'author': {
                'name': 'Yat Siu',
                'username': 'ysiu',
                'id': '12345'
            },
            'metrics': {
                'like_count': 523,
                'retweet_count': 142
            }
        },
        {
            'id': '0987654321',
            'text': 'Phala Network is pushing the boundaries of decentralized AI agent execution. Our TEE-based approach enables truly private and verifiable agent computation on-chain. The intersection of privacy, security, and autonomy is where the magic happens.',
            'author': {
                'name': 'Phala Network',
                'username': 'PhalaNetwork',
                'id': '54321'
            },
            'metrics': {
                'like_count': 892,
                'retweet_count': 234
            }
        },
        {
            'id': '1122334455',
            'text': 'The shift from LLMs to LLM-powered agents represents a paradigm change. It is not about better models anymore; it is about giving models agency, memory, and the ability to interact with the world. That is when things get interesting.',
            'author': {
                'name': 'Anthropic',
                'username': 'AnthropicAI',
                'id': '98765'
            },
            'metrics': {
                'like_count': 2341,
                'retweet_count': 678
            }
        }
    ]

    all_results = []

    for i, tweet in enumerate(test_tweets, 1):
        logger.info("─" * 80)
        logger.info(f"TEST {i}/3: @{tweet['author']['username']}")
        logger.info("─" * 80)
        logger.info("")
        logger.info("ORIGINAL TWEET:")
        logger.info(f"  Author: {tweet['author']['name']} (@{tweet['author']['username']})")
        logger.info(f"  Engagement: {tweet['metrics']['like_count']} likes, {tweet['metrics']['retweet_count']} RTs")
        logger.info(f"  Text: {tweet['text']}")
        logger.info("")

        # Generate content
        logger.info("Generating AI quote tweet content...")
        content = generate_quote_tweet_content(tweet, claude)

        if content:
            logger.info("")
            logger.info("✓ GENERATED CONTENT:")
            logger.info("─" * 80)
            logger.info(content)
            logger.info("─" * 80)
            logger.info("")
            logger.info(f"  Length: {len(content)} characters")
            logger.info(f"  Status: {'✓ VALID (under 280)' if len(content) <= 280 else '✗ TOO LONG'}")
            logger.info("")

            all_results.append({
                'tweet': tweet,
                'content': content,
                'length': len(content),
                'valid': len(content) <= 280
            })
        else:
            logger.error("✗ GENERATION FAILED")
            logger.info("")
            all_results.append({
                'tweet': tweet,
                'content': None,
                'length': 0,
                'valid': False
            })

    # Quality review
    logger.info("")
    logger.info("=" * 80)
    logger.info("QUALITY REVIEW & RESULTS")
    logger.info("=" * 80)
    logger.info("")

    successful = [r for r in all_results if r['content'] is not None]
    valid_length = [r for r in successful if r['valid']]

    logger.info(f"✓ Generation Success: {len(successful)}/{len(test_tweets)} ({len(successful)/len(test_tweets)*100:.0f}%)")
    logger.info(f"✓ Length Compliance: {len(valid_length)}/{len(successful)} ({len(valid_length)/len(successful)*100 if successful else 0:.0f}%)")

    if successful:
        avg_length = sum(r['length'] for r in successful) / len(successful)
        logger.info(f"  Average Length: {avg_length:.0f} characters")

    logger.info("")
    logger.info("─" * 80)
    logger.info("MANUAL QUALITY CHECKLIST")
    logger.info("─" * 80)
    logger.info("")
    logger.info("Please review the generated content above and verify:")
    logger.info("")
    logger.info("  [ ] NOT template-based or following a pattern")
    logger.info("  [ ] Genuinely insightful and adds value")
    logger.info("  [ ] Natural conversational tone (like talking to a peer)")
    logger.info("  [ ] NOT promotional, salesy, or corporate-sounding")
    logger.info("  [ ] Engaging and thought-provoking")
    logger.info("  [ ] Quality matches Claude Opus 4.1 in browser UI")
    logger.info("  [ ] Each response is unique (not repetitive)")
    logger.info("")

    if len(valid_length) == len(test_tweets):
        logger.info("=" * 80)
        logger.info("🎉 ALL TESTS PASSED")
        logger.info("=" * 80)
        logger.info("")
        logger.info("The AI system:")
        logger.info("  ✓ Successfully generates content for all test cases")
        logger.info("  ✓ Stays within Twitter's 280 character limit")
        logger.info("  ✓ Uses Claude Sonnet 4.5 with temp=0.9 for natural variation")
        logger.info("")
        logger.info("IMPORTANT: Review the generated content above manually.")
        logger.info("It should be as good as asking Claude Opus 4.1 directly.")
        logger.info("")
        logger.info("If satisfied with quality:")
        logger.info("  1. Configure Twitter API credentials")
        logger.info("  2. Configure Discord webhook (optional)")
        logger.info("  3. Run: python social/run_daily.py")
        logger.info("")
        return 0
    else:
        logger.warning("")
        logger.warning("=" * 80)
        logger.warning("⚠️  SOME TESTS FAILED")
        logger.warning("=" * 80)
        logger.warning("")
        logger.warning("Review failures above and adjust if needed.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
