# Twitter API Access Application Guide

**Task:** TASK 2.1.2 - Apply for Twitter API Access
**Required For:** Phase 4 (Points System / Airdrop Hype)
**Lead Time:** 1-2 weeks approval
**Action Required:** Human must apply (cannot be automated)

---

## Why We Need Twitter API

The KAMIYO "Align-to-Earn" points system (Phase 4, Week 14) rewards users for X (Twitter) engagement:
- Following @KamiyoHQ: 50 points
- Retweeting announcements: 25 points
- Quality replies: 10 points/day
- X account verification (age, followers) for Sybil resistance

**Without Twitter API:** Cannot verify actions, points system manual only
**With Twitter API:** Automated verification, real-time points accrual

---

## Application Steps

### Step 1: Create Twitter Developer Account

1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Sign in with @KamiyoHQ Twitter account (or create project account)
3. Click "Sign up for Free Account"
4. Complete profile:
   - **Name:** KAMIYO Platform
   - **Country:** [Your country]
   - **Use case:** "Crypto/Web3 Community Platform"

### Step 2: Describe Use Case

Twitter requires detailed explanation of how you'll use the API.

**Recommended Answers:**

**Q: "In your words, please describe how you plan to use Twitter data and/or APIs."**

```
The KAMIYO platform is building a decentralized payment infrastructure for AI agents on Solana. We plan to use the Twitter API for two primary purposes:

1. **Community Engagement Verification:** Our "Align-to-Earn" airdrop campaign (launching Q1 2026) rewards users for genuine platform engagement. We will use the Twitter API to verify:
   - User has followed our official account (@KamiyoHQ)
   - User has retweeted our announcements
   - User's account meets minimum age/follower requirements (Sybil resistance)

2. **Account Verification for Anti-Fraud:** To prevent bot farming, we verify that Twitter accounts linked to our platform are authentic by checking:
   - Account creation date (must be >30 days old)
   - Follower count (>10 followers)
   - Profile completeness

We will NOT:
- Display tweets on external surfaces
- Perform sentiment analysis
- Aggregate tweet content
- Build third-party analytics tools

All data is used solely for eligibility verification within our platform. Users explicitly opt-in by connecting their Twitter account.
```

**Q: "Will your app use Tweet, Retweet, Like, Follow, or Direct Message functionality?"**

```
Yes. We will use the API to verify:
- Follow events (did user follow @KamiyoHQ?)
- Retweet events (did user retweet our specific tweets?)

We will NOT programmatically post, retweet, like, or send DMs on users' behalf. This is read-only verification.
```

**Q: "Do you plan to analyze Twitter data?"**

```
No. We only verify specific user actions (follows, retweets) for airdrop eligibility. No aggregate analysis, sentiment tracking, or data mining.
```

**Q: "Will your product, service, or analysis make Twitter content or derived information available to a government entity?"**

```
No.
```

### Step 3: Choose API Tier

**Recommended:** Start with **Free tier** (formerly Essential)

**Free Tier Limits:**
- 500,000 tweets/month read
- 1,500 tweets/month post (we won't use)
- 50 requests/15 minutes

**Our Estimated Usage:**
- Week 14-18 (points accrual): ~20,000 verification requests (checking follows/RTs)
- Avg 1,000 requests/day = ~70 requests/hour
- **Fits within free tier** ✅

If we exceed, upgrade to **Basic tier** ($100/month):
- 10,000 tweets/month read
- 3,000 requests/15 minutes

### Step 4: Create App

1. In Developer Portal, click "Create App"
2. **App Name:** `kamiyo-platform`
3. **App Description:**
   ```
   KAMIYO is a decentralized payment and alignment platform for AI agents on Solana. This app verifies Twitter engagement for our community airdrop campaign.
   ```
4. **Website URL:** `https://kamiyo.io` (or current website)
5. **Callback URL:** `https://api.kamiyo.io/auth/twitter/callback` (for OAuth)
6. **Terms of Service URL:** `https://kamiyo.io/terms`
7. **Privacy Policy URL:** `https://kamiyo.io/privacy`

### Step 5: Generate API Keys

After app creation:
1. Click "Keys and Tokens" tab
2. Generate:
   - **API Key** (Consumer Key)
   - **API Secret Key** (Consumer Secret)
   - **Bearer Token** (for read-only access)
3. **IMPORTANT:** Save these immediately (shown only once)

**Store in .env:**
```
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_BEARER_TOKEN=your_bearer_token_here
TWITTER_CLIENT_ID=your_client_id_here (for OAuth 2.0)
TWITTER_CLIENT_SECRET=your_client_secret_here (for OAuth 2.0)
```

### Step 6: Enable OAuth 2.0

1. Go to "User authentication settings"
2. Click "Set up"
3. **App permissions:** Read
4. **Type of App:** Web App
5. **Callback URI:** `https://api.kamiyo.io/auth/twitter/callback`
6. **Website URL:** `https://kamiyo.io`
7. Save

### Step 7: Test API Access

Run this quick test (requires Node.js):

```bash
npm install twitter-api-v2

# test.js
const { TwitterApi } = require('twitter-api-v2');

const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

async function test() {
  try {
    const user = await client.v2.userByUsername('KamiyoHQ');
    console.log('✅ Twitter API working!', user.data);
  } catch (error) {
    console.error('❌ API error:', error);
  }
}

test();
```

Expected output:
```
✅ Twitter API working! { id: '...', name: 'KAMIYO', username: 'KamiyoHQ', ... }
```

---

## Timeline

| Step | Duration | Notes |
|------|----------|-------|
| Application submission | 10 minutes | Fill out form |
| Approval wait | 1-2 weeks | Twitter reviews manually |
| App setup | 30 minutes | Generate keys, configure OAuth |
| Integration (Phase 4) | Week 14 | Build points verification |

**Start Now:** Apply immediately to ensure approval before Week 14 (points system launch).

---

## Common Issues & Solutions

### Issue 1: Application Rejected

**Reason:** "Insufficient use case details"

**Solution:** Reapply with more detailed explanation:
- Mention specific endpoints you'll use (v2/users/by/username, v2/users/:id/followers)
- Emphasize anti-fraud measures (Sybil resistance)
- Clarify no data aggregation/resale

### Issue 2: Rate Limits Hit

**Symptoms:** "429 Too Many Requests" errors

**Solutions:**
1. Implement caching (cache follow status for 24 hours)
2. Batch requests (check multiple users in one call where possible)
3. Upgrade to Basic tier ($100/month)

### Issue 3: OAuth Errors

**Symptoms:** "Invalid callback URL"

**Solution:**
- Ensure callback URL in app settings matches EXACTLY what your code uses
- Use HTTPS (not HTTP)
- Include https://localhost:3000/auth/twitter/callback for local testing

---

## Post-Approval Checklist

- [ ] API keys saved to .env (and backed up securely)
- [ ] Test script runs successfully
- [ ] OAuth flow tested (user can connect Twitter account)
- [ ] Rate limit monitoring set up (track usage in code)
- [ ] Error handling implemented (graceful degradation if API down)
- [ ] Documentation updated with API endpoints

---

## Security Best Practices

1. **Never commit API keys to git**
   - Add .env to .gitignore (already done)
   - Use environment variables in production

2. **Rotate keys if leaked**
   - Regenerate in Twitter Developer Portal
   - Update .env immediately

3. **Use read-only Bearer Token when possible**
   - Don't need OAuth for just checking follows/RTs
   - Save OAuth for user-initiated actions only

4. **Implement rate limit backoff**
   - If you hit limit, wait 15 minutes before retrying
   - Use exponential backoff: 1min, 2min, 4min, 8min

5. **Monitor for abuse**
   - Track API calls per user (prevent spamming verification)
   - Block suspicious IPs/wallets

---

## Integration Code Snippet (Phase 4)

This is what you'll build in Week 14:

```javascript
// api/social/x_integration.js
const { TwitterApi } = require('twitter-api-v2');

class TwitterVerificationService {
  constructor() {
    this.client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
  }

  async verifyUserFollowsKamiyo(twitterUsername) {
    try {
      // Get KAMIYO's Twitter ID
      const kamiyoUser = await this.client.v2.userByUsername('KamiyoHQ');
      const kamiyoId = kamiyoUser.data.id;

      // Get user's ID
      const user = await this.client.v2.userByUsername(twitterUsername);
      const userId = user.data.id;

      // Check if user follows KAMIYO
      const following = await this.client.v2.following(userId, { 'user.fields': 'id' });
      const isFollowing = following.data.some(f => f.id === kamiyoId);

      return {
        isFollowing,
        accountAge: this.calculateAccountAge(user.data.created_at),
        followerCount: user.data.public_metrics.followers_count
      };
    } catch (error) {
      console.error('Twitter verification error:', error);
      return { isFollowing: false, error: error.message };
    }
  }

  async verifyRetweet(tweetId, twitterUsername) {
    const user = await this.client.v2.userByUsername(twitterUsername);
    const userId = user.data.id;

    const retweeters = await this.client.v2.tweetRetweetedBy(tweetId);
    return retweeters.data.some(rt => rt.id === userId);
  }

  calculateAccountAge(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    return ageInDays;
  }
}

module.exports = TwitterVerificationService;
```

---

## Action Required

**YOU (Human) must:**
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Apply for API access (use text above)
3. Wait 1-2 weeks for approval
4. Generate API keys
5. Add keys to .env file
6. Run test script to verify

**Estimated Time:** 15 minutes (application) + 1-2 weeks (waiting)

---

**Status:** Waiting for human to complete application.

**Report back:** Once approved, add API keys to .env and mark task complete.

---

END OF TWITTER API APPLICATION GUIDE
