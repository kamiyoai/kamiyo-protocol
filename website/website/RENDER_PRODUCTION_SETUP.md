# Render Production Setup Guide - Autonomous Growth Engine

**Complete checklist for deploying the social media autonomous growth engine to Render**

---

## Prerequisites Checklist

Before deploying to Render, you need to obtain API credentials from each social media platform you want to use.

### ⚠️ CRITICAL: Kamiyo API (REQUIRED)

**Status**: ❓ Need to verify if this exists

The autonomous engine depends on your Kamiyo platform's API:

```env
KAMIYO_API_URL=https://api.kamiyo.ai
KAMIYO_API_KEY=your_api_key_here
KAMIYO_WEBSOCKET_URL=wss://api.kamiyo.ai/ws
```

**Questions to answer:**
1. ✅ Does your Kamiyo platform have an API endpoint?
   - If YES: What's the URL? (e.g., `https://api.kamiyo.ai`)
   - If NO: Need to create `/api/exploits` endpoint that returns exploit data

2. ✅ Does it have a WebSocket for real-time updates?
   - If YES: What's the WSS URL?
   - If NO: Use polling mode only (set `WATCHER_MODE=poll`)

3. ✅ Does it require authentication?
   - If YES: Generate API key
   - If NO: Leave `KAMIYO_API_KEY` empty

**Expected API Response Format:**
```json
{
  "data": [
    {
      "tx_hash": "0x123...",
      "protocol": "Protocol Name",
      "chain": "Ethereum",
      "loss_amount_usd": 1000000,
      "exploit_type": "Flash Loan",
      "timestamp": "2025-10-04T14:30:00Z",
      "description": "Description of exploit",
      "source": "Rekt News",
      "source_url": "https://..."
    }
  ]
}
```

---

## Social Media Platform Setup

### Option 1: Discord (⭐ EASIEST - Start Here)

**Time to Setup**: 5 minutes
**Cost**: Free
**Difficulty**: ⭐ Very Easy

**Steps:**

1. **Create a Discord Server** (or use existing)
   - Go to https://discord.com
   - Create a new server or use existing

2. **Create a Channel for Exploit Alerts**
   - Create channel: `#exploit-alerts` or similar

3. **Create Webhook**
   - Click channel settings (gear icon)
   - Go to "Integrations" → "Webhooks"
   - Click "New Webhook"
   - Name it: "Kamiyo Exploit Alerts"
   - Copy the Webhook URL (looks like: `https://discord.com/api/webhooks/123456789/ABCDEF...`)

4. **Add to Render Environment Variables:**
   ```env
   DISCORD_SOCIAL_ENABLED=true
   DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
   ```

**Multiple Channels** (optional):
```env
DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/ID1/TOKEN1,news=https://discord.com/api/webhooks/ID2/TOKEN2
```

---

### Option 2: Telegram (⭐⭐ EASY)

**Time to Setup**: 10 minutes
**Cost**: Free
**Difficulty**: ⭐⭐ Easy

**Steps:**

1. **Create a Bot**
   - Open Telegram and search for `@BotFather`
   - Send `/newbot`
   - Choose a name: "Kamiyo Exploit Alerts"
   - Choose a username: `kamiyo_alerts_bot` (must end in `_bot`)
   - **Copy the bot token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Create a Channel**
   - Create a new channel: "Kamiyo Exploit Alerts"
   - Make it public or private (your choice)
   - Add your bot as an administrator

3. **Get Channel ID**
   - Forward a message from your channel to `@userinfobot`
   - It will reply with the channel ID (looks like: `-1001234567890`)
   - OR use `@getidsbot` - add it to your channel and it will show the ID

4. **Add to Render Environment Variables:**
   ```env
   TELEGRAM_SOCIAL_ENABLED=true
   TELEGRAM_SOCIAL_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_SOCIAL_CHATS=alerts=-1001234567890
   ```

**Multiple Channels** (optional):
```env
TELEGRAM_SOCIAL_CHATS=alerts=-1001234567890,news=-1009876543210
```

---

### Option 3: Reddit (⭐⭐⭐ MODERATE)

**Time to Setup**: 30 minutes (includes waiting for approval)
**Cost**: Free
**Difficulty**: ⭐⭐⭐ Moderate
**Note**: Best for organic reach, but requires more setup

**Steps:**

1. **Create a Reddit Account for the Bot**
   - Go to https://reddit.com
   - Create new account: `kamiyo_alerts_bot` (or similar)
   - **Use a real email** and verify it
   - Build some karma first (comment on a few posts) - helps avoid being flagged as spam

2. **Create a Reddit App**
   - Go to https://www.reddit.com/prefs/apps
   - Scroll to bottom, click "Create App" or "Create Another App"
   - Fill in:
     - **Name**: Kamiyo Exploit Alerts
     - **App type**: Select "script"
     - **Description**: Automated DeFi exploit alerts from Kamiyo Intelligence Platform
     - **About URL**: https://kamiyo.ai
     - **Redirect URI**: http://localhost:8000 (required but not used)
   - Click "Create app"

3. **Get Credentials**
   - **Client ID**: String under "personal use script" (looks like: `abcd1234efgh5678`)
   - **Client Secret**: Next to "secret" (looks like: `ABCD1234-efgh5678ijkl9012mnop`)

4. **Choose Subreddits**
   - Start with: `r/test` (for testing)
   - Production: `r/defi`, `r/CryptoCurrency`, `r/ethereum`
   - **Important**: Read each subreddit's rules about bots before posting

5. **Add to Render Environment Variables:**
   ```env
   REDDIT_ENABLED=true
   REDDIT_CLIENT_ID=abcd1234efgh5678
   REDDIT_CLIENT_SECRET=ABCD1234-efgh5678ijkl9012mnop
   REDDIT_USERNAME=kamiyo_alerts_bot
   REDDIT_PASSWORD=your_bot_account_password
   REDDIT_SUBREDDITS=test,defi,CryptoCurrency
   ```

**Reddit Rate Limits**: 10 posts/hour (configurable)

---

### Option 4: Twitter/X (⭐⭐⭐⭐⭐ DIFFICULT)

**Time to Setup**: 1-7 days (Twitter approval process)
**Cost**: Free tier limited, $100/month for full API
**Difficulty**: ⭐⭐⭐⭐⭐ Very Difficult
**Status**: Twitter API access is currently very restricted

**Current State (October 2025):**
- Twitter Developer Platform has been moved to "X Developer Platform"
- Free tier is very limited (1,500 tweets/month read, 50 tweets/month write)
- Basic tier ($100/month) gives reasonable access
- Application approval can take 1-7 days

**Steps:**

1. **Apply for Developer Account**
   - Go to https://developer.twitter.com/
   - Click "Sign up" or "Apply"
   - Use your organization's Twitter account (create `@KamiyoAI` if needed)
   - Fill out application form:
     - **Purpose**: "Automated security alerts for DeFi community"
     - **Use case**: "Post timely exploit alerts to inform crypto community"
     - Be detailed and professional
   - Wait for approval (1-7 days typically)

2. **Create an App**
   - Once approved, go to Developer Portal
   - Create new Project → Create new App
   - Name: "Kamiyo Exploit Alerts"

3. **Get API Credentials**
   - Go to your app settings
   - Navigate to "Keys and tokens"
   - Generate:
     - **API Key** (Consumer Key)
     - **API Secret** (Consumer Secret)
     - **Access Token**
     - **Access Token Secret**
     - **Bearer Token**
   - **Save all of these immediately** - you can't view secrets again

4. **Set Permissions**
   - App permissions → "Read and Write"
   - Enable 3-legged OAuth if needed

5. **Add to Render Environment Variables:**
   ```env
   X_TWITTER_ENABLED=true
   X_API_KEY=your_api_key
   X_API_SECRET=your_api_secret
   X_ACCESS_TOKEN=your_access_token
   X_ACCESS_SECRET=your_access_token_secret
   X_BEARER_TOKEN=your_bearer_token
   ```

**Alternative**: If Twitter API is too difficult, skip it and use Discord/Telegram instead.

---

## Render Deployment Setup

### Step 1: Create Render Web Service

1. **Go to Render Dashboard**
   - Visit https://render.com
   - Sign in / Sign up

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository (kamiyo)
   - Or use "Deploy from GitHub"

3. **Configure Service**
   - **Name**: `kamiyo-social-engine`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: Leave blank (or specify if in subdirectory)
   - **Runtime**: `Docker` (use the Dockerfile we created)
   - **Build Command**: (leave blank if using Docker)
   - **Start Command**:
     ```bash
     python3 social/autonomous_growth_engine.py --mode poll
     ```

4. **Instance Type**
   - Start with: **Free** or **Starter ($7/month)**
   - Starter recommended for production (512MB RAM, always on)

### Step 2: Configure Environment Variables in Render

Go to your service → "Environment" tab → "Add Environment Variable"

**Required Variables:**

```env
# Core (REQUIRED)
KAMIYO_API_URL=https://api.kamiyo.ai
KAMIYO_API_KEY=your_actual_api_key
KAMIYO_WEBSOCKET_URL=wss://api.kamiyo.ai/ws

# Mode
WATCHER_MODE=poll
POLL_INTERVAL_SECONDS=60

# Filters
SOCIAL_MIN_AMOUNT_USD=100000
SOCIAL_ENABLED_CHAINS=Ethereum,BSC,Polygon,Arbitrum

# Enable at least ONE platform (Discord recommended to start)
DISCORD_SOCIAL_ENABLED=true
DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/YOUR_ACTUAL_WEBHOOK

# Optional: Other platforms
TELEGRAM_SOCIAL_ENABLED=false
REDDIT_ENABLED=false
X_TWITTER_ENABLED=false

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# Health Check
HEALTH_CHECK_PORT=8000

# Auto-posting (set to true for fully autonomous)
AUTO_POST_ENABLED=true
```

**Copy from .env.example and fill in real values**

### Step 3: Health Check Configuration

In Render service settings:

- **Health Check Path**: `/health`
- **Health Check Interval**: 30 seconds

This uses the health check endpoint we created at `social/health.py`

### Step 4: Deploy

1. Click "Create Web Service" or "Manual Deploy"
2. Watch build logs
3. Wait for "Your service is live"
4. Check health: `https://kamiyo-social-engine.onrender.com/health`

---

## Testing Your Deployment

### 1. Test Health Check

```bash
curl https://kamiyo-social-engine.onrender.com/health | jq '.'
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-14T...",
  "kamiyo_api": "connected",
  "platforms": {
    "discord": "authenticated",
    "reddit": "not_enabled"
  }
}
```

### 2. Check Logs

In Render dashboard:
- Go to "Logs" tab
- Look for:
  ```
  🚀 Autonomous Growth Engine ACTIVE in poll mode
  📊 Monitoring new exploits for automatic analysis and posting...
  ```

### 3. Test with Discord Webhook (Manual)

```bash
curl -X POST "YOUR_DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🧪 Test message from Kamiyo - webhook working!"
  }'
```

You should see the message appear in your Discord channel.

### 4. Simulate an Exploit

If you have access to your Kamiyo database, insert a test exploit:

```sql
INSERT INTO exploits (tx_hash, protocol, chain, loss_amount_usd, exploit_type, timestamp, description, source)
VALUES (
  '0xTEST123',
  'TestProtocol',
  'Ethereum',
  500000,
  'Flash Loan',
  NOW(),
  'This is a test exploit for testing the autonomous growth engine',
  'Manual Test'
);
```

Within 60 seconds (polling interval), you should see:
1. Log message: "New exploit detected: TestProtocol"
2. Discord message with formatted exploit alert

---

## Minimal Production Configuration (Start Here)

**If you're unsure, start with this minimal setup:**

### Platform: Discord Only (Easiest)

1. ✅ Create Discord webhook (5 minutes)
2. ✅ Deploy to Render with these variables:

```env
# Core
KAMIYO_API_URL=https://your-actual-api-url.com
KAMIYO_API_KEY=your_actual_key_or_leave_empty
WATCHER_MODE=poll
POLL_INTERVAL_SECONDS=60

# Discord only
DISCORD_SOCIAL_ENABLED=true
DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/YOUR_ACTUAL_WEBHOOK

# Disable others
TELEGRAM_SOCIAL_ENABLED=false
REDDIT_ENABLED=false
X_TWITTER_ENABLED=false

# Auto-post (no human review)
AUTO_POST_ENABLED=true

# Filters
SOCIAL_MIN_AMOUNT_USD=100000
```

3. ✅ Deploy and watch logs
4. ✅ Test by adding a test exploit to your database

**Once Discord is working, add other platforms one at a time.**

---

## Common Issues & Solutions

### Issue 1: "Kamiyo API not accessible"

**Symptom**: Health check shows `"kamiyo_api": "error"`

**Solutions**:
- Verify `KAMIYO_API_URL` is correct
- Check if your API requires authentication
- Test manually: `curl https://api.kamiyo.ai/exploits`
- If API doesn't exist yet, you need to create it first

### Issue 2: "Module not found" errors

**Solution**: Ensure `requirements.txt` includes all dependencies:
```bash
cd ~/project/Projekter/kamiyo
pip freeze > requirements.txt
```

### Issue 3: Discord webhook fails

**Symptom**: `"discord": "authentication_failed"`

**Solutions**:
- Verify webhook URL is complete and correct
- Test webhook manually (see Testing section)
- Check webhook wasn't deleted in Discord
- Verify format: `https://discord.com/api/webhooks/ID/TOKEN`

### Issue 4: No exploits detected

**Solutions**:
- Check `SOCIAL_MIN_AMOUNT_USD` isn't too high (start with `10000` for testing)
- Verify `SOCIAL_ENABLED_CHAINS` includes chains you have exploits on
- Check Kamiyo API actually has exploits in database
- Review logs for filtering messages

### Issue 5: Posts not appearing

**Solutions**:
- Check `AUTO_POST_ENABLED=true` (otherwise needs manual approval)
- Verify platform credentials are correct
- Check rate limits aren't exceeded
- Review error logs for specific failures

---

## Cost Breakdown

### Render Costs

- **Free Tier**: $0/month (sleeps after inactivity, 750 hours/month)
- **Starter**: $7/month (always on, 512MB RAM) ⭐ Recommended
- **Standard**: $25/month (2GB RAM, only if needed)

### Social Media API Costs

- **Discord**: Free ✅
- **Telegram**: Free ✅
- **Reddit**: Free ✅
- **Twitter/X**: Free tier very limited, $100/month for Basic ⚠️

### Total Minimum Cost

- **$7/month** (Render Starter + Discord only)
- **$0/month** if using Render free tier (but may sleep)

---

## Security Best Practices

1. ✅ **Never commit credentials**
   - Use Render's environment variables
   - Keep `.env.production` in `.gitignore`

2. ✅ **Use dedicated bot accounts**
   - Don't use your personal accounts
   - Clearly identify as bots

3. ✅ **Rotate credentials regularly**
   - Every 90 days minimum
   - Immediately if compromised

4. ✅ **Monitor for abuse**
   - Check logs daily
   - Set up alerts for failures
   - Watch for spam reports

5. ✅ **Rate limiting**
   - Keep default limits initially
   - Only increase after monitoring

---

## Recommended Rollout Plan

### Week 1: Testing Phase

- ✅ Deploy to Render with Discord only
- ✅ Set `SOCIAL_MIN_AMOUNT_USD=10000` (low threshold for testing)
- ✅ Monitor logs daily
- ✅ Verify posts appear correctly
- ✅ Check for any errors

### Week 2: Production Mode

- ✅ Increase threshold to `SOCIAL_MIN_AMOUNT_USD=100000`
- ✅ Add Telegram if desired
- ✅ Monitor engagement
- ✅ Adjust posting frequency if needed

### Week 3: Expand Platforms

- ✅ Add Reddit (test in r/test first)
- ✅ Monitor for spam reports
- ✅ Adjust content if needed

### Week 4+: Optimize

- ✅ Add Twitter/X if approved
- ✅ A/B test content variations
- ✅ Analyze which platforms drive most traffic
- ✅ Optimize posting strategy

---

## Quick Reference

### Deploy Command (Render Start Command)
```bash
python3 social/autonomous_growth_engine.py --mode poll
```

### Test Health Check
```bash
curl https://YOUR-SERVICE.onrender.com/health
```

### View Logs (Render Dashboard)
```
Dashboard → Your Service → Logs tab
```

### Emergency Stop
```
Render Dashboard → Your Service → Settings → Delete Service
```

### Restart Service
```
Render Dashboard → Your Service → Manual Deploy
```

---

## What's Actually Missing (Action Items)

### ⚠️ CRITICAL - Need to Verify/Create:

1. **Kamiyo API Endpoint**
   - [ ] Does `/api/exploits` exist?
   - [ ] Does it return exploit data?
   - [ ] What authentication is required?
   - [ ] Is WebSocket available?

   **If NO**: You need to create an API endpoint in your existing Kamiyo platform that returns exploit data. The autonomous engine expects this to exist.

### ✅ Platform Credentials (Choose at least 1):

2. **Discord** (⭐ Start here - 5 minutes)
   - [ ] Create Discord server/channel
   - [ ] Generate webhook URL

3. **Telegram** (Optional - 10 minutes)
   - [ ] Create bot with @BotFather
   - [ ] Get bot token
   - [ ] Create channel and get channel ID

4. **Reddit** (Optional - 30 minutes)
   - [ ] Create bot account
   - [ ] Create Reddit app
   - [ ] Get client ID and secret

5. **Twitter/X** (Optional - 1-7 days)
   - [ ] Apply for developer account
   - [ ] Wait for approval
   - [ ] Create app and get credentials

### ✅ Render Setup:

6. **Render Account**
   - [ ] Create Render account
   - [ ] Connect GitHub repository
   - [ ] Create web service
   - [ ] Add environment variables
   - [ ] Deploy

---

## Next Steps

1. **RIGHT NOW**: Check if your Kamiyo API exists
   ```bash
   curl https://api.kamiyo.ai/exploits
   # OR whatever your API URL is
   ```

2. **If API exists**: Proceed with Discord setup (5 minutes)

3. **If API doesn't exist**: Need to create it first, then come back to this setup

4. **Once you have 1 platform working**: Deploy to Render and test

---

**Document Version**: 1.0
**Last Updated**: October 14, 2025
**Contact**: See repository maintainers

**Ready to deploy? Start with Discord + Render - you can be live in 15 minutes! 🚀**
