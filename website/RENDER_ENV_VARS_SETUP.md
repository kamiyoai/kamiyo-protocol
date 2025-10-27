# Render Environment Variables Setup

## KAMIYO_API_KEY - Retrieved ✅

Your enterprise tier API key with real-time access:

```
kmy_1895e93afcd452d9ad7b8fd9541cccaf7efde35134525e9a81333944497bc11c
```

**Subscription tier:** Enterprise (no 24h delay)
**Status:** Active
**Created:** October 15, 2025

## ANTHROPIC_API_KEY - Required ⏳

You need to add your Claude API key for deep dive thread generation.

Get your key from: https://console.anthropic.com/settings/keys

## Setup Instructions

### 1. Go to Render Dashboard
https://dashboard.render.com

### 2. Navigate to kamiyo-social-bot service

### 3. Click on "Environment" tab

### 4. Add these secret environment variables:

```bash
KAMIYO_API_KEY=kmy_1895e93afcd452d9ad7b8fd9541cccaf7efde35134525e9a81333944497bc11c
ANTHROPIC_API_KEY=<your-claude-api-key-here>
```

### 5. Save Changes

Render will automatically redeploy the service with the new environment variables.

## Verify It's Working

After the service redeploys, check the logs for:

```
INFO - Fetched 3 recent exploits from Kamiyo API
INFO - Major exploit detected ($2,500,000) - generating deep dive thread
INFO - Using Claude AI to generate deep dive thread for ProtocolName
INFO - Successfully posted exploit to 2 platforms
```

Instead of:

```
INFO - Fetched 0 recent exploits from Kamiyo API
```

## What This Fixes

**Before:** Watcher fetches 0 exploits (caught by 24h free tier delay)
**After:** Watcher fetches real-time exploits with enterprise access

**Before:** No posts because no exploits to process
**After:** Automatic Claude-enhanced deep dive posts when exploits >= $1M occur

## Files Modified

1. `render.yaml` - Added KAMIYO_API_KEY and ANTHROPIC_API_KEY configuration
2. `SOCIAL_WATCHER_FIX.md` - Detailed problem analysis
3. `components/FAQ.js` - Updated FAQs to reflect aggregator model
4. This file - Setup instructions
