#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Deep Dive Post - Twitter Only
Manually generate and post a deep dive for SwissBorg $41.5M exploit to Twitter
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

# Social media config - ONLY Twitter
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
        'enabled': False
    },
    'reddit': {
        'enabled': False
    },
    'telegram': {
        'enabled': False
    }
}

# SwissBorg exploit data
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
print("TEST: SwissBorg $41.5M Deep Dive Post - TWITTER")
print("="*80)
print(f"\nExploit: {exploit.protocol}")
print(f"Amount: {exploit.formatted_amount}")
print(f"Chain: {exploit.chain}")
print(f"Type: {exploit.exploit_type}")
print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d')}")
print(f"\nTarget: Twitter @KamiyoAI")

# Check Twitter credentials
if not social_config['x_twitter']['api_key']:
    print("\n❌ ERROR: Twitter credentials not configured!")
    print("Twitter variables needed: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET")
    sys.exit(1)

print("\n✅ Twitter credentials found")

# Initialize engine
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
    kamiyo_api_key=os.getenv('KAMIYO_API_KEY'),
    enable_monitoring=False,
    enable_alerting=False
)

print("\n" + "="*80)
print("GENERATING DEEP DIVE ANALYSIS THREAD")
print("="*80)

# Process exploit - this will generate deep dive and post
result = engine.process_exploit(
    exploit,
    platforms=[Platform.X_TWITTER],
    auto_post=True
)

print("\n" + "="*80)
print("RESULT")
print("="*80)

if result['success']:
    print("✅ SUCCESS! Deep dive thread posted to Twitter @KamiyoAI")
    print("\nCheck: https://twitter.com/KamiyoAI")

    # Show posting results
    if 'posting_results' in result:
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            if platform_result.get('success'):
                print(f"\n✅ {platform}: Posted successfully")
                if 'tweet_ids' in platform_result:
                    print(f"   Thread: {len(platform_result['tweet_ids'])} tweets")
                    print(f"   First tweet: https://twitter.com/KamiyoAI/status/{platform_result['tweet_ids'][0]}")
            else:
                print(f"\n❌ {platform}: Failed")
                print(f"   Error: {platform_result.get('error', 'Unknown')}")
else:
    print("❌ FAILED to post")
    print(f"Reason: {result.get('reason', 'Unknown')}")
    if 'posting_results' in result:
        print("\nDetails:")
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            print(f"  {platform}: {platform_result.get('error', 'No error info')}")

print("\n" + "="*80)
