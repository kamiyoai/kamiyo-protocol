#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Discord posting to verify:
1. No double OG image (URL wrapped in angle brackets)
2. Root Cause section appears
3. Claude AI analysis works correctly
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.models import ExploitData, Platform
from social.autonomous_growth_engine import AutonomousGrowthEngine

# Configuration for Discord only
social_config = {
    'discord': {
        'enabled': True,
        'webhooks': {
            'test': os.getenv('DISCORD_SOCIAL_WEBHOOK_TEST') or os.getenv('DISCORD_TEST_WEBHOOK')
        }
    },
    'reddit': {'enabled': False},
    'telegram': {'enabled': False},
    'x_twitter': {'enabled': False}
}

print("="*60)
print("Testing Discord Post - Double Image Fix")
print("="*60)

# Check webhook is configured
webhook = social_config['discord']['webhooks'].get('test')
if not webhook:
    print("\n❌ ERROR: Discord webhook not configured!")
    print("Set DISCORD_SOCIAL_WEBHOOK_TEST or DISCORD_TEST_WEBHOOK in .env")
    sys.exit(1)

print(f"\n✓ Discord webhook configured: {webhook[:50]}...")

# Initialize autonomous growth engine
print("\n1. Initializing Autonomous Growth Engine...")
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url='https://api.kamiyo.ai',
    enable_monitoring=False,
    enable_alerting=False
)

# Create a major exploit (>$1M) to trigger deep dive analysis
print("\n2. Creating test exploit data (major exploit for deep dive)...")
exploit = ExploitData(
    tx_hash="0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    protocol="Curve Finance",
    chain="Ethereum",
    loss_amount_usd=15_000_000.00,  # $15M - triggers deep dive
    exploit_type="Reentrancy",
    timestamp=datetime.utcnow(),
    description="A sophisticated reentrancy attack exploited a vulnerability in the liquidity pool's withdrawal mechanism, allowing the attacker to drain funds before balance updates were processed.",
    recovery_status="Partial Recovery - 30% recovered",
    source="PeckShield",
    source_url="https://twitter.com/peckshield"
)

print(f"   Protocol: {exploit.protocol}")
print(f"   Loss: {exploit.formatted_amount}")
print(f"   Type: {exploit.exploit_type}")

# Process exploit with autonomous engine
print("\n3. Processing exploit (generating Claude AI analysis)...")
result = engine.process_exploit(
    exploit,
    platforms=[Platform.DISCORD],
    auto_post=True  # Auto-approve for testing
)

# Show results
print("\n4. Results:")
print(f"   Success: {result['success']}")

if result.get('post'):
    post = result['post']
    print(f"   Status: {post.status.value}")

    # Show generated content
    discord_content = post.content.get(Platform.DISCORD)
    if discord_content:
        print("\n5. Generated Discord Content:")
        print("-"*60)
        print(discord_content)
        print("-"*60)

        # Verify fixes
        print("\n6. Verification:")
        has_angle_brackets = '<https://kamiyo.ai>' in discord_content
        has_root_cause = 'Root Cause:' in discord_content
        has_analysis = 'Analysis:' in discord_content

        print(f"   ✓ URL wrapped in angle brackets (no OG preview): {has_angle_brackets}")
        print(f"   ✓ Root Cause section present: {has_root_cause}")
        print(f"   ✓ Analysis section present: {has_analysis}")

if result.get('posting_results'):
    posting = result['posting_results']
    print("\n7. Posting Results:")
    for platform_name, platform_result in posting.get('results', {}).items():
        status = "✓ SUCCESS" if platform_result.get('success') else "✗ FAILED"
        print(f"   {platform_name}: {status}")
        if platform_result.get('error'):
            print(f"      Error: {platform_result['error']}")

print("\n" + "="*60)
print("Test Complete!")
print("="*60)
print("\nCheck your Discord channel to verify:")
print("  1. Only ONE image appears (no double OG image)")
print("  2. 'Root Cause:' section is visible")
print("  3. Claude AI analysis is formatted nicely")
print("="*60)
