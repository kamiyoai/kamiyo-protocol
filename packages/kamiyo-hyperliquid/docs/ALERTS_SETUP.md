# Alert System Setup Guide

Complete guide for configuring multi-channel security alerts for Hyperliquid monitoring.

## Table of Contents

1. [Overview](#overview)
2. [Supported Channels](#supported-channels)
3. [Telegram Setup](#telegram-setup)
4. [Discord Setup](#discord-setup)
5. [Slack Setup](#slack-setup)
6. [Custom Webhook](#custom-webhook)
7. [Email Setup](#email-setup)
8. [Configuration](#configuration)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Hyperliquid Security Monitor includes a comprehensive alert system that can send notifications to multiple channels when security events are detected.

**Key Features:**
- ✅ 5 notification channels (Telegram, Discord, Slack, Webhook, Email)
- ✅ Severity-based filtering
- ✅ Rich formatted messages with metadata
- ✅ Automatic delivery with error handling
- ✅ Zero configuration required (all channels are optional)

---

## Supported Channels

| Channel | Use Case | Setup Difficulty | Recommended For |
|---------|----------|------------------|-----------------|
| **Telegram** | Personal/team notifications | ⭐ Easy | Individual users |
| **Discord** | Team channels | ⭐ Easy | Teams & communities |
| **Slack** | Enterprise teams | ⭐⭐ Medium | Companies |
| **Webhook** | Custom integrations | ⭐⭐ Medium | Developers |
| **Email** | Critical alerts only | ⭐⭐⭐ Complex | Enterprise |

---

## Telegram Setup

**Time:** 2 minutes

### Step 1: Create Bot

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the bot token (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### Step 2: Get Chat ID

**Option A: Personal Chat**
1. Send a message to your bot (any message)
2. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id":123456789}` in the JSON
4. Copy the `id` value

**Option B: Group Chat**
1. Add your bot to a Telegram group
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find the group chat ID (will be negative, like `-987654321`)

### Step 3: Configure

Add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=123456789
```

### Example Alert

```
🚨 HLP Vault Anomaly Detected (Score: 75.5/100)

Hyperliquid HLP vault showing anomalous behavior. PnL (24h): $-2,500,000

📊 Details:
• Anomaly Score: 75.5/100
• Account Value: $577,000,000
• PnL (24h): $-2,500,000
• Health Issues: Large loss detected
• Action: Review vault activity

Timestamp: 2025-11-03 14:23:45 UTC
```

---

## Discord Setup

**Time:** 1 minute

### Step 1: Create Webhook

1. Open your Discord server
2. Go to **Server Settings** > **Integrations** > **Webhooks**
3. Click **New Webhook**
4. Name it (e.g., "Hyperliquid Monitor")
5. Select the channel for alerts
6. Click **Copy Webhook URL**

### Step 2: Configure

Add to `.env`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890/abc-def-ghi...
```

### Example Alert

Discord alerts appear as rich embeds with:
- **Color coding** (blue=info, yellow=warning, red=error, dark red=critical)
- **Emojis** for quick visual identification
- **Metadata fields** for details
- **Timestamps** (automatic)
- **Bot avatar** (Hyperliquid Monitor)

---

## Slack Setup

**Time:** 3 minutes

### Step 1: Create Incoming Webhook

1. Go to https://api.slack.com/apps
2. Click **Create New App** > **From scratch**
3. Name your app (e.g., "Hyperliquid Monitor")
4. Select your workspace
5. Go to **Incoming Webhooks**
6. Click **Activate Incoming Webhooks**
7. Click **Add New Webhook to Workspace**
8. Select channel for alerts
9. Click **Allow**
10. Copy the webhook URL

### Step 2: Configure

Add to `.env`:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX
```

### Example Alert

Slack alerts use:
- **Header blocks** with severity icons
- **Markdown formatting** for readability
- **Field sections** for metadata
- **Automatic threading** (if configured)

---

## Custom Webhook

**Time:** Varies (depends on your endpoint)

### Your Webhook Requirements

Your endpoint should accept `POST` requests with JSON:

```json
{
  "title": "Alert Title",
  "message": "Alert message text",
  "level": "critical",
  "timestamp": "2025-11-03T14:23:45.123456",
  "metadata": {
    "key1": "value1",
    "key2": "value2"
  },
  "source": "hyperliquid-monitor"
}
```

### Configure

Add to `.env`:

```bash
WEBHOOK_URL=https://your-server.com/api/alerts
```

### Example Implementation

**Python (Flask):**
```python
from flask import Flask, request

app = Flask(__name__)

@app.route('/api/alerts', methods=['POST'])
def receive_alert():
    data = request.json
    print(f"Alert: {data['title']} - {data['level']}")
    # Process alert...
    return {'status': 'received'}, 200
```

**Node.js (Express):**
```javascript
app.post('/api/alerts', (req, res) => {
  const { title, level, message, metadata } = req.body;
  console.log(`Alert: ${title} - ${level}`);
  // Process alert...
  res.json({ status: 'received' });
});
```

---

## Email Setup

**Time:** 5-10 minutes

Email alerts are sent **ONLY for CRITICAL alerts** to avoid spam.

### Step 1: Get SendGrid API Key

1. Sign up at https://sendgrid.com (free tier available)
2. Go to **Settings** > **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "Hyperliquid Alerts")
5. Select **Restricted Access**
6. Enable **Mail Send** permission
7. Click **Create & View**
8. Copy the API key

### Step 2: Configure

Add to `.env`:

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxx
ADMIN_EMAIL=your.email@example.com
FROM_EMAIL=alerts@kamiyo.ai
```

### Step 3: Verify Sender (Optional but Recommended)

1. Go to SendGrid **Settings** > **Sender Authentication**
2. Verify your email address
3. This improves delivery rates

---

## Configuration

### Environment Variables

```bash
# Alert System
ALERTS_ENABLED=true                    # Enable/disable all alerts
ALERT_MIN_SEVERITY=high                # Minimum severity to send

# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Discord
DISCORD_WEBHOOK_URL=your_webhook_url

# Slack
SLACK_WEBHOOK_URL=your_webhook_url

# Custom Webhook
WEBHOOK_URL=your_api_endpoint

# Email (critical only)
SENDGRID_API_KEY=your_key
ADMIN_EMAIL=your_email
FROM_EMAIL=alerts@kamiyo.ai
```

### Severity Levels

| Level | When to Use | Example Events |
|-------|-------------|----------------|
| `info` | Status updates | Deployment success, system startup |
| `warning` | Attention needed | Oracle deviation 0.5-1%, moderate anomalies |
| `error` | Issues detected | Cascade liquidations, losses $1-2M |
| `critical` | Immediate action | HLP exploitation, flash loans, losses >$2M |

**Recommended Settings:**

```bash
# Production
ALERT_MIN_SEVERITY=high        # Only error & critical

# Staging
ALERT_MIN_SEVERITY=warning     # Warning, error & critical

# Development
ALERT_MIN_SEVERITY=info        # All alerts
```

---

## Testing

### Test All Channels

```bash
# Run test script
docker-compose exec api python alerts/alert_manager.py

# Or manually
docker-compose exec api python << EOF
from alerts import get_alert_manager, AlertLevel

mgr = get_alert_manager()

mgr.send_alert(
    title="Test Alert",
    message="This is a test of the alert system",
    level=AlertLevel.INFO,
    metadata={"test": "value"}
)
EOF
```

### Test Specific Alert Types

```bash
docker-compose exec api python << EOF
from alerts import get_alert_manager

mgr = get_alert_manager()

# Test HLP vault anomaly
mgr.alert_hlp_vault_anomaly(
    anomaly_score=75,
    account_value=577000000,
    pnl_24h=-2500000,
    health_issues=["Test alert"]
)

# Test oracle deviation
mgr.alert_oracle_deviation(
    asset="BTC",
    deviation_pct=1.25,
    hl_price=43250,
    reference_price=42700,
    duration=45
)
EOF
```

### Check Logs

```bash
# View alert delivery logs
docker-compose logs -f api | grep "alert sent"

# Expected output:
# INFO - Discord alert sent: Test Alert
# INFO - Telegram alert sent: Test Alert
# INFO - Slack alert sent: Test Alert
```

---

## Troubleshooting

### Telegram Not Working

**Problem:** No messages received

**Solutions:**
1. Verify bot token is correct
2. Make sure you messaged the bot first
3. Check chat ID is correct (use `/getUpdates`)
4. Ensure bot is not blocked
5. For groups: Make sure bot is admin or has send permission

**Test:**
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"
# Should return bot info if token is valid
```

### Discord Not Working

**Problem:** "Invalid Webhook" error

**Solutions:**
1. Regenerate webhook URL in Discord
2. Make sure URL includes full path (not just /webhook/)
3. Check webhook wasn't deleted in Discord
4. Verify channel still exists

**Test:**
```bash
curl -X POST <YOUR_WEBHOOK_URL> \
  -H "Content-Type: application/json" \
  -d '{"content":"Test from curl"}'
```

### Slack Not Working

**Problem:** 404 or 403 errors

**Solutions:**
1. Verify webhook URL is complete
2. Check app is still installed in workspace
3. Regenerate webhook if needed
4. Ensure channel still exists

### Email Not Working

**Problem:** Emails not delivered

**Solutions:**
1. Verify SendGrid API key is active
2. Check sender email is verified in SendGrid
3. Check spam/junk folder
4. Verify ADMIN_EMAIL is correct
5. Check SendGrid quota (free tier limits)

### Alerts Not Triggering

**Problem:** No alerts despite events

**Solutions:**
1. Check `ALERTS_ENABLED=true`
2. Verify `ALERT_MIN_SEVERITY` setting
3. Ensure events meet severity threshold
4. Check logs for errors: `docker-compose logs api | grep alert`

---

## Alert Types Reference

### 1. HLP Vault Anomaly

**Triggers when:**
- Anomaly score ≥ 30

**Severity:**
- Score 70-100: CRITICAL
- Score 50-69: ERROR
- Score 30-49: WARNING

**Contains:**
- Anomaly score
- Account value
- PnL (24h)
- Health issues
- Recommended action

### 2. Oracle Deviation

**Triggers when:**
- Price deviation ≥ 0.5%

**Severity:**
- Deviation ≥ 1.0%: CRITICAL
- Deviation 0.5-0.99%: WARNING

**Contains:**
- Asset name
- Deviation percentage
- Hyperliquid price
- Reference price (Binance/Coinbase)
- Deviation duration

### 3. Flash Loan Attack

**Triggers when:**
- Pattern detected by liquidation analyzer
- Duration < 10 seconds
- Value > $500k

**Severity:** CRITICAL

**Contains:**
- Total USD liquidated
- Attack duration
- Number of liquidations
- Assets involved
- Recommended action

### 4. Cascade Liquidation

**Triggers when:**
- 5+ liquidations in 5 minutes
- Suspicion score ≥ 50

**Severity:** ERROR

**Contains:**
- Total USD liquidated
- Liquidation count
- Duration
- Price impact per asset
- Pattern type

### 5. Large Loss

**Triggers when:**
- Loss ≥ $1M detected

**Severity:**
- Loss ≥ $2M: CRITICAL
- Loss $1-2M: ERROR

**Contains:**
- Loss amount
- Source (monitor)
- Description
- Recommended action

### 6. System Health

**Triggers when:**
- Component fails or degrades

**Severity:**
- Down: CRITICAL
- Degraded: WARNING
- OK: INFO

**Contains:**
- Component name
- Status
- Error details
- Recommended action

---

## Best Practices

### 1. Use Multiple Channels

Redundancy ensures you don't miss critical alerts:

```bash
# Recommended setup
TELEGRAM_BOT_TOKEN=...        # For mobile notifications
DISCORD_WEBHOOK_URL=...       # For team visibility
WEBHOOK_URL=...               # For logging/archival
```

### 2. Set Appropriate Severity

```bash
# Production
ALERT_MIN_SEVERITY=high       # Only actionable alerts

# Avoid alert fatigue by filtering noise
```

### 3. Test Regularly

```bash
# Weekly test (add to cron)
0 9 * * 1 cd /opt/kamiyo && docker-compose exec api python alerts/alert_manager.py
```

### 4. Monitor Alert Delivery

```bash
# Set up monitoring for alert system itself
# Alert if no alerts sent in 24h (might indicate system down)
```

### 5. Document Your Runbook

Create an incident response plan:
1. Alert received → Acknowledge in Telegram/Discord
2. Check dashboard: `curl http://localhost:8000/security/dashboard`
3. Investigate logs: `docker-compose logs -f api`
4. Take action based on alert type
5. Document incident in database

---

## FAQ

**Q: Can I use multiple Telegram chats?**
A: Not directly, but you can forward bot messages to multiple chats, or use a custom webhook to fan out.

**Q: How do I stop getting alerts temporarily?**
A: Set `ALERTS_ENABLED=false` in `.env` and restart: `docker-compose restart api`

**Q: Can I customize alert messages?**
A: Yes! Edit `alerts/alert_manager.py` and modify the alert methods.

**Q: Do alerts persist if the system restarts?**
A: No, alerts are only sent when events are detected. Use database integration to track historical events.

**Q: Can I get alerts via SMS?**
A: Not directly, but you can use Twilio via the custom webhook endpoint.

**Q: How do I test without spamming channels?**
A: Create separate test channels/chats and use those webhook URLs during development.

---

## Support

- **Documentation:** `/docs` folder
- **Issues:** https://github.com/mizuki-tamaki/kamiyo-hyperliquid/issues
- **Examples:** `alerts/alert_manager.py` (see bottom of file)

---

*Last Updated: 2025-11-03*
