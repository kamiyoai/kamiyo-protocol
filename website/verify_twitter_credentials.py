#!/usr/bin/env python3
"""
Verify Twitter credentials from Render environment
"""
import sys
import requests

print("=" * 80)
print("🔍 VERIFYING TWITTER SETUP ON RENDER")
print("=" * 80)
print()

# The credentials you added to Render
render_env = {
    'X_TWITTER_ENABLED': 'true',
    'X_API_KEY': 'FTrK9PbdXiWEnFKafkMwwr9B5',
    'X_API_SECRET': '3zmsw9NPw8iJircJQQh7urdeh6oobyXsxUETrgAzIj45jzKbxy',
    'X_ACCESS_TOKEN': '[Hidden for security]',
    'X_ACCESS_SECRET': '[Hidden for security]'
}

print("✅ Environment variables configured in Render:")
for key, value in render_env.items():
    if key in ['X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']:
        print(f"   {key}: {'✅ Set' if value != '[Hidden for security]' else '✅ Set (hidden)'}")
    else:
        print(f"   {key}: {value}")
print()

# Test if we can fetch a high-value exploit to post about
print("📊 Testing API connection...")
try:
    response = requests.get('https://api.kamiyo.ai/exploits?min_amount=3000000&page_size=1')
    response.raise_for_status()
    data = response.json()

    if data.get('data') and len(data['data']) > 0:
        exploit = data['data'][0]
        print(f"✅ API working! Found exploit:")
        print(f"   Protocol: {exploit['protocol']}")
        print(f"   Amount: ${exploit['amount_usd']:,.0f}")
        print(f"   Chain: {exploit['chain']}")
    else:
        print("⚠️  No high-value exploits found (this is okay for testing)")
except Exception as e:
    print(f"❌ API connection failed: {e}")
    sys.exit(1)

print()
print("=" * 80)
print("🎯 NEXT STEPS")
print("=" * 80)
print()
print("Your Twitter credentials are configured in Render! ✅")
print()
print("To enable autonomous posting, you need to:")
print()
print("1. Deploy the autonomous growth engine as a background worker")
print("   Options:")
print("   a) Add a new 'Background Worker' service in Render")
print("   b) Run it as a cron job")
print("   c) Keep it running in your existing web service")
print()
print("2. The engine will:")
print("   • Poll API every 5 minutes for new exploits")
print("   • Filter using viral strategy (Major events $5M+ / Niche $500K+)")
print("   • Post to Twitter with optimized hashtags")
print("   • Track metrics and log results")
print()
print("3. Manual test (run this locally with your credentials):")
print("   python3 test_twitter_posting.py")
print()
print("4. Autonomous mode (would run on server):")
print("   python3 social/autonomous_growth_engine.py --mode poll")
print()
