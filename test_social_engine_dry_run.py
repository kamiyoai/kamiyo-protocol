#!/usr/bin/env python3
"""
Test Social Engine - Dry Run Mode
Shows what would be posted without actually posting
"""
import os
os.environ['KAMIYO_API_URL'] = 'https://api.kamiyo.ai'

from social.models import ExploitData, Platform
from social.analysis import ReportGenerator
from social.post_generator import PostGenerator
from datetime import datetime
import requests

print("=" * 80)
print("🧪 TESTING SOCIAL ENGINE - DRY RUN MODE")
print("=" * 80)
print()

# Fetch real exploit from API
print("📡 Fetching exploit from production API...")
response = requests.get('https://api.kamiyo.ai/exploits?min_amount=1000000&page_size=1')
data = response.json()['data'][0]

print(f"✅ Got exploit: {data['protocol']} (${data['amount_usd']:,.0f})")
print()

# Create exploit object
exploit = ExploitData(
    tx_hash=data['tx_hash'],
    protocol=data['protocol'],
    chain=data['chain'],
    loss_amount_usd=data['amount_usd'],
    exploit_type=data.get('category', 'Unknown'),
    timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
    description=data.get('description', ''),
    source=data['source']
)

print("-" * 80)
print("STEP 1: GENERATING ANALYSIS REPORT")
print("-" * 80)

# Generate analysis
report_gen = ReportGenerator()
report = report_gen.analyze_exploit(exploit)

print(f"✅ Report ID: {report.report_id}")
print(f"✅ Severity: {report.impact.severity.indicator}")
print()
print("Executive Summary:")
print(report.executive_summary[:200] + "...")
print()

if report.engagement_hooks:
    print("Engagement Hooks:")
    for hook in report.engagement_hooks[:2]:
        print(f"  • {hook}")
print()

print("-" * 80)
print("STEP 2: GENERATING PLATFORM-SPECIFIC CONTENT")
print("-" * 80)
print()

# Generate posts for all platforms
post_gen = PostGenerator()
post = post_gen.generate_post(
    exploit,
    platforms=[Platform.DISCORD, Platform.X_TWITTER, Platform.REDDIT, Platform.TELEGRAM]
)

# Discord
print("💬 DISCORD POST:")
print("-" * 80)
print(post.content[Platform.DISCORD])
print()

# Twitter
print("🐦 TWITTER/X THREAD:")
print("-" * 80)
twitter_content = post.content[Platform.X_TWITTER]
if isinstance(twitter_content, list):
    for i, tweet in enumerate(twitter_content, 1):
        print(f"Tweet {i}/{len(twitter_content)}:")
        print(tweet)
        print(f"({len(tweet)} chars)")
        print()
else:
    print(twitter_content)
    print()

# Reddit
print("🔴 REDDIT POST:")
print("-" * 80)
reddit_content = post.content[Platform.REDDIT]
print(reddit_content[:400] + "...\n[truncated for display]")
print()

# Telegram
print("✈️ TELEGRAM MESSAGE:")
print("-" * 80)
telegram_content = post.content[Platform.TELEGRAM]
print(telegram_content[:300] + "...\n[truncated for display]")
print()

print("=" * 80)
print("✅ TEST COMPLETE - CONTENT GENERATION WORKS!")
print("=" * 80)
print()
print("📊 Summary:")
print(f"  • Fetched exploit: {exploit.protocol} (${exploit.formatted_amount})")
print(f"  • Generated {len(report.engagement_hooks)} engagement hooks")
print(f"  • Created content for {len(post.content)} platforms")
print()
print("🎯 Next Steps:")
print("  1. Get Discord webhook or Telegram bot token")
print("  2. Set environment variables")
print("  3. Run: python3 social/autonomous_growth_engine.py --mode poll")
print("  4. Watch posts appear automatically!")
print()
