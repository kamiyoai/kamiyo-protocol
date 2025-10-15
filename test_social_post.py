#!/usr/bin/env python3
"""
Test social posting with a real exploit from the database
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from social.autonomous_growth_engine import AutonomousGrowthEngine
from social.models import ExploitData
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Use environment variables (set these before running)
social_config = {
    'reddit': {
        'enabled': False,
    },
    'discord': {
        'enabled': False,
    },
    'telegram': {
        'enabled': False,
    },
    'x_twitter': {
        'enabled': os.getenv('X_TWITTER_ENABLED', 'false').lower() == 'true',
        'api_key': os.getenv('X_API_KEY'),
        'api_secret': os.getenv('X_API_SECRET'),
        'access_token': os.getenv('X_ACCESS_TOKEN'),
        'access_secret': os.getenv('X_ACCESS_SECRET'),
        'bearer_token': os.getenv('X_BEARER_TOKEN')
    }
}

# Check if Twitter is enabled
if not social_config['x_twitter']['enabled']:
    print("❌ X_TWITTER_ENABLED not set to 'true'")
    print("Set environment variables:")
    print("  export X_TWITTER_ENABLED=true")
    print("  export X_API_KEY=your_key")
    print("  export X_API_SECRET=your_secret")
    print("  export X_ACCESS_TOKEN=your_token")
    print("  export X_ACCESS_SECRET=your_secret")
    sys.exit(1)

print("✅ Twitter credentials loaded")

# Initialize engine
engine = AutonomousGrowthEngine(
    social_config=social_config,
    kamiyo_api_url='https://api.kamiyo.ai',
    enable_monitoring=False,
    enable_alerting=False
)

print("✅ Autonomous Growth Engine initialized")
print(f"Platform count: {len(engine.social_poster.platforms)}")

# Create test exploit (SBI Crypto - real exploit from DB)
exploit = ExploitData(
    tx_hash="generated-07ee0a85b6e4e31a",
    protocol="SBI Crypto",
    chain="Bitcoin",
    loss_amount_usd=24000000.0,
    exploit_type="Exchange Hack",
    timestamp=datetime(2025, 9, 24, 2, 0, 0),
    description="Major cryptocurrency exchange hack with suspected DPRK links",
    recovery_status=None,
    source="defillama",
    source_url="https://www.coindesk.com/business/2025/10/01/sbi-crypto-reportedly-hit-by-usd21m-hack-with-suspected-dprk-links"
)

print(f"\n{'='*60}")
print(f"Testing with: {exploit.protocol}")
print(f"Amount: ${exploit.loss_amount_usd:,.0f}")
print(f"Chain: {exploit.chain}")
print(f"Type: {exploit.exploit_type}")
print(f"{'='*60}\n")

# Process exploit
logger.info("Processing exploit...")
result = engine.process_exploit(exploit, auto_post=True)

# Show results
print(f"\n{'='*60}")
print("RESULT:")
print(f"{'='*60}")
print(f"Success: {result.get('success')}")
print(f"Partial: {result.get('partial', False)}")

if result.get('posting_results'):
    print("\nPosting Results:")
    for platform, platform_result in result['posting_results'].get('results', {}).items():
        status = "✅" if platform_result.get('success') else "❌"
        print(f"  {status} {platform}: {platform_result.get('url', platform_result.get('error', 'No details'))}")

if result.get('error'):
    print(f"\nError: {result['error']}")

print(f"\nStats: {result.get('stats')}")
print(f"{'='*60}\n")
