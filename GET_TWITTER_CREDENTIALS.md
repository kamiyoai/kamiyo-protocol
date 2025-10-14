# Getting Twitter/X Credentials

You've already provided:
- ✅ API Key: `FTrK9PbdXiWEnFKafkMwwr9B5`
- ✅ API Key Secret: `3zmsw9NPw8iJircJQQh7urdeh6oobyXsxUETrgAzIj45jzKbxy`

## What You Still Need

To post tweets, you need **2 more credentials**:
- ❌ Access Token
- ❌ Access Token Secret

## How to Get Them (5 Minutes)

### Step 1: Go to Developer Portal
1. Visit: https://developer.twitter.com/en/portal/dashboard
2. Log in with your Twitter account
3. Select your app from the dashboard

### Step 2: Generate Access Token
1. Click on **"Keys and tokens"** tab
2. Scroll down to **"Authentication Tokens"** section
3. You'll see:
   - "Access Token and Secret"
   - Click **"Generate"** button
4. **IMPORTANT**: Set permissions to **"Read and Write"** (not just "Read")

### Step 3: Copy Both Tokens
You'll see two new values:
```
Access Token: [50-60 characters, starts with numbers]
Access Token Secret: [45-50 characters]
```

⚠️ **Save these immediately** - Twitter only shows them once!

### Step 4: Test Your Setup

Once you have all 4 credentials, test them:

```bash
export X_API_KEY="FTrK9PbdXiWEnFKafkMwwr9B5"
export X_API_SECRET="3zmsw9NPw8iJircJQQh7urdeh6oobyXsxUETrgAzIj45jzKbxy"
export X_ACCESS_TOKEN="YOUR_ACCESS_TOKEN_HERE"
export X_ACCESS_SECRET="YOUR_ACCESS_TOKEN_SECRET_HERE"

python3 test_twitter_posting.py
```

## Common Issues

### "Unauthorized" Error
- Check that your app has **"Read and Write"** permissions
- Try regenerating your Access Token after changing permissions

### "Forbidden" Error
- Your app might be in "Read Only" mode
- Go to app settings → User authentication → Change to "Read and Write"

### "App Suspended" Error
- Your developer account might not be approved yet
- Check your email for approval status
- This can take 1-7 days

## While You Wait

If your developer account isn't approved yet, you can:
1. **Set up Reddit posting** (works immediately, no approval needed)
2. **Test Discord posting** (already working)
3. **Prepare environment variables** for when Twitter is ready

See `VIRAL_POSTING_SETUP.md` for Reddit setup (only takes 30 minutes).

## Quick Reddit Setup (No Wait)

Reddit is faster to set up and requires no approval:

1. Go to: https://www.reddit.com/prefs/apps
2. Find your app: "KAMIYO-Exploit-Intelligence"
3. Copy:
   - Client ID (14 chars, under app name)
   - Client Secret (27 chars, after "secret:")
4. Test with:
   ```bash
   export REDDIT_CLIENT_ID="your_client_id"
   export REDDIT_CLIENT_SECRET="your_client_secret"
   export REDDIT_USERNAME="your_reddit_username"
   export REDDIT_PASSWORD="your_reddit_password"

   python3 test_reddit_posting.py
   ```

Reddit posts can start working **today** while you wait for Twitter approval!
