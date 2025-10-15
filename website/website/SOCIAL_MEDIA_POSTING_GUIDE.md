# Kamiyo Social Media Posting System

**Automated Multi-Platform Exploit Alert Broadcasting**

---

## Overview

The Kamiyo Social Media Posting System automatically generates and publishes exploit alerts to multiple social media platforms as soon as the Kamiyo platform detects and analyzes a new DeFi exploit. The system includes a human review workflow to ensure quality before posting.

### Features

✅ **Multi-Platform Support**
- Reddit (r/defi, r/CryptoCurrency, etc.)
- Discord (via webhooks)
- Telegram (channels and groups)
- X/Twitter (with thread support)

✅ **Automated Workflows**
- Real-time monitoring via WebSocket
- Polling mode for API monitoring
- Automatic post generation from exploit data
- Human review and approval workflow
- Rate limiting per platform
- Retry logic with exponential backoff

✅ **Smart Filtering**
- Minimum loss amount threshold
- Chain filtering
- Deduplication
- Priority-based posting

✅ **Rich Content**
- Platform-optimized formatting
- Emojis and visual indicators
- Severity-based colors (Discord)
- Thread support for long content (Twitter)
- HTML/Markdown formatting

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Kamiyo API/WebSocket                     │
│              (New Exploit Detection)                      │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│                  Kamiyo Watcher                           │
│  • Polls API or listens to WebSocket                     │
│  • Filters exploits by amount/chain                       │
│  • Deduplication                                          │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│                  Post Generator                           │
│  • Creates platform-specific content                      │
│  • Formats with emojis and styling                        │
│  • Generates tags/hashtags                                │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│               Human Review (Optional)                     │
│  • CLI interface for approval                             │
│  • Web interface (future)                                 │
│  • Auto-approve mode available                            │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│               Social Media Poster                         │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Reddit    │  │   Discord    │  │   Telegram     │  │
│  │   Poster    │  │   Poster     │  │    Poster      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                            │
│  ┌─────────────┐                                          │
│  │  X/Twitter  │                                          │
│  │   Poster    │                                          │
│  └─────────────┘                                          │
│                                                            │
│  • Rate limiting                                          │
│  • Retry logic                                            │
│  • Error handling                                         │
└──────────────────────────────────────────────────────────┘
```

---

## Installation & Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

New dependencies added:
- `praw==7.7.1` - Reddit API
- `tweepy==4.14.0` - X/Twitter API
- `websockets==12.0` - WebSocket client

### 2. Configure Environment Variables

Copy and configure your `.env` file:

```bash
cp .env.production.template .env
```

#### Required Configuration

**Enable Platforms:**
```env
REDDIT_ENABLED=true
DISCORD_SOCIAL_ENABLED=true
TELEGRAM_SOCIAL_ENABLED=true
X_TWITTER_ENABLED=true
```

**Set Filters:**
```env
# Only post exploits >= $100k
SOCIAL_MIN_AMOUNT_USD=100000

# Only post these chains (or leave empty for all)
SOCIAL_ENABLED_CHAINS=Ethereum,BSC,Polygon,Arbitrum
```

#### Platform-Specific Setup

**Reddit:**
1. Create Reddit app: https://www.reddit.com/prefs/apps
2. Create a dedicated bot account
3. Configure:
```env
REDDIT_CLIENT_ID=xxxxx
REDDIT_CLIENT_SECRET=xxxxx
REDDIT_USERNAME=your_bot_username
REDDIT_PASSWORD=your_bot_password
REDDIT_SUBREDDITS=defi,CryptoCurrency
```

**Discord:**
1. Create webhook URLs in your Discord channels
2. Configure:
```env
DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/XXX/YYY,news=https://discord.com/api/webhooks/AAA/BBB
```

**Telegram:**
1. Create bot with @BotFather
2. Get chat IDs for channels/groups
3. Configure:
```env
TELEGRAM_SOCIAL_BOT_TOKEN=123456789:XXXXX
TELEGRAM_SOCIAL_CHATS=channel1=@yourchannel,group1=-1001234567890
```

**X/Twitter:**
1. Apply for Twitter Developer account
2. Create app and get API keys
3. Configure:
```env
X_API_KEY=xxxxx
X_API_SECRET=xxxxx
X_ACCESS_TOKEN=xxxxx
X_ACCESS_SECRET=xxxxx
X_BEARER_TOKEN=xxxxx
```

### 3. Kamiyo API Configuration

```env
KAMIYO_API_URL=https://api.kamiyo.ai
KAMIYO_API_KEY=your_api_key_here
KAMIYO_WEBSOCKET_URL=wss://api.kamiyo.ai/ws

# Choose mode: 'poll' or 'websocket'
WATCHER_MODE=websocket

# For poll mode: interval in seconds
POLL_INTERVAL_SECONDS=60
```

---

## Usage

### Quick Start - Run the Watcher

```bash
# With review workflow
python social/kamiyo_watcher.py

# Auto-post without review (use with caution)
python social/kamiyo_watcher.py --auto-approve
```

The watcher will:
1. Connect to Kamiyo API/WebSocket
2. Monitor for new exploits
3. Generate posts automatically
4. Present for review (or auto-post)
5. Post to all enabled platforms

### Testing Individual Components

#### 1. Test Post Generator

```python
from social.models import ExploitData
from social.post_generator import PostGenerator
from datetime import datetime

# Create test exploit
exploit = ExploitData(
    tx_hash="0x1234...",
    protocol="Uniswap V3",
    chain="Ethereum",
    loss_amount_usd=2_500_000,
    exploit_type="Flash Loan",
    timestamp=datetime.utcnow(),
    description="Flash loan attack...",
    recovery_status="Partial - 60% recovered",
    source="Rekt News"
)

# Generate post
generator = PostGenerator()
post = generator.generate_post(
    exploit,
    platforms=[Platform.X_TWITTER, Platform.REDDIT]
)

# View generated content
for platform, content in post.content.items():
    print(f"\n{platform.value}:")
    print(content)
```

#### 2. Test Platform Poster

```python
from social.platforms import RedditPoster

# Configure
config = {
    'enabled': True,
    'client_id': 'xxx',
    'client_secret': 'xxx',
    'username': 'xxx',
    'password': 'xxx',
    'subreddits': ['test']  # Use test subreddit!
}

# Create poster
poster = RedditPoster(config)

# Test authentication
if poster.authenticate():
    print("✓ Authenticated to Reddit")

# Test post
result = poster.post_with_retry(
    content="# Test Post\n\nThis is a test.",
    title="Test Exploit Alert"
)

print(f"Success: {result['success']}")
print(f"Results: {result}")
```

#### 3. Test Full Workflow

```python
from social.poster import SocialMediaPoster
from social.models import ExploitData, Platform
from datetime import datetime

# Configure (use test accounts!)
config = {
    'discord': {
        'enabled': True,
        'webhooks': {'test': 'your_test_webhook_url'}
    }
}

# Create poster
poster = SocialMediaPoster(config)

# Create test exploit
exploit = ExploitData(
    tx_hash="0xtest123",
    protocol="Test Protocol",
    chain="Ethereum",
    loss_amount_usd=150000,
    exploit_type="Test",
    timestamp=datetime.utcnow()
)

# Process with review callback
def review_callback(post):
    print(f"\n{'='*60}")
    print(f"Review Post: {post.exploit_data.protocol}")
    print(f"{'='*60}")
    for platform, content in post.content.items():
        print(f"\n{platform.value}:")
        print(content)
    approval = input("\nApprove? (y/n): ")
    return approval.lower() == 'y'

result = poster.process_exploit(
    exploit,
    platforms=[Platform.DISCORD],
    review_callback=review_callback
)

print(f"\nResult: {result}")
```

---

## Platform-Specific Content Examples

### X/Twitter (280 chars)

```
🚨 Uniswap V3 Exploit Alert 🚨

💰 Loss: $2.50M
⛓️ Chain: Ethereum
🔥 Type: Flash Loan

🔗 TX: 0x1234...abcd

#Ethereum #DeFi #CryptoSecurity #Kamiyo
```

### Reddit (Markdown)

```markdown
# 🚨 Uniswap V3 Exploit - $2.50M Lost

**Chain:** Ethereum

**Loss Amount:** $2.50M ($2,500,000.00 USD)

**Exploit Type:** Flash Loan

**Timestamp:** 2025-10-08 12:34 UTC

**Transaction Hash:** `0x1234567890abcdef...`

**Recovery Status:** Partial Recovery - 60% recovered

---

**Description:**

Flash loan attack exploited price oracle manipulation
vulnerability in liquidity pool...

---

*This exploit was detected and reported by [Kamiyo](https://kamiyo.ai) -
Real-time cryptocurrency exploit intelligence aggregator.*

*Source: Rekt News*
```

### Discord (Embed)

```
🚨 **Uniswap V3 Exploit Alert** 🚨

💰 **Loss Amount:** $2.50M
⛓️ **Chain:** Ethereum
🔥 **Exploit Type:** Flash Loan
⏰ **Time:** 2025-10-08 12:34 UTC
♻️ **Recovery:** Partial - 60% recovered

🔗 **Transaction:** `0x1234567890ab...`

📊 **Source:** Rekt News

---
*Detected by Kamiyo Intelligence Platform*
```

### Telegram (HTML)

```html
🚨 <b>Uniswap V3 Exploit</b> 🚨

💰 Loss: <b>$2.50M</b>
⛓️ Chain: Ethereum
🔥 Type: Flash Loan
⏰ 2025-10-08 12:34 UTC

🔗 TX: <code>0x1234567890abcdef...</code>

♻️ Recovery: Partial - 60% recovered

📊 Source: Rekt News
🤖 <a href='https://kamiyo.ai'>Kamiyo Intelligence</a>
```

---

## Advanced Configuration

### Custom Review Workflow

```python
class CustomReviewWorkflow:
    def __init__(self, webhook_url):
        self.webhook_url = webhook_url

    def review(self, post):
        """Send post to Slack/Discord for team review"""
        # Post to team channel
        requests.post(self.webhook_url, json={
            'text': f"New exploit post ready for review: {post.exploit_data.protocol}"
        })

        # Wait for approval from database/API
        while True:
            status = self.check_approval_status(post.post_id)
            if status == 'approved':
                return True
            elif status == 'rejected':
                return False
            time.sleep(5)

# Use custom workflow
poster = SocialMediaPoster(config)
reviewer = CustomReviewWorkflow('https://hooks.slack.com/...')

poster.process_exploit(
    exploit,
    review_callback=reviewer.review
)
```

### Custom Filters

```python
class CustomWatcher(KamiyoWatcher):
    def should_post(self, exploit):
        """Custom filtering logic"""
        # Call parent filter
        if not super().should_post(exploit):
            return False

        # Custom: Only post Ethereum exploits on weekdays
        if exploit.chain == 'Ethereum':
            return datetime.now().weekday() < 5

        # Custom: Skip certain protocols
        if exploit.protocol in ['TestProtocol', 'ScamProtocol']:
            return False

        return True
```

### Platform-Specific Customization

```python
# Customize Reddit titles
def custom_reddit_title(exploit):
    if exploit.priority == PostPriority.CRITICAL:
        return f"🚨 CRITICAL: {exploit.protocol} - {exploit.formatted_amount} EXPLOIT"
    else:
        return f"{exploit.protocol} Exploit - {exploit.formatted_amount} Lost"

# Use in poster
result = reddit_poster.post_with_retry(
    content=content,
    title=custom_reddit_title(exploit)
)
```

---

## Rate Limiting

Each platform poster implements rate limiting:

| Platform | Default Limit | Configurable |
|----------|--------------|--------------|
| Reddit | 10 posts/hour | Yes |
| Discord | 30 posts/hour | Yes |
| Telegram | 20 posts/hour | Yes |
| X/Twitter | 15 posts/hour | Yes |

Configure in platform config:

```python
config = {
    'reddit': {
        'enabled': True,
        'rate_limit': 5,  # Max 5 posts per hour
        'retry_attempts': 3,
        'retry_delay': 60  # Seconds between retries
    }
}
```

---

## Error Handling

The system includes comprehensive error handling:

### Automatic Retries

```python
# Each platform poster retries failed posts automatically
result = poster.post_with_retry(content)

# Retry configuration
config = {
    'retry_attempts': 3,  # Try up to 3 times
    'retry_delay': 60  # Wait 60 seconds between retries
}
```

### Partial Success Handling

```python
# If posting succeeds on some platforms but fails on others
result = poster.post_to_platforms(post)

if result['partial']:
    # Some platforms succeeded
    successful = [
        p for p, r in result['results'].items()
        if r.get('success')
    ]
    print(f"Posted to: {successful}")

    failed = [
        p for p, r in result['results'].items()
        if not r.get('success')
    ]
    print(f"Failed to post to: {failed}")
```

### Logging

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('social_poster.log'),
        logging.StreamHandler()
    ]
)
```

---

## Monitoring & Analytics

### Track Posting Stats

```python
# Get platform status
status = poster.get_platform_status()

for platform, info in status.items():
    print(f"\n{platform}:")
    print(f"  Enabled: {info['enabled']}")
    print(f"  Authenticated: {info['authenticated']}")
    print(f"  Posts last hour: {info['posts_last_hour']}/{info['rate_limit']}")
    print(f"  Can post: {info['can_post']}")
```

### Database Integration (Future)

Create `database/migrations/008_social_posts.sql`:

```sql
CREATE TABLE social_posts (
    id SERIAL PRIMARY KEY,
    post_id VARCHAR(64) UNIQUE NOT NULL,
    exploit_tx_hash VARCHAR(66) REFERENCES exploits(tx_hash),
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    posted_at TIMESTAMP,
    platforms TEXT[],
    posting_results JSONB
);

CREATE INDEX idx_social_posts_exploit ON social_posts(exploit_tx_hash);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_created ON social_posts(created_at DESC);
```

---

## Security Best Practices

1. **Never commit credentials**
   - Use `.env` files (never commit)
   - Use environment variables in production
   - Rotate credentials regularly

2. **Use dedicated bot accounts**
   - Separate accounts for each platform
   - Limited permissions
   - Clear identification as bots

3. **Rate limiting**
   - Respect platform rate limits
   - Implement backoff on errors
   - Monitor for API limits

4. **Content validation**
   - Review before auto-posting
   - Test with private channels first
   - Monitor for spam reports

5. **Error monitoring**
   - Log all errors
   - Alert on failures
   - Track success rates

---

## Troubleshooting

### Common Issues

**1. "Authentication failed"**
- Check credentials in `.env`
- Verify API keys are active
- Check account permissions

**2. "Rate limit exceeded"**
- Wait before retrying
- Reduce posting frequency
- Check rate_limit config

**3. "Content validation failed"**
- Check message length limits
- Verify formatting (HTML/Markdown)
- Remove invalid characters

**4. "Webhook URL invalid"**
- Verify Discord webhook URLs
- Check webhook hasn't been deleted
- Test with curl

**5. "No new exploits detected"**
- Check Kamiyo API is accessible
- Verify min_amount_usd filter
- Check chain filters
- Verify watcher is running

### Debug Mode

```python
import logging
logging.getLogger('social').setLevel(logging.DEBUG)
```

---

## File Structure

```
social/
├── __init__.py                   # Module initialization
├── models.py                     # Data models
├── post_generator.py             # Content generation
├── poster.py                     # Main orchestrator
├── kamiyo_watcher.py            # Kamiyo API integration
└── platforms/
    ├── __init__.py
    ├── base.py                   # Base platform class
    ├── reddit.py                 # Reddit poster
    ├── discord.py                # Discord poster
    ├── telegram.py               # Telegram poster
    └── x_twitter.py              # X/Twitter poster
```

---

## Future Enhancements

- [ ] Web-based review interface
- [ ] Scheduled posting (post at optimal times)
- [ ] A/B testing for content variations
- [ ] Analytics dashboard
- [ ] Image generation for social posts
- [ ] Video/GIF support
- [ ] LinkedIn integration
- [ ] Facebook integration
- [ ] Multi-account support per platform
- [ ] Content personalization by audience

---

## Support

- **Documentation**: This file
- **Issues**: Create GitHub issue
- **API Docs**: https://docs.kamiyo.ai

---

## License

Proprietary - Kamiyo Platform

---

**Built with ❤️ for the Kamiyo Intelligence Platform**

*Last updated: 2025-10-08*
