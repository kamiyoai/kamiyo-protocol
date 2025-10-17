# Kamiyo Platform - Credential Setup Guide

**Quick guide to get your API keys and configure the platform**

---

## 📋 Quick Start Checklist

- [ ] `.env` file created (✅ Already done!)
- [ ] Basic setup (database, API)
- [ ] Social media credentials (optional)
- [ ] Payment system credentials (optional)
- [ ] Blockchain/Web3 credentials (optional)

---

## 🚀 Minimum Setup (Get Started Immediately)

The platform will run with **zero external credentials** needed!

```bash
# 1. File already created for you
ls .env  # ✅ Should exist

# 2. Start the API
python api/main.py

# 3. Test it works
curl http://localhost:8000/health
```

That's it! The basic platform is running with SQLite database.

---

## 🔐 Credential Setup (By Feature)

### Priority 1️⃣: Social Media Posting

If you want to **auto-post exploits to social media**, configure at least one platform:

#### Option A: Discord (Easiest - No API Application Needed!)

**Time: 2 minutes** ⏱️

1. **Open Discord** → Go to your server
2. **Server Settings** → Integrations → Webhooks
3. **Create Webhook** → Copy the URL
4. **Edit `.env`**:
   ```env
   DISCORD_SOCIAL_ENABLED=true
   DISCORD_SOCIAL_WEBHOOKS=my_channel=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
   ```
5. **Test it**:
   ```bash
   python social/poster.py
   ```

✅ **Done!** Discord is the fastest way to test social posting.

---

#### Option B: Telegram

**Time: 5 minutes** ⏱️

1. **Open Telegram** → Search for `@BotFather`
2. **Send**: `/newbot`
3. **Follow prompts** → Get your bot token
4. **Add bot to your channel** → Make it admin
5. **Get chat ID**:
   - For channels: Use `@yourchannel` directly
   - For groups: Add `@userinfobot` to get the ID

6. **Edit `.env`**:
   ```env
   TELEGRAM_SOCIAL_ENABLED=true
   TELEGRAM_SOCIAL_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_SOCIAL_CHATS=my_channel=@mychannel
   ```

7. **Test it**:
   ```bash
   python social/poster.py
   ```

---

#### Option C: Reddit

**Time: 10 minutes** ⏱️

1. **Create Reddit account** for your bot (e.g., `kamiyo_bot`)
2. **Go to**: https://www.reddit.com/prefs/apps
3. **Click**: "create another app"
4. **Fill in**:
   - Name: Kamiyo Bot
   - Type: **script**
   - Redirect URI: http://localhost:8000
5. **Copy** client ID (under app name) and secret
6. **Edit `.env`**:
   ```env
   REDDIT_ENABLED=true
   REDDIT_CLIENT_ID=abc123DEF456
   REDDIT_CLIENT_SECRET=xyz789-ABC123def456GHI789
   REDDIT_USERNAME=kamiyo_bot
   REDDIT_PASSWORD=your_bot_password
   REDDIT_SUBREDDITS=test  # Start with r/test!
   ```

7. **Test** (posts to r/test):
   ```bash
   python social/poster.py
   ```

⚠️ **Important**: Test in r/test first! Read subreddit rules before posting to real communities.

---

#### Option D: X/Twitter (Requires Developer Account)

**Time: 1-7 days** ⏱️ (approval process)

1. **Apply for Twitter Developer account**: https://developer.twitter.com/
2. **Wait for approval** (can take 1-7 days)
3. **Create app** in Developer Portal
4. **Generate keys** with "Read and Write" permissions
5. **Edit `.env`**:
   ```env
   X_TWITTER_ENABLED=true
   X_API_KEY=your_api_key
   X_API_SECRET=your_api_secret
   X_ACCESS_TOKEN=your_access_token
   X_ACCESS_SECRET=your_access_secret
   X_BEARER_TOKEN=your_bearer_token
   ```

6. **Test it**:
   ```bash
   python social/poster.py
   ```

⚠️ **Note**: Twitter requires developer approval. Start with Discord/Telegram while waiting.

---

### Priority 2️⃣: Blockchain/Web3 (For On-Chain Monitoring)

**Time: 5 minutes** ⏱️

#### Get Free Alchemy API Key

1. **Sign up**: https://www.alchemy.com/
2. **Create app** → Choose Ethereum Mainnet
3. **Copy API key**
4. **Edit `.env`**:
   ```env
   WEB3_PROVIDER_URI=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY_HERE
   ALCHEMY_API_KEY=YOUR_KEY_HERE
   ```

**Alternative**: Infura (https://infura.io/) - Same process

---

### Priority 3️⃣: Payment System (Stripe)

**Time: 10 minutes** ⏱️

1. **Sign up**: https://dashboard.stripe.com/register
2. **Go to**: Developers → API Keys
3. **Copy** both test keys (starts with `sk_test_` and `pk_test_`)
4. **Edit `.env`**:
   ```env
   STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY
   STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY
   ```

5. **Create webhook**:
   - Developers → Webhooks → Add endpoint
   - URL: `http://localhost:8000/api/v1/payments/webhook` (use ngrok for testing)
   - Events: Select all `customer.*`, `payment_intent.*`, `invoice.*`
   - Copy webhook secret

6. **Add webhook secret to `.env`**:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
   ```

7. **Test**:
   ```bash
   # Use Stripe test cards: https://stripe.com/docs/testing
   # 4242 4242 4242 4242 = Success
   ```

---

### Priority 4️⃣: Discord/Telegram Alert Bots (Days 25-26)

**Already configured above for posting!** Same credentials work for alerts.

Enable alerts in `.env`:
```env
ENABLE_DISCORD_ALERTS=true
ENABLE_TELEGRAM_ALERTS=true
```

---

### Priority 5️⃣: Monitoring & Error Tracking (Sentry)

**Time: 5 minutes** ⏱️

1. **Sign up**: https://sentry.io/
2. **Create project** → Choose Python
3. **Copy DSN** (looks like `https://abc123@sentry.io/123456`)
4. **Edit `.env`**:
   ```env
   SENTRY_DSN=https://YOUR_KEY@sentry.io/YOUR_PROJECT_ID
   SENTRY_ENVIRONMENT=development
   ```

---

## 📝 Complete Setup Order (Recommended)

### Phase 1: Get Running (5 minutes)
```bash
# Already done!
python api/main.py
```

### Phase 2: Social Posting (5 minutes)
1. Discord webhook (easiest)
2. Test with `python social/poster.py`

### Phase 3: Enhanced Features (15 minutes)
1. Telegram bot (for alerts + posting)
2. Alchemy API key (for on-chain data)

### Phase 4: Full Platform (30 minutes)
1. Stripe (for payments)
2. Reddit (for posting)
3. Sentry (for error tracking)

### Phase 5: Advanced (When needed)
1. Twitter (requires approval)
2. PostgreSQL (switch from SQLite)
3. Redis (caching)

---

## 🔑 Credential Quick Reference

### Free, No Approval Needed
- ✅ Discord webhooks (instant)
- ✅ Telegram bots (instant)
- ✅ Alchemy API (instant)
- ✅ Stripe test mode (instant)
- ✅ Sentry (instant)

### Free, Requires Approval
- ⏳ Twitter/X API (1-7 days)
- ⏳ Reddit API (instant, but read subreddit rules)

### Paid (Optional)
- 💰 Production Stripe (after testing)
- 💰 Higher rate limits on APIs

---

## ⚙️ Testing Your Setup

### Test Database
```bash
python
>>> from database import get_db
>>> db = get_db()
>>> print(db.get_total_exploits())
# Should return a number
```

### Test API
```bash
curl http://localhost:8000/health
# Should return: {"status": "healthy"}
```

### Test Social Posting
```bash
# Run test script
python social/poster.py

# Follow prompts, approve test post
# Check your Discord/Telegram for the message
```

### Test Kamiyo Watcher
```bash
# Dry run (doesn't actually post)
python social/kamiyo_watcher.py --dry-run

# Real run (posts to enabled platforms)
python social/kamiyo_watcher.py
```

---

## 🚨 Security Checklist

- [x] `.env` file created ✅
- [x] `.env` in `.gitignore` ✅
- [ ] Never commit `.env` to git
- [ ] Use strong passwords (32+ chars)
- [ ] Rotate API keys every 90 days
- [ ] Use test mode before production
- [ ] Review posted content before enabling auto-post

---

## 🐛 Troubleshooting

### "Module not found"
```bash
pip install -r requirements.txt
```

### "Authentication failed"
- Check credentials in `.env`
- Ensure no extra spaces
- Verify API key is active

### "Rate limit exceeded"
- Wait 1 hour
- Check platform rate limits
- Reduce posting frequency

### "Webhook invalid" (Discord)
- Verify webhook URL is complete
- Check webhook hasn't been deleted
- Test with curl:
  ```bash
  curl -X POST "YOUR_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d '{"content":"Test message"}'
  ```

---

## 📚 Resources

### API Documentation
- **Kamiyo API**: http://localhost:8000/docs (when running)
- **Stripe**: https://stripe.com/docs/api
- **Discord**: https://discord.com/developers/docs
- **Telegram**: https://core.telegram.org/bots/api
- **Reddit**: https://praw.readthedocs.io/
- **Twitter**: https://developer.twitter.com/en/docs

### Testing Resources
- **Stripe Test Cards**: https://stripe.com/docs/testing
- **ngrok** (for webhooks): https://ngrok.com/
- **Reddit r/test**: https://reddit.com/r/test

---

## 🎯 Next Steps

Once credentials are configured:

1. **Test social posting**:
   ```bash
   python social/poster.py
   ```

2. **Start the watcher**:
   ```bash
   python social/kamiyo_watcher.py
   ```

3. **Monitor logs**:
   ```bash
   tail -f social_poster.log
   ```

4. **Check posted content** on your social platforms

5. **Adjust filters** in `.env` if needed:
   ```env
   SOCIAL_MIN_AMOUNT_USD=50000  # Lower threshold
   SOCIAL_ENABLED_CHAINS=Ethereum  # Only Ethereum
   ```

---

## ✅ You're All Set!

The `.env` file is ready to be filled in. Start with:
1. Discord webhooks (easiest)
2. Test with `python social/poster.py`
3. Add more platforms as needed

**Questions?** Check `SOCIAL_MEDIA_POSTING_GUIDE.md` for detailed setup instructions.

---

**Last Updated**: 2025-10-08
**Kamiyo Platform Version**: 1.0.0
