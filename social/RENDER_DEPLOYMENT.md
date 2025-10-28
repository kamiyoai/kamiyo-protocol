# Kamiyo AI Quote Scheduler - Render.com Deployment

## Overview

The AI Quote Scheduler is now configured to run as a **Render worker service** that posts AI-generated quote tweets **twice daily at random times**.

## Deployment on Render.com

### Step 1: Push Code to GitHub

The code has been pushed to your repository with the updated `render.yaml` configuration.

### Step 2: Deploy on Render Dashboard

1. Go to your Render dashboard: https://dashboard.render.com
2. Navigate to your existing Kamiyo project (or create new from repo)
3. Render will automatically detect the new worker service: `kamiyo-ai-quote-scheduler`
4. Click "Approve" to create the new worker service

### Step 3: Configure Environment Variables

In the Render dashboard, set these environment variables for the `kamiyo-ai-quote-scheduler` service:

**Required:**
- `ANTHROPIC_API_KEY` - Your Claude API key
- `X_API_KEY` - Twitter/X API key
- `X_API_SECRET` - Twitter/X API secret
- `X_ACCESS_TOKEN` - Twitter/X access token
- `X_ACCESS_SECRET` - Twitter/X access token secret
- `X_BEARER_TOKEN` - Twitter/X bearer token

**Optional:**
- `DISCORD_SOCIAL_ENABLED` - Set to `true` to enable Discord posting
- `DISCORD_WEBHOOK_URL` - Discord webhook URL for notifications

### Step 4: Deploy

1. Render will automatically build and deploy the service
2. The worker will start running continuously
3. Check logs to verify it's working

## What Gets Deployed

### New Worker Service: `kamiyo-ai-quote-scheduler`

- **Runtime**: Python 3.11
- **Command**: `python3 social/random_scheduler.py`
- **Behavior**: Runs 24/7, posting twice daily at random times
  - Morning: 8 AM - 12 PM (random time)
  - Evening: 4 PM - 10 PM (random time)
- **Post Style**: Variable length (short/medium/long)
- **Auto-restart**: Yes, on failure

### Existing Services (Unchanged)

- `kamiyo-api` - FastAPI backend
- `kamiyo-frontend` - Next.js frontend
- `kamiyo-aggregator` - Exploit data aggregator
- `kamiyo-social-watcher` - Real-time exploit notifications

## Monitoring on Render

### View Logs

1. Go to Render dashboard
2. Select `kamiyo-ai-quote-scheduler` service
3. Click "Logs" tab
4. You'll see:
   - Scheduler initialization
   - Random time generation
   - Post attempts and results
   - Error messages (if any)

### Check Status

Look for these log messages:
```
Starting Random AI Agent Quote Tweet Scheduler
Morning window: 8 AM - 12 PM
Evening window: 4 PM - 10 PM
Next morning post scheduled around: YYYY-MM-DD HH:MM AM
Next evening post scheduled around: YYYY-MM-DD HH:MM PM
```

When a post is made:
```
Posting morning quote tweet - YYYY-MM-DD HH:MM:SS
SUCCESS!
Posted at: https://twitter.com/username/status/...
Generated short-form quote tweet (87 chars): ...
```

## Troubleshooting

### Service Won't Start

**Check logs for errors:**
1. Go to service in Render dashboard
2. View logs for error messages
3. Common issues:
   - Missing environment variables
   - Twitter API credentials invalid
   - Python package installation failed

**Solution:**
- Verify all environment variables are set
- Check Twitter API access levels
- Review build logs for package errors

### No Tweets Being Posted

**Possible causes:**
1. Not within posting window (8-12 AM or 4-10 PM)
2. Already posted for that window today
3. Twitter API rate limits
4. Twitter credentials expired

**Check logs for:**
- "No relevant tweets found" - Twitter search returned nothing
- "Failed to post quote tweet" - Twitter API error
- Rate limit messages

**Solution:**
- Wait for next posting window
- Verify Twitter API credentials
- Check Twitter API dashboard for rate limits

### Service Keeps Restarting

**Check for:**
- Uncaught exceptions in logs
- Memory issues (upgrade Render plan if needed)
- Twitter API authentication errors

**Solution:**
- Review logs for specific error
- Verify credentials are correct
- Contact Render support if memory issue

## Cost Estimate

### Render Pricing (as of 2024)

**Worker Service:**
- Free tier: Limited hours
- Starter: $7/month for 0.5 GB RAM
- Standard: $25/month for 2 GB RAM

**Recommended Plan:**
- Starter ($7/month) should be sufficient
- Uses minimal resources (just scheduling and API calls)
- Runs 24/7 continuously

**Total Monthly Cost:**
Your existing services + $7/month for AI scheduler

## Environment Variables Reference

### Required Variables

```bash
# Claude API for generating quote content
ANTHROPIC_API_KEY=sk-ant-...

# Twitter/X API credentials
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...
X_BEARER_TOKEN=...
```

### Optional Variables

```bash
# Discord integration
DISCORD_SOCIAL_ENABLED=false
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## Manual Override (Testing)

To test the scheduler locally before deploying:

```bash
# Navigate to project
cd /Users/dennisgoslar/Projekter/kamiyo

# Set environment variables
export ANTHROPIC_API_KEY=your_key
export X_API_KEY=your_key
export X_API_SECRET=your_secret
export X_ACCESS_TOKEN=your_token
export X_ACCESS_SECRET=your_secret
export X_BEARER_TOKEN=your_bearer_token

# Run scheduler
python3 social/random_scheduler.py
```

Watch the logs to verify:
- Random times are generated correctly
- Posts are created successfully
- Twitter API responds properly

## Updating the Service

After making code changes:

1. Push to GitHub: `git push`
2. Render auto-deploys from `main` branch
3. Service automatically restarts with new code
4. Check logs to verify deployment succeeded

## Disabling the Service

If you need to temporarily disable the scheduler:

1. Go to Render dashboard
2. Select `kamiyo-ai-quote-scheduler`
3. Click "Suspend"
4. Service stops running (no charges while suspended)

To re-enable:
1. Click "Resume"
2. Service starts running again

## Support

- **Render Docs**: https://render.com/docs
- **Render Status**: https://status.render.com
- **GitHub Issues**: Your repository issues page

## Architecture Notes

```
┌─────────────────────────────────────┐
│     Render.com Infrastructure       │
├─────────────────────────────────────┤
│                                     │
│  kamiyo-ai-quote-scheduler (Worker) │
│  ├─ Runs 24/7                       │
│  ├─ Checks every 5 minutes          │
│  ├─ Posts 2x daily (random times)   │
│  │  ├─ Morning: 8 AM - 12 PM        │
│  │  └─ Evening: 4 PM - 10 PM        │
│  ├─ Variable length posts           │
│  └─ Auto-restart on failure         │
│                                     │
│  ↓ Posts to                         │
│                                     │
│  Twitter/X API                      │
│  Discord (optional)                 │
│                                     │
└─────────────────────────────────────┘
```

## Next Steps

1. ✅ Code pushed to GitHub
2. ⏳ Go to Render dashboard and approve new service
3. ⏳ Configure environment variables
4. ⏳ Deploy and monitor logs
5. ⏳ Verify first posts are successful

Your AI quote scheduler is ready to deploy! 🚀
