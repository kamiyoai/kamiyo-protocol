#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Both Platforms - Twitter & Discord
Post latest high-impact exploit to both platforms
"""

import os
import sys
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
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

# Social media config - BOTH Twitter and Discord
social_config = {
    'x_twitter': {
        'enabled': os.getenv('X_TWITTER_ENABLED', 'true').lower() == 'true',
        'api_key': os.getenv('X_API_KEY'),
        'api_secret': os.getenv('X_API_SECRET'),
        'access_token': os.getenv('X_ACCESS_TOKEN'),
        'access_secret': os.getenv('X_ACCESS_SECRET'),
        'bearer_token': os.getenv('X_BEARER_TOKEN')
    },
    'discord': {
        'enabled': os.getenv('DISCORD_ENABLED', 'true').lower() == 'true',
        'webhooks': {
            name: url
            for name, url in (
                item.split('=')
                for item in os.getenv('DISCORD_SOCIAL_WEBHOOKS', '').split(',')
                if '=' in item
            )
        }
    },
    'reddit': {
        'enabled': False
    },
    'telegram': {
        'enabled': False
    }
}

# Latest high-impact exploit: SwissBorg $41.5M
exploit = ExploitData(
    tx_hash="generated-121986838376b975",
    protocol="SwissBorg",
    chain="Solana",
    loss_amount_usd=41_500_000.00,
    exploit_type="Third-party API compromise",
    timestamp=datetime(2025, 9, 9, 0, 0, 0),
    description="Third-party API compromise led to unauthorized access and $41.5M loss from SwissBorg platform",
    recovery_status="Investigation ongoing",
    source="DeFiLlama",
    source_url=None
)

print("="*80)
print("TEST: BOTH PLATFORMS - SwissBorg $41.5M Deep Dive")
print("="*80)
print(f"\nExploit: {exploit.protocol}")
print(f"Amount: {exploit.formatted_amount}")
print(f"Chain: {exploit.chain}")
print(f"Type: {exploit.exploit_type}")
print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d')}")
print(f"\nTargets:")

# Check Twitter credentials
if social_config['x_twitter']['api_key']:
    print("  ✅ Twitter @KamiyoAI")
else:
    print("  ❌ Twitter (no credentials)")

# Check Discord webhooks
if social_config['discord']['webhooks']:
    print(f"  ✅ Discord ({len(social_config['discord']['webhooks'])} webhook(s))")
else:
    print("  ❌ Discord (no webhooks)")

if not social_config['x_twitter']['api_key'] and not social_config['discord']['webhooks']:
    print("\n❌ ERROR: No platforms configured!")
    print("Set X_API_KEY and/or DISCORD_SOCIAL_WEBHOOKS environment variables")
    sys.exit(1)

# Initialize engine
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
    kamiyo_api_key=os.getenv('KAMIYO_API_KEY'),
    enable_monitoring=False,
    enable_alerting=False
)

print("\n" + "="*80)
print("GENERATING & POSTING TO ALL PLATFORMS")
print("="*80)

# Determine which platforms to use
platforms = []
if social_config['x_twitter']['api_key']:
    platforms.append(Platform.X_TWITTER)
if social_config['discord']['webhooks']:
    platforms.append(Platform.DISCORD)

# Process exploit - this will generate deep dive and post
result = engine.process_exploit(
    exploit,
    platforms=platforms,
    auto_post=True
)

print("\n" + "="*80)
print("RESULTS")
print("="*80)

if result['success']:
    print("✅ SUCCESS! Posted to all platforms")

    # Show posting results
    if 'posting_results' in result:
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            if platform_result.get('success'):
                print(f"\n✅ {platform}: Posted successfully")

                # Twitter-specific details
                if 'tweet_ids' in platform_result:
                    print(f"   Thread: {len(platform_result['tweet_ids'])} tweets")
                    print(f"   URL: https://twitter.com/KamiyoAI/status/{platform_result['tweet_ids'][0]}")

                # Discord-specific details
                if 'results' in platform_result:
                    for channel_result in platform_result['results']:
                        print(f"   Channel: {channel_result.get('channel', 'unknown')}")

            else:
                print(f"\n❌ {platform}: Failed")
                print(f"   Error: {platform_result.get('error', 'Unknown')}")
else:
    print("❌ FAILED to post")
    print(f"Reason: {result.get('reason', 'Unknown')}")

    if 'posting_results' in result:
        print("\nPlatform Details:")
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            error = platform_result.get('error', 'No error info')
            print(f"  {platform}: {error}")

print("\n" + "="*80)
