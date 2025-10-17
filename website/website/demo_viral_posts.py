#!/usr/bin/env python3
"""
Demo: Show what viral posts would look like for real exploits
"""
import sys
sys.path.insert(0, '.')

from social.viral_strategy import ViralFilter, format_viral_post, PostingStrategy
from social.models import ExploitData
from datetime import datetime
import requests

filter = ViralFilter(max_age_hours=720)  # 30 days for demo

response = requests.get('https://api.kamiyo.ai/exploits?min_amount=3000000&page_size=5')
exploits_data = response.json()['data']

print('=' * 80)
print('🚨 HIGH-VALUE EXPLOITS READY FOR VIRAL POSTING')
print('=' * 80)
print()

postable = []

for data in exploits_data:
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

    analysis = filter.analyze_exploit(exploit)

    if analysis['strategy'] != PostingStrategy.SKIP:
        postable.append((exploit, analysis))

print(f'Found {len(postable)} exploits worth posting')
print()

for i, (exploit, analysis) in enumerate(postable, 1):
    print(f'{i}. ✅ {exploit.protocol}')
    print(f'   💰 ${exploit.loss_amount_usd:,.0f} on {exploit.chain}')
    print(f'   📊 Strategy: {analysis["strategy"].value.upper()}')
    print(f'   🎯 Viral Score: {analysis["viral_score"]}/100')
    print(f'   📱 Platforms: {", ".join(analysis["platforms"])}')
    print(f'   📌 Subreddits: {", ".join(analysis["subreddits"])}')
    print()

    if exploit.loss_amount_usd >= 10_000_000:
        print('   🐦 TWITTER POST:')
        print('   ' + '-' * 76)
        tweet = format_viral_post(exploit, analysis, 'twitter')
        for line in tweet.split('\n'):
            print(f'   {line}')
        print('   ' + '-' * 76)
        print(f'   ({len(tweet)} chars)')
        print()

print('=' * 80)
print('💡 DEPLOYMENT READY')
print('=' * 80)
print()
print('These exploits meet the criteria for viral posting:')
print('• Major events ($5M+) go to r/CryptoCurrency (3.5M members)')
print('• All go to Twitter with optimized hashtags')
print('• Posted with AI-generated analysis and insights')
print()
print('Next: Set up Twitter + Reddit API keys and deploy!')
print()
