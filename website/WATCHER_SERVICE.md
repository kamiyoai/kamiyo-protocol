# Kamiyo Watcher - 24/7 Service

The Kamiyo Watcher monitors your API for new exploits and automatically posts them to X/Twitter and Discord.

## Quick Start

### Start the watcher (will auto-restart on crashes and run on boot):
```bash
./scripts/start_watcher.sh
```

### Check if it's running:
```bash
./scripts/status_watcher.sh
```

### View live logs:
```bash
tail -f logs/watcher.log
```

### Stop the watcher:
```bash
./scripts/stop_watcher.sh
```

## How It Works

- **Runs 24/7/365**: Automatically starts on system boot
- **Auto-restart**: If the watcher crashes, macOS will restart it within 10 seconds
- **Polling interval**: Checks for new exploits every 60 seconds (configure with `POLL_INTERVAL_SECONDS` in `.env`)
- **Threshold**: Only posts exploits >= $1,000,000 (configure with `SOCIAL_MIN_AMOUNT_USD` in `.env`)
- **Chain filters**: Only posts from Ethereum, BSC, Polygon, Arbitrum (configure with `SOCIAL_ENABLED_CHAINS` in `.env`)

## Configuration

All settings are in `.env`:

```bash
# Enable/disable platforms
X_TWITTER_ENABLED=true
DISCORD_SOCIAL_ENABLED=false

# Minimum amount to post
SOCIAL_MIN_AMOUNT_USD=1000000

# Which chains to monitor
SOCIAL_ENABLED_CHAINS=Ethereum,BSC,Polygon,Arbitrum

# Polling interval
POLL_INTERVAL_SECONDS=60

# Rate limiting (posts per cycle)
MAX_POSTS_PER_CYCLE=3
```

## Logs

- **Standard output**: `logs/watcher.log`
- **Errors**: `logs/watcher.error.log`

## Manual Commands

```bash
# Restart the service
launchctl kickstart -k gui/$(id -u)/com.kamiyo.watcher

# Check if running
launchctl list | grep kamiyo

# View service details
launchctl list com.kamiyo.watcher

# Unload (stop) service
launchctl unload ~/Library/LaunchAgents/com.kamiyo.watcher.plist

# Load (start) service
launchctl load ~/Library/LaunchAgents/com.kamiyo.watcher.plist
```

## Troubleshooting

### Service won't start
1. Check error logs: `cat logs/watcher.error.log`
2. Verify .env file exists with correct credentials
3. Test manually: `python3 website/social/kamiyo_watcher.py`

### No posts appearing
1. Check threshold: Posts only happen for exploits >= $1M
2. Check chain filters: Only configured chains are posted
3. Check platforms enabled: `X_TWITTER_ENABLED=true` in `.env`
4. Verify API is running: `curl http://localhost:8000/exploits`
5. Check logs for errors: `tail -f logs/watcher.log`

### Rate limiting
If you hit rate limits, the watcher will automatically pause for 15 minutes before retrying.

Configure `MAX_POSTS_PER_CYCLE` to limit posts per polling cycle (default: 3).
