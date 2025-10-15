#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Deep Dive Post
Manually generate and post a deep dive for SwissBorg $41.5M exploit
"""

import os
import sys
import logging
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.models import ExploitData, Platform
from social.autonomous_growth_engine import AutonomousGrowthEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Social media config - ONLY Discord for testing
social_config = {
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
    'x_twitter': {
        'enabled': False  # Disable Twitter to avoid rate limits
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
    description="Third-party API compromise led to unauthorized access and $41.5M loss",
    recovery_status="Investigation ongoing",
    source="DeFiLlama",
    source_url=None
)

print("="*80)
print("TEST: SwissBorg $41.5M Deep Dive Post")
print("="*80)
print(f"\nExploit: {exploit.protocol}")
print(f"Amount: {exploit.formatted_amount}")
print(f"Chain: {exploit.chain}")
print(f"Type: {exploit.exploit_type}")
print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d')}")
print(f"\nTarget: Discord only (Twitter disabled due to rate limits)")

# Check Discord webhook
if not social_config['discord']['webhooks']:
    print("\n❌ ERROR: No Discord webhook configured!")
    print("Set DISCORD_SOCIAL_WEBHOOKS environment variable:")
    print("  export DISCORD_SOCIAL_WEBHOOKS='exploits=https://discord.com/api/webhooks/YOUR_WEBHOOK'")
    sys.exit(1)

print(f"\nDiscord webhooks configured: {list(social_config['discord']['webhooks'].keys())}")

# Initialize engine
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
    kamiyo_api_key=os.getenv('KAMIYO_API_KEY'),
    enable_monitoring=False,
    enable_alerting=False
)

print("\n" + "="*80)
print("GENERATING DEEP DIVE ANALYSIS")
print("="*80)

# Process exploit - this will generate deep dive and post
result = engine.process_exploit(
    exploit,
    platforms=[Platform.DISCORD],
    auto_post=True
)

print("\n" + "="*80)
print("RESULT")
print("="*80)

if result['success']:
    print("✅ SUCCESS! Deep dive posted to Discord")

    # Show posting results
    if 'posting_results' in result:
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            if platform_result.get('success'):
                print(f"\n✅ {platform}: Posted successfully")
                if 'results' in platform_result:
                    for channel_result in platform_result['results']:
                        print(f"   - Channel: {channel_result.get('channel', 'unknown')}")
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
