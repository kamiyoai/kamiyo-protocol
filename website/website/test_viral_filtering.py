#!/usr/bin/env python3
"""
Test Viral Filtering Strategy on Real Exploits
Shows which exploits would be posted and where
"""
import sys
sys.path.insert(0, '.')

from social.viral_strategy import ViralFilter, format_viral_post, PostingStrategy
from social.models import ExploitData
from datetime import datetime
import requests

print('=' * 80)
print('🎯 VIRAL POSTING STRATEGY - TESTING WITH REAL EXPLOITS')
print('=' * 80)
print()

# Fetch real exploits
print('📡 Fetching exploits from API...')
response = requests.get('https://api.kamiyo.ai/exploits?page_size=20')
exploits_data = response.json()['data']
print(f'✅ Got {len(exploits_data)} exploits')
print()

# Initialize filter
filter = ViralFilter(
    major_threshold_usd=5_000_000,  # $5M+ = major event
    niche_threshold_usd=500_000,     # $500K+ = niche if interesting
    max_age_hours=168                # 7 days (since API data is old)
)

print('-' * 80)
print('FILTERING RESULTS:')
print('-' * 80)
print()

major_posts = []
niche_posts = []
skipped = []

for data in exploits_data:
    exploit = ExploitData(
        tx_hash=data['tx_hash'],
        protocol=data['protocol'],
        chain=data['chain'],
        loss_amount_usd=data['amount_usd'] or 0,
        exploit_type=data.get('category') or 'Unknown',
        timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
        description=data.get('description', ''),
        source=data['source']
    )

    analysis = filter.analyze_exploit(exploit)

    if analysis['strategy'] == PostingStrategy.MAJOR_EVENT:
        major_posts.append((exploit, analysis))
    elif analysis['strategy'] == PostingStrategy.NICHE_TECHNICAL:
        niche_posts.append((exploit, analysis))
    else:
        skipped.append((exploit, analysis))

print(f"📊 Results:")
print(f"   🚨 Major Events (will go viral): {len(major_posts)}")
print(f"   🔍 Niche Technical (unique value): {len(niche_posts)}")
print(f"   ⏭️  Skipped (below threshold): {len(skipped)}")
print()

# Show major events
if major_posts:
    print('=' * 80)
    print('🚨 MAJOR EVENTS - POST TO TWITTER + REDDIT (r/CryptoCurrency)')
    print('=' * 80)
    print()

    for i, (exploit, analysis) in enumerate(major_posts[:5], 1):
        print(f'{i}. {exploit.protocol}')
        print(f'   Amount: {exploit.formatted_amount}')
        print(f'   Viral Score: {analysis["viral_score"]}/100')
        print(f'   Reasoning: {analysis["reasoning"]}')
        print(f'   Subreddits: {", ".join(analysis["subreddits"])}')
        print(f'   Hashtags: {" ".join(analysis["hashtags"][:3])}')
        print()

    # Show example tweet for best one
    if major_posts:
        best = major_posts[0]
        print('-' * 80)
        print(f'EXAMPLE TWEET: {best[0].protocol}')
        print('-' * 80)
        tweet = format_viral_post(best[0], best[1], 'twitter')
        print(tweet)
        print(f'\n({len(tweet)} characters)')
        print()

# Show niche opportunities
if niche_posts:
    print('=' * 80)
    print('🔍 NICHE OPPORTUNITIES - POST TO TECHNICAL SUBREDDITS')
    print('=' * 80)
    print()

    for i, (exploit, analysis) in enumerate(niche_posts[:3], 1):
        print(f'{i}. {exploit.protocol} on {exploit.chain}')
        print(f'   Amount: {exploit.formatted_amount}')
        print(f'   Why Post: {analysis["reasoning"]}')
        print(f'   Target: {", ".join(analysis["subreddits"])}')
        print()

print('=' * 80)
print('💡 STRATEGY SUMMARY')
print('=' * 80)
print()
print('✅ MAJOR EVENTS (Post immediately):')
print('   • $5M+ exploits')
print('   • Known protocols (Uniswap, Compound, Aave, etc.)')
print('   • Post to: r/CryptoCurrency (3.5M), r/DeFi, Twitter')
print('   • Goal: Maximum reach, viral potential')
print()
print('✅ NICHE TECHNICAL (Unique coverage):')
print('   • $500K+ on unusual chains (Cosmos, Near, Aptos)')
print('   • Interesting exploit types')
print('   • Post to: r/ethdev, chain-specific subs, Twitter')
print('   • Goal: Technical audience, differentiation')
print()
print('❌ SKIP:')
print('   • Small amounts (<$500K)')
print('   • Old news (>7 days)')
print('   • Common protocols with low loss')
print()
