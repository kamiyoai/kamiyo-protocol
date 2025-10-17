# Twitter API Setup for Thread Posting and Following

## Current Issue

Your Twitter API credentials work for **posting exploit alerts** (the autonomous bot works), but fail with **401 Unauthorized** when trying to:
1. Post threads manually via scripts
2. Follow accounts via scripts

## Why This Happens

Twitter has two different authentication flows:
1. **OAuth 1.0a** (what's currently working for your bot)
2. **OAuth 2.0 with elevated access** (needed for broader API access)

Your current setup has **read-only** or **limited write** permissions.

## How to Fix

### Option 1: Update Twitter App Permissions (Recommended)

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Find your app (the one with the API keys in your .env)
3. Click on "Settings"
4. Under "User authentication settings", ensure you have:
   - **App permissions**: Read and Write (NOT Read-only)
   - **Type of App**: Web App, Automated App or Bot
5. Regenerate your **Access Token and Secret** after changing permissions
6. Update your .env file with the new tokens
7. Re-run the scripts

### Option 2: Apply for Elevated Access (If Needed)

If you're on the Free tier, you might be limited to:
- 50 tweets/day
- 50 follows/day

To get more:
1. Go to https://developer.twitter.com/en/portal/petition/essential/basic-info
2. Apply for **Elevated access**
3. Explain your use case: "Automated exploit intelligence alerts for blockchain security"
4. Usually approved within 24-48 hours
5. Once approved, you get:
   - 1,500 tweets/day
   - 400 follows/day
   - Full API v2 access

## Manual Workarounds (For Now)

Since the API scripts aren't working, you can:

### 1. Post the Killer Thread Manually

Use the content in `social/killer_thread_content.txt`:
- Copy tweet 1, post it
- Reply to tweet 1 with tweet 2
- Reply to tweet 2 with tweet 3
- Continue until all 10 tweets are posted
- Pin the first tweet to your profile

**Time**: ~5 minutes

### 2. Follow Accounts Manually

Use a bulk follow tool or browser extension:
- **Circleboom** (https://circleboom.com/twitter-management-tool/twitter-circle-tool)
- **Crowdfire** (https://www.crowdfireapp.com/)
- **Or manually**: Go to each account in `follow_security_accounts.py` and hit follow

**Time**: ~30-60 minutes for 90 accounts

## Scripts Ready for When API is Fixed

I've created these scripts that will work once permissions are updated:

1. **post_killer_thread_v2.py** - Posts the 10-tweet killer thread
2. **follow_security_accounts.py** - Follows 90+ security accounts
3. **social/killer_thread_content.txt** - The thread content for manual posting

## Testing Your Permissions

Run this to check your current access level:

```bash
python3 -c "
import os
from dotenv import load_dotenv
import tweepy

load_dotenv()

client = tweepy.Client(
    bearer_token=os.getenv('X_BEARER_TOKEN'),
    consumer_key=os.getenv('X_API_KEY'),
    consumer_secret=os.getenv('X_API_SECRET'),
    access_token=os.getenv('X_ACCESS_TOKEN'),
    access_token_secret=os.getenv('X_ACCESS_SECRET')
)

try:
    me = client.get_me()
    print(f'Authenticated as: @{me.data.username}')
    print('✓ API credentials work')
except Exception as e:
    print(f'✗ Auth failed: {e}')
"
```

## Why the Bot Works But Scripts Don't

Your autonomous bot (`social/platforms/x_twitter.py`) successfully posts because it's likely using OAuth 1.0a with the correct permissions for basic posting. But following users and some other actions require OAuth 2.0 with elevated access.

## Next Steps

1. **Immediate**: Post the killer thread manually using the content file
2. **Today**: Update your Twitter app permissions to "Read and Write"
3. **This week**: Apply for Elevated access if needed
4. **After permissions update**: Run the scripts to automate posting and following

Let me know once you update the permissions and I'll help test the scripts!
