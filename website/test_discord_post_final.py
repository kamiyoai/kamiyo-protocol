#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Discord posting with all recent fixes:
1. Root Cause section added
2. No double OG image
3. Proper multiline parsing in Claude AI analysis
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.models import ExploitData, Platform
from social.poster import SocialMediaPoster

# Configuration
config = {
    'discord': {
        'enabled': True,
        'webhooks': {
            'test': os.getenv('DISCORD_TEST_WEBHOOK')
        }
    }
}

# Create poster
poster = SocialMediaPoster(config)

# Example exploit - realistic data
exploit = ExploitData(
    tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    protocol="Uniswap V3",
    chain="Ethereum",
    loss_amount_usd=2_500_000.00,
    exploit_type="Flash Loan",
    timestamp=datetime.utcnow(),
    description="Flash loan attack exploited price oracle manipulation vulnerability in liquidity pool pricing mechanism",
    recovery_status="Partial Recovery - 60% recovered",
    source="Rekt News",
    source_url="https://rekt.news/uniswap-rekt/"
)

print("="*60)
print("Testing Discord Post with All Fixes")
print("="*60)

# Create post
print("\n1. Creating post...")
post = poster.create_post_from_exploit(
    exploit,
    platforms=[Platform.DISCORD]
)

print(f"✓ Post created for: {exploit.protocol} - {exploit.formatted_amount}")

# Show content
print("\n2. Generated Discord content:")
print("-"*60)
discord_content = post.content.get(Platform.DISCORD)
print(discord_content)
print("-"*60)

# Auto-approve and post
print("\n3. Auto-approving and posting to Discord...")
post.mark_reviewed(approved=True)

result = poster.post_to_platforms(post)

print("\n4. Results:")
print(f"Success: {result['success']}")
if result.get('results'):
    for platform, platform_result in result['results'].items():
        print(f"\n{platform}:")
        print(f"  Success: {platform_result.get('success')}")
        if platform_result.get('url'):
            print(f"  URL: {platform_result['url']}")
        if platform_result.get('error'):
            print(f"  Error: {platform_result['error']}")

print("\n" + "="*60)
print("Test complete!")
print("="*60)
