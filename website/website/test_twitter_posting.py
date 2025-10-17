#!/usr/bin/env python3
"""
Test Twitter/X Posting with Your App
Tests authentication and posts a test tweet
"""
import os
import sys
sys.path.insert(0, '.')

import tweepy
from social.viral_strategy import ViralFilter, format_viral_post
from social.models import ExploitData
from datetime import datetime
import requests

print("=" * 80)
print("🐦 TESTING TWITTER/X POSTING")
print("=" * 80)
print()

# Check credentials
api_key = os.getenv('X_API_KEY')
api_secret = os.getenv('X_API_SECRET')
access_token = os.getenv('X_ACCESS_TOKEN')
access_secret = os.getenv('X_ACCESS_SECRET')

if not all([api_key, api_secret, access_token, access_secret]):
    print("❌ Missing Twitter credentials!")
    print()
    print("Required environment variables:")
    print("  X_API_KEY - Your API Key")
    print("  X_API_SECRET - Your API Key Secret")
    print("  X_ACCESS_TOKEN - Your Access Token")
    print("  X_ACCESS_SECRET - Your Access Token Secret")
    print()
    print("To get Access Token and Secret:")
    print("  1. Go to https://developer.twitter.com/en/portal/dashboard")
    print("  2. Select your app")
    print("  3. Go to 'Keys and tokens' tab")
    print("  4. Under 'Authentication Tokens' → Generate 'Access Token and Secret'")
    print("  5. Make sure permissions are set to 'Read and Write'")
    print()
    print("Current status:")
    print(f"  API Key: {'✅' if api_key else '❌'}")
    print(f"  API Secret: {'✅' if api_secret else '❌'}")
    print(f"  Access Token: {'✅' if access_token else '❌'}")
    print(f"  Access Secret: {'✅' if access_secret else '❌'}")
    print()
    sys.exit(1)

print(f"✅ All credentials found")
print(f"   API Key: {api_key[:10]}...")
print()

# Initialize Twitter client
print("📡 Connecting to Twitter API v2...")
try:
    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_secret
    )

    # Test authentication by getting user info
    me = client.get_me()
    print(f"✅ Authenticated as @{me.data.username}")
    print(f"   User ID: {me.data.id}")
    print()

except tweepy.errors.Unauthorized as e:
    print(f"❌ Authentication failed: {e}")
    print()
    print("Troubleshooting:")
    print("  • Verify all 4 credentials are correct")
    print("  • Check your app has 'Read and Write' permissions")
    print("  • Try regenerating your Access Token and Secret")
    print("  • Make sure your developer account is approved")
    sys.exit(1)

except Exception as e:
    print(f"❌ Connection failed: {e}")
    print()
    print("Check your internet connection and Twitter API status")
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

# Generate viral tweet
filter = ViralFilter(max_age_hours=720)  # Allow older posts for demo
analysis = filter.analyze_exploit(exploit)
tweet = format_viral_post(exploit, analysis, 'twitter')

print("-" * 80)
print("TWEET PREVIEW:")
print("-" * 80)
print(tweet)
print("-" * 80)
print(f"({len(tweet)} characters)")
print()

# Ask to post
print("🤔 Test Options:")
print()
print("1. DRY RUN - Just show what would be posted (safe)")
print("2. POST TWEET - Actually post to your Twitter account")
print()

choice = input("Enter choice (1-2, or press Enter for dry run): ").strip() or "1"

if choice == "1":
    print()
    print("✅ Dry run complete - no tweet posted")
    print("   Set choice to 2 to actually post")

elif choice == "2":
    print()
    print("📤 Posting tweet...")
    try:
        response = client.create_tweet(text=tweet)
        tweet_id = response.data['id']
        username = me.data.username

        print(f"✅ Tweet posted successfully!")
        print(f"   URL: https://twitter.com/{username}/status/{tweet_id}")
        print()
        print("🎯 Check your Twitter profile to verify!")

    except tweepy.errors.Forbidden as e:
        print(f"❌ Permission denied: {e}")
        print()
        print("Your app needs 'Read and Write' permissions:")
        print("  1. Go to your app settings")
        print("  2. User authentication settings → Edit")
        print("  3. App permissions → Select 'Read and Write'")
        print("  4. Save and regenerate your Access Token")

    except tweepy.errors.TooManyRequests as e:
        print(f"❌ Rate limit exceeded: {e}")
        print()
        print("Twitter limits how often you can post:")
        print("  • Wait 15-30 minutes before trying again")
        print("  • Check your recent tweets - you may have posted this already")

    except Exception as e:
        print(f"❌ Failed to post: {e}")
        print()
        print("Common issues:")
        print("  • Duplicate tweet (try changing the content)")
        print("  • App permissions (needs Read and Write)")
        print("  • Account restrictions (check if your account is limited)")

print()
print("=" * 80)
print("💡 NEXT STEPS")
print("=" * 80)
print()

if choice == "1":
    print("When ready to enable autonomous posting:")
    print()

print("Add these to your environment:")
print()
print("  export X_TWITTER_ENABLED=true")
print(f"  export X_API_KEY='{api_key}'")
print(f"  export X_API_SECRET='***'")
print(f"  export X_ACCESS_TOKEN='{access_token if access_token else 'YOUR_ACCESS_TOKEN'}'")
print(f"  export X_ACCESS_SECRET='***'")
print()
print("Then run the autonomous engine:")
print()
print("  python3 social/autonomous_growth_engine.py --mode poll")
print()
