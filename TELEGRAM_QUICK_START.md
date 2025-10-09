# Telegram Integration - Quick Start Guide

## 5-Minute Setup

### 1. Create Telegram Bot (2 minutes)

```
1. Open Telegram and search for @BotFather
2. Send: /newbot
3. Enter bot name: "Kamiyo Alerts"
4. Enter bot username: "kamiyo_alerts_bot"
5. Copy the token (123456789:ABCdefGHI...)
```

### 2. Configure Environment (1 minute)

```bash
# Edit .env.production
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_BOT_USERNAME=kamiyo_alerts_bot
ENABLE_TELEGRAM_ALERTS=true
```

### 3. Run Migration (1 minute)

```bash
psql -U kamiyo -d kamiyo_prod -f database/migrations/006_telegram_tables.sql
```

### 4. Start Bot (1 minute)

```bash
docker-compose -f docker-compose.production.yml up -d telegram-bot
```

## Test It

```
1. Open Telegram
2. Search for @kamiyo_alerts_bot
3. Send: /start
4. Send: /subscribe
5. Done! You'll receive alerts
```

## Common Commands

```
/start       - Begin using the bot
/subscribe   - Turn on alerts
/unsubscribe - Turn off alerts
/status      - Check your settings
/filter      - Set alert preferences
/help        - Show all commands
```

## Set Filters

```
1. Send: /filter
2. Click "Set Min Amount"
3. Send: /setamount 100000
   (Only alerts for exploits > $100k)

Or for chains:
1. Send: /filter
2. Click "Set Chains"
3. Select "Ethereum" (or "All Chains")
```

## Link to Platform Account

```
1. Get your chat_id from /status
2. Go to https://kamiyo.ai/settings/telegram
3. Enter chat_id
4. Click "Link Account"
5. Your tier benefits will sync automatically
```

## Monitor Channels (Optional)

To enable channel monitoring:

```bash
# Get Telegram API credentials from https://my.telegram.org
# Add to .env.production:
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_MONITOR_CHANNELS=@defisecurity,@rugdoc
ENABLE_TELEGRAM_MONITORING=true

# Start monitor
docker-compose -f docker-compose.production.yml --profile monitoring up -d telegram-monitor
```

## API Examples

### Get Bot Status
```bash
curl https://api.kamiyo.ai/api/v1/telegram/status
```

### Update Settings
```bash
curl -X POST https://api.kamiyo.ai/api/v1/telegram/settings?chat_id=YOUR_CHAT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "chains": ["Ethereum", "BSC"],
    "min_amount_usd": 100000,
    "instant_alerts": true
  }'
```

## Troubleshooting

**Bot not responding?**
```bash
docker logs kamiyo-telegram-bot --tail 50
docker-compose restart telegram-bot
```

**Not receiving alerts?**
```bash
# Check if subscribed
# Send /status to bot

# Check rate limit
# Free tier: 5 alerts/day
# Upgrade for more
```

**Can't link account?**
```bash
# Make sure you've used /start first
# Check chat_id is correct
# Verify user_id exists in platform
```

## Security Notes

- Never share your bot token
- Store token in environment variables
- Don't commit .env files to git
- Use rate limiting to prevent spam
- Monitor for suspicious activity

## Architecture

```
Kamiyo Platform
    │
    ├─ Aggregators (detect exploits)
    │       │
    │       ├─ Database (store exploits)
    │       │       │
    │       │       └─ Telegram Bot (send alerts)
    │       │                 │
    │       │                 └─ Telegram API
    │       │                       │
    │       │                       └─ End Users
    │       │
    │       └─ Telegram Monitor (watch channels)
    │
    └─ API Endpoints (manage settings)
```

## What You Get

### Free Tier
- 5 alerts per day
- Instant notifications
- Basic filters (chain, amount)
- Bot commands

### Pro Tier
- Unlimited alerts
- Advanced filters (protocol, category)
- Daily digest
- Weekly summary
- API access
- Priority support

## Integration Code

```python
# Send alert from your code
from alerts.telegram_bot import KamiyoTelegramBot
import asyncio

bot = KamiyoTelegramBot(
    token=os.getenv('TELEGRAM_BOT_TOKEN'),
    database_url=os.getenv('DATABASE_URL')
)

exploit = {
    'id': 1,
    'protocol': 'Uniswap',
    'chain': 'Ethereum',
    'amount_usd': 1000000,
    'tx_hash': '0x123...',
    'timestamp': datetime.now(),
    'category': 'Flash Loan',
    'description': 'Flash loan attack',
    'source_url': 'https://...'
}

# Send to specific user
await bot.send_exploit_alert(
    chat_id=123456789,
    exploit=exploit,
    subscription={'include_tx_link': True, 'include_analysis': True}
)

# Or broadcast to all matching users
await bot.broadcast_new_exploit(exploit)
```

## Support

- Docs: [TELEGRAM_INTEGRATION.md](./TELEGRAM_INTEGRATION.md)
- Issues: GitHub Issues
- Discord: https://discord.gg/kamiyo
- Email: support@kamiyo.ai

---

Ready to go in 5 minutes!
