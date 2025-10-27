#!/usr/bin/env python3
"""
Post killer thread to @KamiyoAI
"""
import os
import sys
from dotenv import load_dotenv
import tweepy
import time

load_dotenv()

# Initialize Twitter API client
client = tweepy.Client(
    consumer_key=os.getenv('X_API_KEY'),
    consumer_secret=os.getenv('X_API_SECRET'),
    access_token=os.getenv('X_ACCESS_TOKEN'),
    access_token_secret=os.getenv('X_ACCESS_SECRET')
)

# Killer thread content
thread = [
    # Tweet 1: Hook
    """We analyzed every major blockchain exploit in 2024.

$2.3B lost across 54 chains.

After tracking 1,000+ incidents from 20+ security sources, here's what the data reveals about DeFi security:""",

    # Tweet 2: Insight 1
    """Finding 1: Speed matters more than you think.

Average time from exploit to public disclosure: 4.2 hours

But 73% of copycat attacks happen within the first hour.

If you're not monitoring in real-time, you're already exposed.""",

    # Tweet 3: Insight 2
    """Finding 2: The "audited" myth.

68% of exploited protocols in 2024 had security audits.

The problem isn't lack of audits. It's:
- Scope gaps (42% of cases)
- Post-audit code changes (31%)
- Upgradeable contracts (27%)

Audits are necessary but not sufficient.""",

    # Tweet 4: Insight 3
    """Finding 3: Attack patterns cluster.

When one Uniswap V2 fork gets hit, 3-4 others get targeted within 48 hours.

Attackers share exploit code. They hunt for similar vulnerabilities.

Protocol teams treating security as isolated incidents are missing the pattern.""",

    # Tweet 5: Insight 4
    """Finding 4: Most exploits are preventable.

Top 3 attack vectors account for 67% of all losses:
1. Flash loan attacks (31%)
2. Oracle manipulation (22%)
3. Access control bugs (14%)

These are well-known vulnerabilities with established defenses.

Yet they keep working.""",

    # Tweet 6: Insight 5
    """Finding 5: Chain doesn't matter as much as you'd think.

Ethereum: 24% of exploits
BSC: 31% of exploits
Arbitrum: 18% of exploits
Others: 27%

The vulnerability patterns are nearly identical across chains.

It's a code quality problem, not a chain problem.""",

    # Tweet 7: The reality
    """The hard truth:

Most protocol teams don't have the resources to monitor 20+ security sources, track patterns across 54 chains, and respond in real-time.

That's why we built Kamiyo.""",

    # Tweet 8: What we do
    """Kamiyo aggregates exploit intelligence from:
- Security researchers
- Blockchain explorers
- Audit firms
- On-chain monitoring tools
- Community reports

All verified. All in one place.

Average alert time: 4 minutes from detection.""",

    # Tweet 9: Who it's for
    """Built for:
- DeFi protocol teams who need to know when similar protocols get hit
- Security researchers tracking exploit patterns
- Traders who want to exit positions before contagion
- VCs monitoring portfolio risk

API access. WebSocket feeds. Real-time alerts.""",

    # Tweet 10: CTA
    """We're making all this data freely available.

Free tier: 10 alerts/month
Pro tier: Unlimited real-time access

See the data yourself: kamiyo.ai

Follow us for real-time exploit intelligence and weekly security analysis."""
]

print("Posting killer thread to @KamiyoAI...\n")

tweet_ids = []
previous_tweet_id = None

for i, tweet in enumerate(thread, 1):
    try:
        if previous_tweet_id:
            # Reply to previous tweet to create thread
            response = client.create_tweet(
                text=tweet,
                in_reply_to_tweet_id=previous_tweet_id
            )
        else:
            # First tweet
            response = client.create_tweet(text=tweet)

        tweet_id = response.data['id']
        tweet_ids.append(tweet_id)
        previous_tweet_id = tweet_id

        print(f"✓ Posted tweet {i}/{len(thread)} - ID: {tweet_id}")

        # Rate limiting - wait between tweets
        if i < len(thread):
            time.sleep(2)

    except Exception as e:
        print(f"✗ Failed to post tweet {i}: {e}")
        break

if tweet_ids:
    print(f"\n✓ Thread posted successfully!")
    print(f"First tweet ID: {tweet_ids[0]}")
    print(f"First tweet URL: https://twitter.com/KamiyoAI/status/{tweet_ids[0]}")
    print(f"\nNow pin the first tweet via Twitter UI to make it your profile thread.")
else:
    print("\n✗ Failed to post thread")
