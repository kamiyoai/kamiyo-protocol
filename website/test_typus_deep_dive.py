#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Deep Dive Post for Typus Perp
Manually generate and post a deep dive for Typus Perp $3.4M exploit
"""

import os
import sys
import logging
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.models import ExploitData, Platform
from social.autonomous_growth_engine import AutonomousGrowthEngine
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Social media config - Twitter only for this test
social_config = {
    'discord': {
        'enabled': False  # Disable Discord for this test
    },
    'x_twitter': {
        'enabled': os.getenv('X_TWITTER_ENABLED', 'false').lower() == 'true',
        'api_key': os.getenv('X_API_KEY'),
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

# Typus Perp exploit data
exploit = ExploitData(
    tx_hash="generated-a25063580bb93623",
    protocol="Typus Perp",
    chain="Sui",
    loss_amount_usd=3_400_000.00,
    exploit_type="TLP Contract Exploit",
    timestamp=datetime(2025, 10, 15, 2, 0, 0),
    description="TLP Contract Exploit",
    recovery_status=None,
    source="defillama",
    source_url="https://x.com/TypusFinance/status/1978465485395304778"
)

print("="*80)
print("TEST: Typus Perp $3.4M Deep Dive Post")
print("="*80)
print(f"\nExploit: {exploit.protocol}")
print(f"Amount: {exploit.formatted_amount}")
print(f"Chain: {exploit.chain}")
print(f"Type: {exploit.exploit_type}")
print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d')}")

# Check which platforms are enabled
enabled_platforms = []
if social_config['x_twitter']['enabled']:
    enabled_platforms.append(Platform.X_TWITTER)
if social_config['discord']['enabled'] and social_config['discord']['webhooks']:
    enabled_platforms.append(Platform.DISCORD)

if not enabled_platforms:
    print("\n❌ ERROR: No platforms configured!")
    print("Enable at least one platform:")
    print("  - Set X_TWITTER_ENABLED=true and configure X API credentials")
    print("  - Set DISCORD_ENABLED=true and DISCORD_SOCIAL_WEBHOOKS")
    sys.exit(1)

print(f"\nTarget platforms: {[p.value for p in enabled_platforms]}")

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
    platforms=enabled_platforms,
    auto_post=True
)

print("\n" + "="*80)
print("RESULT")
print("="*80)

if result['success']:
    print("✅ SUCCESS! Deep dive generated")

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
    print("❌ FAILED")
    print(f"Reason: {result.get('reason', 'Unknown')}")
    if 'posting_results' in result:
        print("\nDetails:")
        for platform, platform_result in result['posting_results'].get('results', {}).items():
            print(f"  {platform}: {platform_result.get('error', 'No error info')}")

print("\n" + "="*80)
