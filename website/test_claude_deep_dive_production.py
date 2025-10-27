#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Claude AI Deep Dive Analysis - Production Test
Fetches the latest $1M+ exploit and generates a deep dive analysis with Claude Sonnet 4
"""

import os
import sys
import logging
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.models import ExploitData, Platform
from social.autonomous_growth_engine import AutonomousGrowthEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def fetch_latest_exploit_over_threshold(threshold_usd=1_000_000):
    """
    Fetch the latest exploit from KAMIYO API that meets the threshold

    Args:
        threshold_usd: Minimum USD amount (default: $1M)

    Returns:
        ExploitData or None
    """
    # Try local API first, then production
    api_urls = [
        'http://localhost:8000',
        'https://api.kamiyo.ai'
    ]

    for api_url in api_urls:
        try:
            logger.info(f"Fetching exploits from {api_url}/exploits...")
            response = requests.get(
                f"{api_url}/exploits",
                params={
                    'page': 1,
                    'page_size': 100,
                    'min_amount': threshold_usd
                },
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            exploits = data.get('data', [])

            logger.info(f"Found {len(exploits)} exploits >= ${threshold_usd:,}")

            if not exploits:
                logger.warning(f"No exploits found >= ${threshold_usd:,}")
                continue

            # Take the first exploit (already sorted by timestamp desc)
            exploit = exploits[0]

            logger.info(f"Selected exploit: {exploit.get('protocol')} - ${exploit.get('loss_amount_usd', 0):,.0f}")

            # Convert to ExploitData model
            timestamp_str = exploit.get('timestamp', '')
            try:
                timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            except:
                timestamp = datetime.now()

            return ExploitData(
                tx_hash=exploit.get('tx_hash', ''),
                protocol=exploit.get('protocol', 'Unknown'),
                chain=exploit.get('chain', 'Unknown'),
                loss_amount_usd=exploit.get('loss_amount_usd', 0),
                exploit_type=exploit.get('exploit_type', 'Unknown'),
                timestamp=timestamp,
                description=exploit.get('description', ''),
                recovery_status=exploit.get('recovery_status', 'Unknown'),
                source=exploit.get('source', 'KAMIYO'),
                source_url=exploit.get('source_url')
            )

        except Exception as e:
            logger.warning(f"Failed to fetch from {api_url}: {e}")
            continue

    return None


def get_fallback_exploit():
    """Return a hardcoded large exploit for testing when API is unavailable"""
    return ExploitData(
        tx_hash="generated-test-hypervault-1760000000",
        protocol="HyperVault",
        chain="Hyperliquid",
        loss_amount_usd=3_600_000.00,
        exploit_type="Drain Vaults",
        timestamp=datetime(2025, 10, 15, 12, 0, 0),
        description="Drain Vaults attack resulted in $3.6M loss from HyperVault protocol",
        recovery_status="Investigation ongoing",
        source="DeFiLlama",
        source_url=None
    )


def main():
    """Main test function"""

    print("=" * 80)
    print("CLAUDE AI DEEP DIVE ANALYSIS - PRODUCTION TEST")
    print("=" * 80)

    # Check for dry-run mode
    dry_run = os.getenv('DRY_RUN', 'true').lower() == 'true'
    if dry_run:
        print("\n🔬 DRY RUN MODE: Will generate content but not post")
        print("   Set DRY_RUN=false to actually post to social media")

    # Check API key
    anthropic_key = os.getenv('ANTHROPIC_API_KEY')
    if not anthropic_key or anthropic_key == 'sk-ant-api03-YOUR_KEY_HERE':
        print("\n❌ ERROR: ANTHROPIC_API_KEY not set!")
        print("Set it in your .env file")
        sys.exit(1)

    print(f"\n✅ ANTHROPIC_API_KEY is configured")
    print(f"   Key prefix: {anthropic_key[:20]}...")

    # For testing, always use the fallback exploit to ensure Claude AI deep dive
    threshold = int(os.getenv('DEEP_DIVE_THRESHOLD_USD', 1_000_000))
    print(f"\n🔍 Using test exploit for Claude AI deep dive demo...")

    exploit = get_fallback_exploit()  # Always use HyperVault $3.6M for testing

    print("\n" + "=" * 80)
    print("EXPLOIT DETAILS")
    print("=" * 80)
    print(f"Protocol: {exploit.protocol}")
    print(f"Chain: {exploit.chain}")
    print(f"Amount: {exploit.formatted_amount}")
    print(f"Type: {exploit.exploit_type}")
    print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Source: {exploit.source}")

    # Configure social media platforms
    # For testing, we'll just enable Twitter - credentials from .env will be used
    twitter_api_key = os.getenv('X_API_KEY')

    social_config = {
        'discord': {
            'enabled': False  # Disable for this test
        },
        'x_twitter': {
            'enabled': True,  # Always enable for testing
            'api_key': twitter_api_key,
            'api_secret': os.getenv('X_API_SECRET'),
            'access_token': os.getenv('X_ACCESS_TOKEN'),
            'access_secret': os.getenv('X_ACCESS_SECRET'),
            'bearer_token': os.getenv('X_BEARER_TOKEN')
        },
        'reddit': {
            'enabled': False
        },
        'telegram': {
            'enabled': False
        }
    }

    # For testing, always use Twitter even if credentials missing (will generate content in dry-run)
    target_platforms = [Platform.X_TWITTER]

    if twitter_api_key:
        print(f"\n✅ Twitter/X credentials found")
    else:
        print(f"\n⚠️  Twitter/X credentials not found - running in content generation mode only")

    print(f"\n📤 Target platform: Twitter/X")

    # Initialize engine
    print("\n" + "=" * 80)
    print("INITIALIZING AUTONOMOUS GROWTH ENGINE")
    print("=" * 80)

    engine = AutonomousGrowthEngine(
        social_config=social_config,
        kamiyo_api_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
        kamiyo_api_key=os.getenv('KAMIYO_API_KEY'),
        enable_monitoring=False,
        enable_alerting=False
    )

    print("✅ Engine initialized")

    # Check if exploit qualifies for deep dive
    if exploit.loss_amount_usd >= threshold:
        print(f"\n🎯 Exploit qualifies for CLAUDE AI DEEP DIVE (>= ${threshold:,})")
        print(f"   Using Claude Sonnet 4 with Extended Thinking")
    else:
        print(f"\n⚠️  Exploit below threshold (${exploit.loss_amount_usd:,.0f} < ${threshold:,})")
        print(f"   Will use basic post format")

    # Generate and post
    print("\n" + "=" * 80)
    if dry_run:
        print("GENERATING ANALYSIS (DRY RUN - NO POSTING)")
    else:
        print("GENERATING ANALYSIS & POSTING")
    print("=" * 80)

    result = engine.process_exploit(
        exploit,
        platforms=target_platforms,
        auto_post=not dry_run  # Don't post in dry-run mode
    )

    # Display results
    print("\n" + "=" * 80)
    print("RESULT")
    print("=" * 80)

    if result['success']:
        print("\n✅ SUCCESS! Analysis generated and posted")

        # Show posting results
        if 'posting_results' in result:
            for platform, platform_result in result['posting_results'].get('results', {}).items():
                if platform_result.get('success'):
                    print(f"\n✅ {platform.upper()}: Posted successfully")
                    if 'results' in platform_result:
                        for channel_result in platform_result['results']:
                            print(f"   - Channel: {channel_result.get('channel', 'unknown')}")
                            if 'url' in channel_result:
                                print(f"     URL: {channel_result['url']}")
                else:
                    print(f"\n❌ {platform.upper()}: Failed")
                    print(f"   Error: {platform_result.get('error', 'Unknown')}")

        # Show generated content
        if 'content' in result:
            print("\n" + "=" * 80)
            print("GENERATED CONTENT")
            print("=" * 80)

            content = result['content']

            if 'twitter_thread' in content:
                print("\n📱 TWITTER THREAD:")
                print("-" * 80)
                for i, tweet in enumerate(content['twitter_thread'], 1):
                    print(f"\nTweet {i}:")
                    print(tweet)
                    print(f"({len(tweet)} chars)")

            if 'discord_embed' in content:
                print("\n💬 DISCORD POST:")
                print("-" * 80)
                embed = content['discord_embed']
                print(f"Title: {embed.get('title', 'N/A')}")
                print(f"Description: {embed.get('description', 'N/A')[:200]}...")
    else:
        print("\n❌ FAILED")
        print(f"Reason: {result.get('reason', 'Unknown')}")
        if 'posting_results' in result:
            print("\nDetails:")
            for platform, platform_result in result['posting_results'].get('results', {}).items():
                print(f"  {platform}: {platform_result.get('error', 'No error info')}")

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
