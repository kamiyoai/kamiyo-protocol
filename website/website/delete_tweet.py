#!/usr/bin/env python3
"""
Delete the test tweet thread
"""
import os
import sys
from dotenv import load_dotenv
import tweepy

load_dotenv()

# Tweet IDs from the test thread
tweet_ids = [
    "1978222281009643552",
    "1978222282503442852",
    "1978222283522015632",
    "1978222284629680544",
    "1978222285510119714"
]

# Initialize Twitter API client
client = tweepy.Client(
    consumer_key=os.getenv('X_API_KEY'),
    consumer_secret=os.getenv('X_API_SECRET'),
    access_token=os.getenv('X_ACCESS_TOKEN'),
    access_token_secret=os.getenv('X_ACCESS_SECRET')
)

print("Deleting test tweet thread...")
for tweet_id in tweet_ids:
    try:
        client.delete_tweet(tweet_id)
        print(f"  ✓ Deleted tweet {tweet_id}")
    except Exception as e:
        print(f"  ✗ Failed to delete {tweet_id}: {e}")

print("\nDone!")
