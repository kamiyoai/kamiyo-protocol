# AI Agent Quote Tweet System

Automated daily quote tweeting system that finds interesting posts from leading AI/agent accounts and generates insightful responses using Claude AI.

## Features

- **Smart Discovery**: Searches Twitter for relevant posts from leading AI agent accounts (Phala Network, xAI, Anthropic, etc.)
- **AI-Generated Insights**: Uses Claude API to generate thoughtful, intelligent quote tweets (no templates or patterns)
- **Daily Automation**: Runs once per day via cron job
- **Natural Voice**: Writes like talking to an intelligent peer - genuine, insightful, interesting

## Setup

### 1. Install Dependencies

```bash
cd social
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Set up your Twitter, Anthropic API, and optionally Discord webhook:

```bash
# Twitter/X API credentials (use X_* or TWITTER_* variable names)
export X_API_KEY="your_twitter_api_key"
export X_API_SECRET="your_twitter_api_secret"
export X_ACCESS_TOKEN="your_access_token"
export X_ACCESS_SECRET="your_access_secret"
export X_BEARER_TOKEN="your_bearer_token"

# Claude AI (required for content generation)
export ANTHROPIC_API_KEY="your_anthropic_api_key"

# Optional: Discord webhook for cross-posting AI-generated content
export DISCORD_SOCIAL_WEBHOOK="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
```

Add these to your `~/.bashrc` or `~/.zshrc` to make them permanent.

#### Getting Twitter API Credentials

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app (or use existing)
3. Generate API keys and access tokens
4. Make sure your app has Read and Write permissions

#### Getting Anthropic API Key

1. Go to https://console.anthropic.com/
2. Create an API key
3. Copy the key (starts with `sk-ant-`)

#### Getting Discord Webhook (Optional)

1. Go to your Discord server settings
2. Navigate to Integrations → Webhooks
3. Click "New Webhook"
4. Choose a channel for social posting updates
5. Copy the webhook URL
6. Set `DISCORD_SOCIAL_WEBHOOK` environment variable

The system will automatically post to Discord whenever it posts a quote tweet to Twitter.

### 3. Test AI Content Generation Quality

Before running the full system, test the AI content generation:

```bash
python social/test_ai_quality.py
```

This will:
- Generate 3 sample AI quote tweets
- Show you the exact content that would be posted
- Validate quality standards
- NOT post anything (dry run)

Review the generated content carefully. It should be:
- Natural and conversational (not template-based)
- Genuinely insightful
- As good as asking Claude Opus 4.1 directly

### 4. Test Run

Test the system manually:

```bash
python run_daily.py
```

You should see logs indicating:
- Searching for relevant tweets
- Finding tweets from target accounts
- Generating AI content with Claude
- Posting the quote tweet
- Success with URL

### 4. Setup Daily Automation

Run the setup script to create a daily cron job:

```bash
./setup_cron.sh
```

This will schedule the script to run every day at 10:00 AM.

## Configuration

### Target Accounts

Edit `ai_agent_poster.py` to modify the list of accounts to search:

```python
TARGET_ACCOUNTS = [
    'PhalaNetwork',
    'xai',
    'elonmusk',
    # ... add more
]
```

### Search Topics

Modify the topics used for discovery:

```python
SEARCH_TOPICS = [
    'AI agents',
    'autonomous agents',
    # ... add more
]
```

### Posting Schedule

To change when the daily post runs, edit the cron schedule in `setup_cron.sh`:

```bash
# Current: 10 AM daily
0 10 * * * ...

# Examples:
# 2 PM daily:    0 14 * * * ...
# 6 PM daily:    0 18 * * * ...
# Twice daily:   0 10,18 * * * ...
```

## Architecture

### Components

1. **twitter_client.py**: Twitter API wrapper
   - Authentication
   - Tweet search
   - Quote tweeting

2. **ai_agent_poster.py**: Main logic
   - Discovers relevant tweets
   - Generates AI responses with Claude
   - Posts quote tweets

3. **run_daily.py**: Scheduler script
   - Entry point for cron
   - Logging setup
   - Error handling

## How It Works

1. **Discovery Phase**
   - Searches recent tweets from target AI agent accounts
   - Searches tweets about AI agent topics with high engagement
   - Ranks by engagement (likes + retweets)

2. **Generation Phase**
   - Sends the tweet to Claude with a natural prompt
   - No templates or patterns - direct conversation
   - Claude generates a 6-sentence insightful response
   - Ensures it fits in 280 characters

3. **Posting Phase**
   - Quote tweets the original with AI-generated content
   - Logs success/failure
   - Returns URL of posted tweet

## Monitoring

Check logs:

```bash
# Application log
tail -f /tmp/kamiyo_ai_agent_poster.log

# Cron execution log
tail -f /tmp/kamiyo_cron.log
```

View cron status:

```bash
crontab -l
```

## Troubleshooting

**No tweets found**
- Check your search queries aren't too restrictive
- Verify target accounts are active
- Check Twitter API rate limits

**Authentication failed**
- Verify all environment variables are set
- Check Twitter app has Read/Write permissions
- Ensure Bearer token is included

**Claude generation failed**
- Check ANTHROPIC_API_KEY is valid
- Verify API credits/limits
- Check error logs for details

**Cron not running**
- Verify cron service is running: `ps aux | grep cron`
- Check crontab: `crontab -l`
- Check cron logs: `tail -f /var/log/syslog | grep CRON`

## Manual Operations

Run once manually:
```bash
python run_daily.py
```

Test Twitter authentication:
```bash
python -c "from social.twitter_client import TwitterClient; c=TwitterClient(); print('Auth:', c.authenticate())"
```

Test Claude integration:
```bash
python -c "from social.ai_agent_poster import AIAgentPoster; p=AIAgentPoster(); print('OK')"
```

## Safety

- Rate limits are respected (Twitter's wait_on_rate_limit=True)
- Only posts once per day (via cron schedule)
- No spam - thoughtful, insightful content only
- Error handling prevents cascading failures

## License

Part of the KAMIYO project.
