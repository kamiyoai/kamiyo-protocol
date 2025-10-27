# Deploying Kamiyo Watcher to Render.com

## Current Status

Your `render.yaml` is configured with a **24/7 social media watcher** service that will:
- ✅ Run continuously on Render's infrastructure
- ✅ Auto-restart if it crashes
- ✅ Check for new exploits every 60 seconds
- ✅ Post exploits >= $1M to X/Twitter
- ✅ Filter by chains: Ethereum, BSC, Polygon, Arbitrum

## Service Configuration

The watcher service in `render.yaml`:

```yaml
- type: worker
  name: kamiyo-social-watcher
  runtime: python
  branch: main
  startCommand: cd website && python3 social/kamiyo_watcher.py
```

**Key Settings:**
- `SOCIAL_MIN_AMOUNT_USD=1000000` - Only post exploits >= $1M
- `POLL_INTERVAL_SECONDS=60` - Check every minute
- `MAX_POSTS_PER_CYCLE=3` - Limit to 3 posts per check (rate limiting)
- `X_TWITTER_ENABLED=true` - Post to X/Twitter

## Deployment Steps

### 1. Commit and push your changes:
```bash
git add render.yaml .env
git commit -m "Configure 24/7 social media watcher with $1M threshold"
git push origin main
```

### 2. Configure environment variables in Render Dashboard:

Go to your Render dashboard for the `kamiyo-social-watcher` service and set:

**Required (X/Twitter):**
- `X_API_KEY` - Your Twitter API key
- `X_API_SECRET` - Your Twitter API secret
- `X_ACCESS_TOKEN` - Your Twitter access token
- `X_ACCESS_SECRET` - Your Twitter access secret
- `X_BEARER_TOKEN` - Your Twitter bearer token (optional)

**Optional (Discord):**
- `DISCORD_SOCIAL_ENABLED=true`
- `DISCORD_SOCIAL_WEBHOOKS=channel_name=https://discord.com/api/webhooks/...`

The service will automatically deploy and start running 24/7.

### 3. Verify it's running:

Check the logs in Render dashboard:
```
Starting Kamiyo watcher (polling every 60s)
Initialized 1 platform posters
Fetched X recent exploits from Kamiyo API
```

## How It Works

1. **Polling**: Every 60 seconds, queries your API: `GET https://api.kamiyo.ai/exploits?min_amount=1000000`
2. **Filtering**: Only processes exploits that:
   - Are >= $1,000,000 USD
   - Are on Ethereum, BSC, Polygon, or Arbitrum
   - Haven't been posted before (tracked in memory)
3. **Posting**: For each qualifying exploit:
   - Generates platform-specific content
   - Posts to X/Twitter (and Discord if enabled)
   - Waits 5 seconds between posts (rate limit protection)
4. **Rate Limiting**: If rate limited (429 error), pauses for 15 minutes

## Monitoring

### View Logs
In Render dashboard, go to your `kamiyo-social-watcher` service and click "Logs"

### Expected Log Output
```
INFO - Starting Kamiyo watcher (polling every 60s)
INFO - Fetched 3 recent exploits from Kamiyo API
INFO - New exploit detected: GriffinAI ($3.0M) on BSC
INFO - Successfully posted exploit 1/3: GriffinAI to 1 platforms
```

### Health Checks
The watcher will log every polling cycle. If you don't see logs for 2+ minutes, something is wrong.

## Troubleshooting

### No posts appearing
1. **Check threshold**: Only exploits >= $1M are posted
2. **Check chain filter**: Only Ethereum/BSC/Polygon/Arbitrum
3. **Check logs**: Look for errors in Render dashboard
4. **Verify credentials**: Ensure X_API_KEY, X_API_SECRET, etc. are set correctly

### "Rate limited" errors
This is normal if posting too frequently. The watcher will automatically pause for 15 minutes.

Adjust `MAX_POSTS_PER_CYCLE` to post fewer exploits per cycle.

### Service keeps restarting
1. Check error logs in Render dashboard
2. Verify all required environment variables are set
3. Test credentials locally: `python website/test_both_platforms.py`

## Updating Configuration

To change settings, update the `render.yaml` file and push to GitHub. Render will automatically redeploy.

**Common changes:**
- Lower threshold: Change `SOCIAL_MIN_AMOUNT_USD` to `500000` for $500K minimum
- More chains: Add `Solana,Avalanche` to `SOCIAL_ENABLED_CHAINS`
- Enable Discord: Set `DISCORD_SOCIAL_ENABLED=true` and add webhook URL
- Faster polling: Change `POLL_INTERVAL_SECONDS` to `30` (check every 30s)

## Cost

- **Worker service**: Free tier includes 750 hours/month (enough for 24/7)
- **Upgrade to paid**: $7/month for guaranteed uptime and more resources

## Important Notes

⚠️ The watcher tracks posted exploits **in memory only**. If the service restarts, it will re-post recent exploits. To avoid duplicates, the watcher starts by checking the last 30 days (`VIRAL_MAX_AGE_HOURS=720`) but respects the posting limit (`MAX_POSTS_PER_CYCLE=3`).

✅ The service will survive:
- Code deployments (graceful restart)
- Temporary API outages (keeps retrying)
- Rate limits (automatic 15-minute pause)
- Network errors (retries next cycle)
