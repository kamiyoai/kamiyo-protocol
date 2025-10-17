# Render Environment Variables Setup

## Current Issues to Fix

### ❌ Wrong Variable Names
You have:
```
X_API_KEY_SECRET  ← WRONG NAME
```

Should be:
```
X_API_SECRET      ← CORRECT NAME
```

**Action**: Rename `X_API_KEY_SECRET` to `X_API_SECRET` (same value)

### ❌ Unused Variables (Can Delete)
These aren't used by our code:
```
X_CLIENT_ID       ← Not used (delete)
X_CLIENT_SECRET   ← Not used (delete)
```

### ❌ Missing Variables
Still need from Twitter Developer Portal:
```
X_ACCESS_TOKEN    ← Get from Twitter
X_ACCESS_SECRET   ← Get from Twitter
X_TWITTER_ENABLED ← Set to "true"
```

---

## Complete Twitter/X Configuration

After fixes, you should have these 5 variables:

```bash
X_TWITTER_ENABLED=true
X_API_KEY=FTrK9PbdXiWEnFKafkMwwr9B5
X_API_SECRET=3zmsw9NPw8iJircJQQh7urdeh6oobyXsxUETrgAzIj45jzKbxy
X_ACCESS_TOKEN=[Get from Twitter Developer Portal]
X_ACCESS_SECRET=[Get from Twitter Developer Portal]
```

## How to Get Access Token (5 Minutes)

1. **Go to Twitter Developer Portal**
   - https://developer.twitter.com/en/portal/dashboard

2. **Select Your App**
   - Click on your app from the dashboard

3. **Navigate to Keys and Tokens**
   - Click "Keys and tokens" tab at the top

4. **Generate Access Token**
   - Scroll to "Authentication Tokens" section
   - Click "Generate" next to "Access Token and Secret"
   - **IMPORTANT**: Select "Read and Write" permissions
   - Copy both values immediately (shown only once!)

5. **Add to Render**
   - Add `X_ACCESS_TOKEN` with the Access Token value
   - Add `X_ACCESS_SECRET` with the Access Token Secret value

---

## Reddit Configuration (Optional)

To enable Reddit posting, add these variables:

```bash
REDDIT_ENABLED=true
REDDIT_CLIENT_ID=[Get from reddit.com/prefs/apps]
REDDIT_CLIENT_SECRET=[Get from reddit.com/prefs/apps]
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_SUBREDDITS=CryptoCurrency,defi,ethereum,ethdev
```

Your Reddit app details:
- App Name: KAMIYO-Exploit-Intelligence
- App ID: 29849674
- Get Client ID and Secret from: https://www.reddit.com/prefs/apps

---

## Discord Configuration (Already Working)

Your Discord bot is already configured:
```bash
DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=[Already set]
DISCORD_CHANNEL_ID=1335910966205878393
```

---

## Autonomous Growth Engine Variables

For the viral posting strategy to work optimally:

```bash
# Filtering thresholds
SOCIAL_MIN_AMOUNT_USD=500000        # $500K minimum for posting
POLL_INTERVAL_SECONDS=300           # Check every 5 minutes

# API endpoint
KAMIYO_API_URL=https://api.kamiyo.ai
```

---

## Full Checklist for Render

- [ ] Rename: `X_API_KEY_SECRET` → `X_API_SECRET`
- [ ] Delete: `X_CLIENT_ID`
- [ ] Delete: `X_CLIENT_SECRET`
- [ ] Add: `X_TWITTER_ENABLED=true`
- [ ] Add: `X_ACCESS_TOKEN` (get from Twitter)
- [ ] Add: `X_ACCESS_SECRET` (get from Twitter)
- [ ] Optional: Add Reddit credentials (5 more variables)
- [ ] Optional: Add filtering thresholds

---

## Testing After Setup

Once all variables are configured in Render:

1. **Redeploy the service** (Render will pick up new env vars)
2. **Check health endpoint**: https://api.kamiyo.ai/health
   - Should show Twitter as "enabled" with credentials "configured"
3. **Test with autonomous engine**:
   ```bash
   python3 social/autonomous_growth_engine.py --mode poll
   ```

---

## What Happens When Running

With proper configuration:
1. Engine polls API every 5 minutes for new exploits
2. Filters exploits using viral strategy:
   - Major events ($5M+) → Twitter + r/CryptoCurrency
   - Niche exploits ($500K+ on unique chains) → Twitter + r/ethdev
   - Everything else → Skip
3. Generates optimized posts with hashtags and formatting
4. Posts to all enabled platforms
5. Tracks metrics and logs results

---

## Troubleshooting

### "Unauthorized" on Twitter
- Check Access Token has "Read and Write" permissions
- Try regenerating Access Token and Secret

### "Forbidden" on Twitter
- App might be in suspended state
- Check if developer account needs approval

### "Missing credentials" error
- Verify all 5 Twitter variables are set in Render
- Check variable names match exactly (case-sensitive)

### Reddit karma requirements
- New accounts need 30+ days age + some karma
- Start with r/ethdev (lower requirements)
- Build karma by commenting before posting
