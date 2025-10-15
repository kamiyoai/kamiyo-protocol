# 🚀 Viral Posting Setup Guide

## What You Need to Post on X (Twitter) and Reddit

### Quick Summary

To enable viral posting to Twitter and Reddit, you need:

1. **Twitter/X Developer Account** (5-7 days approval)
2. **Reddit App Credentials** (30 minutes)
3. **Environment Variables** configured

---

## 🐦 Twitter/X Setup (Hardest - 5-7 Days)

### Step 1: Apply for Developer Access

1. Go to: https://developer.twitter.com/en/portal/petition/essential/basic-info
2. Select account: **Business** (not personal - required for API v2)
3. App name: "Kamiyo Exploit Alerts"
4. Use case: Select **"Exploring the API"** initially
5. Description (be detailed):
   ```
   Kamiyo is a security intelligence platform that monitors blockchain exploits
   across 54 networks. We post verified exploit alerts to inform the crypto
   community about security incidents. Our posts include:
   - Transaction hashes and on-chain evidence
   - Loss amounts and affected protocols
   - Technical analysis and security recommendations

   We aim to post 5-10 alerts per week about significant exploits ($1M+)
   to help users stay informed and protect their funds.
   ```

6. **Wait 1-7 days** for approval (usually 2-3 days)

### Step 2: Create App and Get Keys

Once approved:

1. Developer Portal → Projects & Apps → Create App
2. App name: "Kamiyo"
3. **Copy these keys** (you'll only see them once!):
   - API Key
   - API Secret Key
   - Bearer Token

### Step 3: Generate Access Tokens

1. App Settings → "Keys and tokens"
2. Under "Authentication Tokens" → Generate "Access Token and Secret"
3. Permissions: **Read and Write**
4. **Copy**:
   - Access Token
   - Access Token Secret

### Step 4: Set Environment Variables

```bash
export X_API_KEY="your_api_key_here"
export X_API_SECRET="your_api_secret_key_here"
export X_ACCESS_TOKEN="your_access_token_here"
export X_ACCESS_SECRET="your_access_token_secret_here"
export X_BEARER_TOKEN="your_bearer_token_here"
```

---

## 🔴 Reddit Setup (Easy - 30 Minutes)

### Step 1: Create Reddit App

1. Log into Reddit (use an account you control)
2. Go to: https://www.reddit.com/prefs/apps
3. Scroll down → Click **"create another app..."** or **"are you a developer? create an app..."**
4. Fill in:
   - **Name**: Kamiyo Bot
   - **Type**: Select **"script"**
   - **Description**: Security intelligence bot posting verified exploit alerts
   - **About URL**: https://kamiyo.ai
   - **Redirect URI**: http://localhost:8080 (required but not used)
5. Click **"Create app"**

### Step 2: Get Credentials

After creation, you'll see:

```
Kamiyo Bot
personal use script
[client_id shown here - 14 characters]

secret: [client_secret - ~27 characters]
```

**Copy these:**
- Client ID (under the app name)
- Client Secret (after "secret:")

### Step 3: Set Environment Variables

```bash
export REDDIT_CLIENT_ID="your_14_char_client_id"
export REDDIT_CLIENT_SECRET="your_27_char_secret"
export REDDIT_USERNAME="your_reddit_username"
export REDDIT_PASSWORD="your_reddit_password"
```

### Step 4: Important - Reddit Account Requirements

⚠️ **Your Reddit account needs**:
- Account age: 30+ days old
- Some karma (post/comment karma > 10)
- Verified email address

If your account is brand new, Reddit will block posts as spam!

**Recommended**: Create account now, let it age, post a few comments to build karma.

---

## 📋 Target Subreddits

### High-Traffic (Major Events Only - $5M+):

1. **r/CryptoCurrency** (3.5M members)
   - Requires: 500 comment karma + 60 day old account
   - Most viral potential
   - Post breaking news immediately

2. **r/defi** (200K members)
   - Lower karma requirement (~50)
   - Technical DeFi community
   - Good for major DeFi exploits

3. **r/ethereum** (1.5M members)
   - Ethereum-specific exploits
   - Engaged technical community

### Technical Subreddits (Niche Content):

4. **r/ethdev** (100K developers)
   - Technical analysis welcome
   - Lower karma requirements
   - Good for unique exploits

5. **Chain-specific**:
   - r/cosmosnetwork (Cosmos exploits)
   - r/solana (Solana exploits)
   - r/Avax (Avalanche exploits)

---

## 🎯 Posting Strategy Configured

### What Gets Posted Automatically:

#### **MAJOR EVENTS** (Post everywhere):
- ✅ Exploits $5M+
- ✅ Known protocols (Uniswap, Compound, Aave, etc.)
- ✅ Recent (within 48 hours)

**Where posted:**
- Twitter with trending hashtags
- r/CryptoCurrency (if karma requirements met)
- r/defi
- r/ethereum (for Ethereum exploits)

#### **NICHE TECHNICAL** (Unique value):
- ✅ $500K+ on unusual chains (Cosmos, Solana, etc.)
- ✅ Interesting exploit types (governance attacks, oracle manipulation)
- ✅ First-of-kind patterns

**Where posted:**
- Twitter with technical hashtags
- r/ethdev
- Chain-specific subreddits
- Technical communities

#### **SKIPPED** (Not worth posting):
- ❌ <$500K loss
- ❌ Old news (>48 hours)
- ❌ Common/repetitive exploits

---

## ⚡ Quick Start (For Testing)

### Option 1: Twitter Only (Fastest if Approved)

```bash
export KAMIYO_API_URL="https://api.kamiyo.ai"
export X_TWITTER_ENABLED="true"
export X_API_KEY="..."
export X_API_SECRET="..."
export X_ACCESS_TOKEN="..."
export X_ACCESS_SECRET="..."

python3 social/autonomous_growth_engine.py --mode poll
```

### Option 2: Reddit Only (No Approval Wait)

```bash
export KAMIYO_API_URL="https://api.kamiyo.ai"
export REDDIT_ENABLED="true"
export REDDIT_CLIENT_ID="..."
export REDDIT_CLIENT_SECRET="..."
export REDDIT_USERNAME="your_username"
export REDDIT_PASSWORD="your_password"
export REDDIT_SUBREDDITS="defi,ethdev"  # Start with lower-karma subs

python3 social/autonomous_growth_engine.py --mode poll
```

### Option 3: Both (Maximum Reach)

Combine all environment variables above.

---

## 🚨 Current Blockers

### For Immediate Launch:

**Twitter:**
- ⏳ Need to apply for developer account (5-7 days wait)
- **ACTION**: Apply TODAY at https://developer.twitter.com

**Reddit:**
- ✅ Can create app immediately (30 minutes)
- ⚠️ Account needs karma/age (may need to wait if new account)
- **ACTION**: Create app now, check karma requirements

---

## 💡 What to Do While Waiting for Twitter Approval

### 1. Set Up Reddit (Works Today)
- Create Reddit app (30 min)
- Test posting to r/ethdev (low karma requirements)
- Build up karma by commenting

### 2. Continue Discord Posting
- Already working with bot
- Build audience in your own community

### 3. Add Telegram
- Easier than Twitter
- No approval process
- Can post to your own channel immediately

---

## 🎯 Expected Results

Once configured:

### Major Exploit ($10M+):
- **Twitter**: 500-2K impressions
- **r/CryptoCurrency**: 50-200 upvotes
- **Traffic to kamiyo.ai**: 100-500 visitors

### Niche Exploit ($1M on Cosmos):
- **Twitter**: 100-500 impressions (tech audience)
- **r/cosmosnetwork**: 20-50 upvotes
- **Traffic**: 50-100 targeted visitors

### Frequency:
- **Major events**: 1-2 per week
- **Niche posts**: 3-5 per week
- **Total**: 4-7 high-quality posts/week

---

## 📊 Full Configuration

Once you have all credentials:

```bash
# API
export KAMIYO_API_URL="https://api.kamiyo.ai"

# Twitter/X
export X_TWITTER_ENABLED="true"
export X_API_KEY="..."
export X_API_SECRET="..."
export X_ACCESS_TOKEN="..."
export X_ACCESS_SECRET="..."
export X_BEARER_TOKEN="..."

# Reddit
export REDDIT_ENABLED="true"
export REDDIT_CLIENT_ID="..."
export REDDIT_CLIENT_SECRET="..."
export REDDIT_USERNAME="..."
export REDDIT_PASSWORD="..."
export REDDIT_SUBREDDITS="CryptoCurrency,defi,ethereum,ethdev"

# Filtering
export SOCIAL_MIN_AMOUNT_USD="500000"  # $500K minimum
export POLL_INTERVAL_SECONDS="300"  # Check every 5 minutes

# Run it
python3 social/autonomous_growth_engine.py --mode poll
```

---

## 🚀 Next Steps

1. **Apply for Twitter Developer** (TODAY - 5-7 day wait)
2. **Create Reddit App** (30 minutes - works immediately)
3. **Test with Reddit** while waiting for Twitter
4. **Deploy to Render** once both platforms configured
5. **Watch organic traffic grow** 📈

---

## Need Help?

- Twitter approval taking too long? Focus on Reddit first
- Reddit karma requirements? Start with r/ethdev (lower requirements)
- Want faster results? Add Telegram (no approval needed)

The smart filtering is already built - just need the API keys! 🎯
