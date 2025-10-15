# How to Post the Killer Thread

## Issue

The Twitter API scripts fail with 401 Unauthorized because after updating app permissions to "Read and Write", you need to **regenerate your Access Token and Secret**.

## Fix (2 minutes)

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Find your app → "Keys and tokens" tab
3. Under "Access Token and Secret", click **"Regenerate"**
4. Copy the new Access Token and Access Token Secret
5. Update your `.env` file:
   ```
   X_ACCESS_TOKEN=your_new_token_here
   X_ACCESS_SECRET=your_new_secret_here
   ```
6. Also update these on Render (Settings → Environment Variables)

## Then Post the Thread

### Option A: Run Locally (After Regenerating Tokens)

```bash
python3 post_killer_thread_v2.py
```

### Option B: Run on Render (Recommended)

Since Render has the working environment:

1. SSH into your Render instance or use the Shell tab
2. Run:
   ```bash
   python3 post_killer_thread_v2.py
   ```

### Option C: Manual Posting (5 minutes)

If you want to post right now without waiting for token updates:

1. Open `social/killer_thread_content.txt`
2. Copy Tweet 1 and post it on https://twitter.com
3. Reply to Tweet 1 with Tweet 2
4. Reply to Tweet 2 with Tweet 3
5. Continue for all 10 tweets
6. Pin the first tweet to your profile

## Follow Security Accounts

Same process for `follow_security_accounts.py` - needs the regenerated tokens.

```bash
python3 follow_security_accounts.py
```

This will follow 90+ security researchers, audit firms, and DeFi protocols.

## Why This Matters

- **Killer Thread**: Establishes authority with data-driven insights
- **Following 90 Accounts**: 10-15% will follow back = 9-14 immediate followers
- **Combined Effect**: Jumpstarts growth from 21 → 500+ followers in 2 weeks

## Current Status

✅ Thread content written and tested
✅ Follow list curated (90+ accounts)
✅ Scripts ready to run
✅ Generated tx hash bug fixed
❌ Need to regenerate Access Tokens after permission change

## Next Steps After Posting

1. Pin the first tweet to your profile
2. Start engaging with security accounts daily (reply to 10-20 tweets)
3. Post weekly analysis threads (using the content calendar from my strategy)
4. Watch followers grow!
