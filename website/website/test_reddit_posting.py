#!/usr/bin/env python3
"""
Test Reddit Posting with Your App
App: KAMIYO-Exploit-Intelligence (ID: 29849674)
"""
import os
import sys
sys.path.insert(0, '.')

import praw
from social.viral_strategy import ViralFilter, format_viral_post
from social.models import ExploitData
from datetime import datetime
import requests

print("=" * 80)
print("🔴 TESTING REDDIT POSTING")
print("=" * 80)
print()

# Check credentials
client_id = os.getenv('REDDIT_CLIENT_ID')
client_secret = os.getenv('REDDIT_CLIENT_SECRET')
username = os.getenv('REDDIT_USERNAME')
password = os.getenv('REDDIT_PASSWORD')

if not all([client_id, client_secret, username, password]):
    print("❌ Missing Reddit credentials!")
    print()
    print("Required environment variables:")
    print("  REDDIT_CLIENT_ID - Get from https://www.reddit.com/prefs/apps")
    print("  REDDIT_CLIENT_SECRET - Get from https://www.reddit.com/prefs/apps")
    print("  REDDIT_USERNAME - Your Reddit username")
    print("  REDDIT_PASSWORD - Your Reddit password")
    print()
    print("Your app details:")
    print("  App Name: KAMIYO-Exploit-Intelligence")
    print("  App ID: 29849674")
    print()
    print("To get credentials:")
    print("  1. Go to https://www.reddit.com/prefs/apps")
    print("  2. Find 'KAMIYO-Exploit-Intelligence'")
    print("  3. Client ID is under the app name (14 characters)")
    print("  4. Secret is after 'secret:' (27 characters)")
    print()
    sys.exit(1)

print(f"✅ Credentials found")
print(f"   Client ID: {client_id[:6]}...{client_id[-4:]}")
print(f"   Username: u/{username}")
print()

# Initialize Reddit
print("📡 Connecting to Reddit API...")
try:
    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        username=username,
        password=password,
        user_agent=f"Kamiyo Exploit Intelligence Bot 1.0 by u/{username}"
    )

    # Test authentication
    print(f"✅ Authenticated as u/{reddit.user.me().name}")
    print(f"   Account karma: {reddit.user.me().link_karma + reddit.user.me().comment_karma}")
    print(f"   Account age: ~{reddit.user.me().created_utc}")
    print()

except Exception as e:
    print(f"❌ Authentication failed: {e}")
    print()
    print("Troubleshooting:")
    print("  • Check your Reddit username/password are correct")
    print("  • Verify client_id and client_secret from app settings")
    print("  • Make sure 2FA is disabled (or use app password)")
    sys.exit(1)

# Fetch a high-value exploit
print("📊 Fetching exploit for posting...")
response = requests.get('https://api.kamiyo.ai/exploits?min_amount=3000000&page_size=1')
data = response.json()['data'][0]

exploit = ExploitData(
    tx_hash=data['tx_hash'],
    protocol=data['protocol'],
    chain=data['chain'],
    loss_amount_usd=data['amount_usd'],
    exploit_type=data.get('category', 'Unknown'),
    timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
    description=data.get('description', 'Investigation ongoing'),
    source=data['source']
)

print(f"✅ Selected: {exploit.protocol} (${exploit.loss_amount_usd:,.0f})")
print()

# Generate viral post
filter = ViralFilter(max_age_hours=720)  # Allow older posts for demo
analysis = filter.analyze_exploit(exploit)
reddit_post = format_viral_post(exploit, analysis, 'reddit')

print("-" * 80)
print("REDDIT POST PREVIEW:")
print("-" * 80)
print(f"Title: {reddit_post['title']}")
print()
print(reddit_post['body'][:500] + "...")
print("-" * 80)
print()

# Ask to post
print("🤔 Test Options:")
print()
print("1. DRY RUN - Just show what would be posted (safe)")
print("2. POST TO r/test - Post to test subreddit (safe, anyone can post)")
print("3. POST TO r/ethdev - Post to real developer subreddit (requires karma)")
print()

choice = input("Enter choice (1-3, or press Enter for dry run): ").strip() or "1"

if choice == "1":
    print()
    print("✅ Dry run complete - no post made")
    print("   Set choice to 2 or 3 to actually post")

elif choice == "2":
    print()
    print("📤 Posting to r/test...")
    try:
        submission = reddit.subreddit('test').submit(
            title=reddit_post['title'][:300],
            selftext=reddit_post['body']
        )
        print(f"✅ Posted successfully!")
        print(f"   URL: https://reddit.com{submission.permalink}")
        print()
        print("🎯 Check the post to verify formatting")

    except Exception as e:
        print(f"❌ Failed to post: {e}")
        print()
        print("Common issues:")
        print("  • New account (needs age + karma)")
        print("  • Posting too frequently (rate limit)")
        print("  • Account not verified (check email)")

elif choice == "3":
    print()
    print("📤 Posting to r/ethdev...")
    try:
        submission = reddit.subreddit('ethdev').submit(
            title=reddit_post['title'][:300],
            selftext=reddit_post['body']
        )
        print(f"✅ Posted successfully!")
        print(f"   URL: https://reddit.com{submission.permalink}")
        print()
        print("🎯 Real post made to developer subreddit!")

    except Exception as e:
        print(f"❌ Failed to post: {e}")
        print()
        print("This usually means:")
        print("  • Need more karma (try r/test first)")
        print("  • Account too new (needs 30+ days)")
        print("  • Already posted recently (wait 10 minutes)")

print()
print("=" * 80)
print("💡 NEXT STEPS")
print("=" * 80)
print()

if choice == "1":
    print("When ready for real posts:")
    print("  1. Build karma by commenting on posts")
    print("  2. Test with r/test (no karma needed)")
    print("  3. Post to r/ethdev (lower requirements)")
    print("  4. Eventually post to r/CryptoCurrency (needs 500 karma)")
    print()

print("To enable in autonomous engine:")
print()
print("  export REDDIT_ENABLED=true")
print(f"  export REDDIT_CLIENT_ID='{client_id}'")
print(f"  export REDDIT_CLIENT_SECRET='***'")
print(f"  export REDDIT_USERNAME='{username}'")
print("  export REDDIT_PASSWORD='***'")
print("  export REDDIT_SUBREDDITS='ethdev,test'")
print()
print("  python3 social/autonomous_growth_engine.py --mode poll")
print()
