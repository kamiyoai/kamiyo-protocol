# Kamiyo User Guide

Complete guide to using the Kamiyo Exploit Intelligence Platform.

**Version:** 2.0
**Last Updated:** October 2025
**Days 19-21: Testing Suite & Documentation**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Account Management](#account-management)
3. [Subscriptions & Pricing](#subscriptions--pricing)
4. [API Usage](#api-usage)
5. [Dashboard Features](#dashboard-features)
6. [Alerts & Notifications](#alerts--notifications)
7. [Understanding Exploits](#understanding-exploits)
8. [Troubleshooting](#troubleshooting)
9. [FAQ](#faq)

---

## Getting Started

### What is Kamiyo?

Kamiyo is an exploit intelligence aggregator that collects, organizes, and presents confirmed security exploits from across the blockchain ecosystem. We aggregate data from trusted sources like:

- Rekt News
- BlockSec
- PeckShield
- CertiK Alerts
- On-chain monitoring

**Important:** Kamiyo is an aggregator, not a security scanner. We report confirmed exploits that have already occurred, we do not scan or audit smart contracts.

### Creating Your Account

1. **Visit** [kamiyo.ai/signup](https://kamiyo.ai/signup)
2. **Enter** your email, username, and password
3. **Verify** your email (check spam folder)
4. **Complete** your profile setup
5. **Access** your dashboard

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*)

### First Steps After Signup

Once you've created your account:

1. ✅ Verify your email address
2. ✅ Complete your profile
3. ✅ Generate your first API key
4. ✅ Set up alerts for chains you care about
5. ✅ Explore the dashboard

---

## Account Management

### Profile Settings

Access your profile settings at `/dashboard/profile`

**Available Settings:**
- Personal information (name, company)
- Email preferences
- Password change
- Two-factor authentication (2FA)
- Account deletion

### Two-Factor Authentication (2FA)

Secure your account with 2FA:

1. Go to **Settings → Security**
2. Click **Enable 2FA**
3. Scan QR code with authenticator app (Google Authenticator, Authy)
4. Enter verification code
5. Save backup codes

**Supported Authenticator Apps:**
- Google Authenticator
- Authy
- Microsoft Authenticator
- 1Password

### Changing Your Password

1. Navigate to **Settings → Security**
2. Click **Change Password**
3. Enter current password
4. Enter new password (twice)
5. Click **Update Password**

You'll be logged out and need to sign in again.

### Email Preferences

Control what emails you receive:

- **Exploit Alerts:** New exploits matching your filters
- **Weekly Digest:** Summary of the week's exploits
- **Account Updates:** Security and billing notifications
- **Product Updates:** New features and improvements

---

## Subscriptions & Pricing

### Available Tiers

#### Free Tier - $0/month

Perfect for individual researchers and hobbyists.

**Includes:**
- 100 API requests/day
- 7-day exploit history
- Email alerts (daily digest)
- Community support

**Limitations:**
- Rate limited to 100 requests/day
- No real-time WebSocket access
- Limited filtering options

#### Pro Tier - $49/month

Ideal for developers and small teams.

**Includes:**
- 10,000 API requests/day
- 90-day exploit history
- Real-time WebSocket updates
- Custom alert filters
- Email & Discord notifications
- Priority support
- API key management (up to 5 keys)

**Best For:**
- DeFi protocols monitoring their sector
- Security researchers tracking trends
- Development teams building on-chain tools

#### Enterprise Tier - $299/month

For organizations requiring maximum capability.

**Includes:**
- Unlimited API requests
- Complete historical data
- Real-time WebSocket updates
- Advanced analytics
- Custom integrations
- Dedicated account manager
- SLA guarantee (99.9% uptime)
- White-label options

**Best For:**
- Security firms
- Large DeFi protocols
- Venture capital firms
- Blockchain analytics companies

### Upgrading Your Subscription

1. Go to **Dashboard → Subscription**
2. Click **Upgrade** on desired tier
3. Enter payment details (Stripe)
4. Confirm upgrade

**Billing Notes:**
- Prorated charges for mid-month upgrades
- Annual billing available (save 17%)
- Cancel anytime (no refunds for partial months)

### Downgrading or Canceling

1. Navigate to **Dashboard → Subscription**
2. Click **Manage Subscription**
3. Select **Cancel Subscription**
4. Confirm cancellation

**What Happens:**
- Access continues until end of billing period
- Automatically downgraded to Free tier
- No refunds for remaining time
- Data retained for 30 days

---

## API Usage

### Generating API Keys

1. Go to **Dashboard → API Keys**
2. Click **Generate New Key**
3. Name your key (e.g., "Production", "Development")
4. Copy the key immediately (won't be shown again)
5. Store securely

**Security Best Practices:**
- Never commit API keys to version control
- Use environment variables
- Rotate keys every 90 days
- Create separate keys for different environments

### Making API Requests

#### Authentication

Include your API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: your_api_key_here" \
  https://api.kamiyo.ai/v1/exploits
```

#### List All Exploits

```bash
GET /api/v1/exploits
```

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `limit` (int): Results per page (default: 20, max: 100)
- `chain` (string): Filter by blockchain
- `severity` (string): Filter by severity level
- `min_amount` (float): Minimum exploit amount (USD)
- `date_from` (string): Start date (ISO 8601)
- `date_to` (string): End date (ISO 8601)

**Example:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://api.kamiyo.ai/v1/exploits?chain=ethereum&severity=critical&limit=50"
```

**Response:**

```json
{
  "exploits": [
    {
      "id": "exploit_123",
      "protocol": "ExampleDEX",
      "chain": "ethereum",
      "amount_usd": 5000000,
      "severity": "critical",
      "description": "Flash loan attack exploiting reentrancy vulnerability",
      "tx_hash": "0xabc123...",
      "timestamp": "2025-10-07T14:30:00Z",
      "sources": ["rekt.news", "blocksec.com"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 234,
    "pages": 12
  }
}
```

#### Get Exploit Details

```bash
GET /api/v1/exploits/{exploit_id}
```

**Example:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  https://api.kamiyo.ai/v1/exploits/exploit_123
```

#### Search Exploits

```bash
GET /api/v1/exploits/search?q=uniswap
```

Full-text search across protocol names, descriptions, and related data.

### Rate Limits

Rate limits vary by tier:

| Tier | Daily Limit | Per Minute |
|------|-------------|------------|
| Free | 100 | 10 |
| Pro | 10,000 | 100 |
| Enterprise | Unlimited | 1000 |

**Rate Limit Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1696723200
```

**429 Response:**

```json
{
  "error": "Rate limit exceeded",
  "limit": 100,
  "reset": 1696723200
}
```

### Monitoring Usage

Check your API usage:

1. **Dashboard:** Real-time usage stats
2. **API Endpoint:** `GET /api/v1/usage`
3. **Email Alerts:** Daily usage reports

---

## Dashboard Features

### Overview Page

Your dashboard homepage shows:

- **Today's Exploits:** Latest confirmed exploits
- **Usage Stats:** API calls, remaining quota
- **Quick Actions:** Generate key, set alerts
- **Recent Activity:** Your account activity

### Exploit Browser

Filter and search exploits:

**Filters:**
- Blockchain (Ethereum, BSC, Polygon, etc.)
- Severity (Critical, High, Medium, Low)
- Date range
- Amount range
- Protocol type (DEX, Lending, Bridge, etc.)

**Sorting:**
- Date (newest/oldest)
- Amount (highest/lowest)
- Severity

### Analytics

View trends and statistics:

- Total exploits over time
- Exploits by chain
- Exploits by protocol type
- Top targeted protocols
- Cumulative losses

### Real-Time Feed (Pro/Enterprise)

Live exploit updates via WebSocket:

```javascript
const ws = new WebSocket('wss://api.kamiyo.ai/v1/stream');

ws.onmessage = (event) => {
  const exploit = JSON.parse(event.data);
  console.log('New exploit:', exploit);
};
```

---

## Alerts & Notifications

### Setting Up Alerts

1. Go to **Dashboard → Alerts**
2. Click **Create Alert**
3. Configure filters:
   - Chains to monitor
   - Minimum severity
   - Minimum amount
   - Protocol keywords
4. Choose delivery method:
   - Email
   - Discord webhook
   - Telegram bot
5. Save alert

### Alert Delivery Methods

#### Email Alerts

- Instant notifications for critical exploits
- Daily digest for lower severity
- Weekly summary

#### Discord Webhooks

1. Create webhook in Discord server
2. Copy webhook URL
3. Paste in Kamiyo alert settings
4. Test notification

**Example Discord Alert:**

```
🚨 New Critical Exploit Detected

Protocol: ExampleDEX
Chain: Ethereum
Amount: $5,000,000 USD
Severity: Critical

Description: Flash loan attack...
Transaction: 0xabc123...

View Details: https://kamiyo.ai/exploits/123
```

#### Telegram Notifications

1. Start chat with @KamiyoBot
2. Get your chat ID
3. Enter in alert settings
4. Receive instant updates

---

## Understanding Exploits

### Exploit Data Sources

We aggregate from verified sources only:

- **Rekt News:** Detailed exploit analyses
- **BlockSec:** Real-time monitoring alerts
- **PeckShield:** Security incident reports
- **CertiK:** Blockchain security alerts
- **On-chain:** Direct blockchain monitoring

### Severity Levels

**Critical:**
- Loss > $1M USD
- Actively exploited
- Widespread impact
- Immediate action required

**High:**
- Loss $100K - $1M
- Confirmed exploit
- Significant impact
- Action recommended

**Medium:**
- Loss $10K - $100K
- Verified incident
- Limited scope
- Monitoring advised

**Low:**
- Loss < $10K
- Minor incident
- Minimal impact
- Informational

### Verification Process

Every exploit is verified:

1. ✅ Transaction confirmed on blockchain
2. ✅ Reported by reputable source
3. ✅ Amount verified on-chain
4. ✅ Protocol confirmed
5. ✅ Description matches transaction data

---

## Troubleshooting

### Common Issues

#### "API Key Invalid"

**Cause:** Expired, revoked, or incorrect key

**Solution:**
1. Check key is copied correctly
2. Verify key is active in dashboard
3. Generate new key if needed

#### "Rate Limit Exceeded"

**Cause:** Exceeded daily/minute quota

**Solution:**
1. Wait for rate limit reset
2. Optimize API calls (caching)
3. Upgrade to higher tier

#### "No Exploits Found"

**Cause:** Filters too restrictive

**Solution:**
1. Broaden filter criteria
2. Check date range
3. Remove minimum amount filter

#### Email Not Received

**Cause:** Spam filter, wrong email

**Solution:**
1. Check spam/junk folder
2. Add noreply@kamiyo.ai to contacts
3. Verify email in account settings

---

## FAQ

### General Questions

**Q: What is Kamiyo?**

A: Kamiyo is an exploit intelligence aggregator. We collect confirmed security exploits from across the blockchain ecosystem and present them in an organized, searchable format.

**Q: Do you scan smart contracts?**

A: No. We aggregate reports of exploits that have already happened. For vulnerability detection, consult security firms like CertiK, Trail of Bits, or ConsenSys Diligence.

**Q: How fast are exploits reported?**

A: Typically within 5-15 minutes of being reported by our sources. Critical exploits are prioritized.

**Q: Can you predict exploits?**

A: No. We report historical data only. We do not predict, assess risk, or evaluate security.

### Account & Billing

**Q: Can I change my plan anytime?**

A: Yes. Upgrades are prorated. Downgrades take effect at end of billing period.

**Q: Do you offer refunds?**

A: No refunds for partial months. Cancel anytime to prevent future charges.

**Q: Is there a trial period?**

A: Yes! Pro tier includes a 14-day free trial. No credit card required to start.

**Q: What payment methods do you accept?**

A: All major credit cards via Stripe. Enterprise can pay via invoice.

### API Questions

**Q: How do I get more API requests?**

A: Upgrade to Pro (10,000/day) or Enterprise (unlimited).

**Q: Can I use multiple API keys?**

A: Yes. Pro allows up to 5 keys, Enterprise unlimited.

**Q: Is there a webhook option?**

A: Yes (Pro/Enterprise). Configure webhooks to receive push notifications of new exploits.

**Q: What's the API response time?**

A: Average 200-500ms. 99th percentile < 1 second.

### Data Questions

**Q: How far back does historical data go?**

A: Free (7 days), Pro (90 days), Enterprise (all data since 2020).

**Q: How accurate is the data?**

A: We only report verified exploits from reputable sources. All amounts are confirmed on-chain.

**Q: Can I export data?**

A: Yes (Pro/Enterprise). Export as JSON, CSV, or via API.

**Q: Do you provide analytics?**

A: Yes. All tiers include basic analytics. Enterprise includes advanced analytics and custom reports.

### Technical Questions

**Q: What's the API uptime?**

A: 99.9% uptime SLA for Enterprise. Historical uptime: 99.97%.

**Q: Is the API RESTful?**

A: Yes. Full REST API with JSON responses.

**Q: Do you support GraphQL?**

A: Not currently. REST API only.

**Q: Can I self-host Kamiyo?**

A: No. Kamiyo is a hosted service only.

---

## Support

### Contact Us

- **Email:** support@kamiyo.ai
- **Discord:** [discord.gg/kamiyo](https://discord.gg/kamiyo)
- **Twitter:** [@KamiyoHQ](https://twitter.com/KamiyoHQ)

### Response Times

- Free: 48-72 hours
- Pro: 24 hours
- Enterprise: 4 hours (SLA)

### Documentation

- **API Reference:** [kamiyo.ai/docs/api](https://kamiyo.ai/docs/api)
- **Developer Guide:** [kamiyo.ai/docs/developers](https://kamiyo.ai/docs/developers)
- **Blog:** [kamiyo.ai/blog](https://kamiyo.ai/blog)

---

**Last Updated:** October 7, 2025
**Version:** 2.0

© 2025 Kamiyo. All rights reserved.
