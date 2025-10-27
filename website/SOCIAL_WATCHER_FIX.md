# Social Watcher - API Key Fix Required

## Problem Identified

The **kamiyo-social-bot** service on Render is running 24/7 as configured, but **fetching 0 exploits** from the API.

### Root Cause

The watcher is making **unauthenticated API requests** and getting caught by the **24-hour free tier delay filter**.

From logs:
```
2025-10-20 11:15:06,238 - social.kamiyo_watcher - INFO - Fetched 0 recent exploits from Kamiyo API
```

### Why This Happens

1. **API has 424 total exploits** (confirmed via `/health` endpoint)
2. **Without authentication**, the API applies a 24-hour delay filter (api/main.py:262-287)
3. **Recent exploits (< 24h old)** are filtered out for free tier users
4. **Watcher gets empty array** and has nothing to post
5. **No deep dive posts** are generated, even when exploits >= $1M exist

### The Fix

The `KAMIYO_API_KEY` environment variable was **missing** from render.yaml for the social bot service.

**Changes made:**
- Added `KAMIYO_API_KEY` (sync: false) to render.yaml line 111-114
- Added `ANTHROPIC_API_KEY` (sync: false) for Claude AI deep dive threads
- Added documentation comments explaining the importance

## Action Required

### In Render Dashboard:

1. Go to https://dashboard.render.com
2. Navigate to **kamiyo-social-bot** service
3. Go to **Environment** tab
4. Add the following secrets:

```bash
KAMIYO_API_KEY=<your-pro-tier-api-key>
ANTHROPIC_API_KEY=<your-claude-api-key>
```

### Generate API Key:

If you don't have a Pro tier API key yet, you need to:

1. Create a Pro tier subscription for the social bot "user"
2. Generate an API key with real-time access
3. The key must have a subscription tier that bypasses the 24h delay

### After Setting Keys:

1. Render will automatically redeploy the service
2. Watcher will start fetching real-time exploits
3. Deep dive posts (>= $1M) will be generated with Claude AI
4. Posts will go to Twitter/X and Discord automatically

## How to Verify It's Working

After adding the API keys, check the logs:

```bash
# Should see exploits being fetched:
INFO - Fetched 3 recent exploits from Kamiyo API

# Should see deep dive analysis:
INFO - Major exploit detected ($2,500,000) - generating deep dive thread
INFO - Using Claude AI to generate deep dive thread for ProtocolName

# Should see successful posts:
INFO - Successfully posted exploit to 2 platforms
```

## Current Configuration

- **Polling interval**: 300 seconds (5 minutes)
- **Minimum amount**: $1,000,000 USD
- **Deep dive threshold**: $1,000,000 USD (all posts >= min are deep dives)
- **Max posts per cycle**: 3 exploits every 5 minutes
- **Enabled platforms**: Twitter/X, Discord
- **Claude AI**: Enabled for deep dive thread generation

## Recent Statistics

From production API:
- **Total exploits**: 424
- **Last 30 days**: 11 exploits, $45.8M total losses
- **Average per exploit**: ~$4.2M
- **Chains tracked**: 55
- **Sources**: 75

Most recent exploits have been **< $1M**, which is why no posts occurred.
But when a >= $1M exploit happens, the system is ready to post automatically.

## Files Modified

- `render.yaml` (lines 111-118): Added KAMIYO_API_KEY and ANTHROPIC_API_KEY
- `components/FAQ.js`: Updated FAQs to accurately reflect aggregator model
- This documentation file

## Next Steps

1. ✅ render.yaml updated with API key configuration
2. ⏳ Set KAMIYO_API_KEY in Render dashboard (ACTION REQUIRED)
3. ⏳ Set ANTHROPIC_API_KEY in Render dashboard (ACTION REQUIRED)
4. ⏳ Service will auto-redeploy after env vars are set
5. ⏳ Wait for next >= $1M exploit to test automatic posting
