#!/usr/bin/env python3
"""
Test Twitter API credentials
"""
import os
import sys
import tweepy

# Your credentials
api_key = "yLMgwzIvRFVIVIE8uHQW9krGY"
api_secret = "BshZR06jVbjNoM7ee2BO6OXapxiSIY50FPd1yeCjYoUHsm4TYI"
access_token = "1873344001232998400-SRdiw6UM3nWKrMm1sk4tGq96hfNMxN"
access_secret = "Sd9Vjuyy4oQlAeYbq5HNhGwg91abohZ3X66ld8WGoxWRv"

print("Testing Twitter API credentials...")
print(f"API Key: {api_key[:10]}...")
print(f"Access Token: {access_token[:20]}...")

try:
    # Test with API v2
    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_secret
    )

    # Get current user
    me = client.get_me()
    print(f"\n✅ Authentication successful!")
    print(f"Authenticated as: @{me.data.username}")
    print(f"User ID: {me.data.id}")
    print(f"Name: {me.data.name}")

except Exception as e:
    print(f"\n❌ Authentication failed: {e}")
    sys.exit(1)

# Test posting (dry run)
print("\n" + "="*60)
print("Testing tweet posting capability...")
print("="*60)

test_tweet = "🔍 Test tweet from Kamiyo bot - delete if you see this!"

try:
    response = client.create_tweet(text=test_tweet)
    tweet_id = response.data['id']
    print(f"✅ Successfully posted test tweet!")
    print(f"Tweet ID: {tweet_id}")
    print(f"URL: https://twitter.com/i/web/status/{tweet_id}")
    print(f"\n⚠️  Please delete this test tweet manually")

except Exception as e:
    print(f"❌ Failed to post tweet: {e}")
    sys.exit(1)
