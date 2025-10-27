#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test Discord post with all fixes"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set environment variable from .env
os.environ['DISCORD_SOCIAL_WEBHOOKS'] = 'exploits=https://discord.com/api/webhooks/1427728951052075161/8zp1DT4xHqpdf6JHRYzNaTE6mXZwS9hr9mibXr1NUFoODU9j4y4RryhB80SIb0i78OWb'
os.environ['ANTHROPIC_API_KEY'] = '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'

from social.models import ExploitData, Platform
from social.autonomous_growth_engine import AutonomousGrowthEngine

# Config
social_config = {
    'discord': {
        'enabled': True,
        'webhooks': {
            'exploits': 'https://discord.com/api/webhooks/1427728951052075161/8zp1DT4xHqpdf6JHRYzNaTE6mXZwS9hr9mibXr1NUFoODU9j4y4RryhB80SIb0i78OWb'
        }
    }
}

print("Testing Discord Post with Fixes")
print("="*60)

# Initialize engine
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url='https://api.kamiyo.ai',
    enable_monitoring=False,
    enable_alerting=False
)

# Create major exploit for deep dive
exploit = ExploitData(
    tx_hash="0xtest123456789abcdef",
    protocol="PancakeSwap",
    chain="BSC",
    loss_amount_usd=8_500_000.00,  # $8.5M
    exploit_type="Flash Loan",
    timestamp=datetime.utcnow(),
    description="Attacker exploited price oracle manipulation in PancakeSwap's liquidity pools",
    recovery_status="Funds frozen - recovery in progress",
    source="BlockSec",
    source_url="https://twitter.com/BlockSecTeam"
)

print(f"Posting: {exploit.protocol} - {exploit.formatted_amount}")

# Process and post
result = engine.process_exploit(
    exploit,
    platforms=[Platform.DISCORD],
    auto_post=True
)

print("\nResult:", "SUCCESS" if result['success'] else "FAILED")
if result.get('post'):
    content = result['post'].content.get(Platform.DISCORD)
    print("\nGenerated Content:")
    print("-"*60)
    print(content)
    print("-"*60)

print("\n✓ Check Discord for:")
print("  1. Single image (no double)")
print("  2. Root Cause section")
print("  3. Link: <https://kamiyo.ai>")
