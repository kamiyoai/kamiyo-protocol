# Debugging Instructions - Billing 400 Error

**Status:** Debug logging added, awaiting deployment

---

## Changes Pushed (Commits 79316f3d, 77118f02)

### 1. Fixed Favicon 404
- Created `/public/favicon.ico` (copied from favicon.png)
- Stops browser 404 errors

### 2. Added Debug Logging to Billing Endpoint
Added comprehensive logging to `pages/api/billing/create-checkout-session.js`:

**Console Logs (Server-side):**
```
[Billing Debug] Requested tier: personal
[Billing Debug] Customer email: user@example.com
[Billing Debug] Price Map: { personal: 'SET', team: 'SET', enterprise: 'SET' }
```

**Error Response (Browser):**
If 400 error occurs, the response now includes:
```json
{
  "error": "Invalid tier. Valid tiers: personal, team, enterprise",
  "debug": {
    "tier": "personal",
    "hasPersonalPrice": true,
    "hasTeamPrice": true,
    "hasEnterprisePrice": true
  }
}
```

---

## Next Steps (After Deployment)

### Step 1: Wait for Deployment
Monitor build hash change:
```bash
watch -n 10 'curl -s https://kamiyo.ai/ | grep -o "_app-[a-f0-9]*\.js" | head -1'
```

Current hash: `_app-c1bd4f77cece1d46.js`
Expected: Different hash when deployment completes

### Step 2: Test Billing Flow
1. Visit https://kamiyo.ai/pricing
2. Open DevTools Console (F12)
3. Click "Subscribe - $19/mo" on Personal tier
4. **Check the error response in Console Network tab**

### Step 3: Analyze Debug Info

The 400 error response will show:

**Scenario A: Environment Variables ARE Loaded**
```json
{
  "debug": {
    "tier": "personal",
    "hasPersonalPrice": true,  ← Variables are loaded
    "hasTeamPrice": true,
    "hasEnterprisePrice": true
  }
}
```
→ If ALL are `true`, the issue is something else (Stripe API error, auth issue, etc.)

**Scenario B: Environment Variables NOT Loaded**
```json
{
  "debug": {
    "tier": "personal",
    "hasPersonalPrice": false,  ← Variables missing!
    "hasTeamPrice": false,
    "hasEnterprisePrice": false
  }
}
```
→ Environment variables aren't being loaded by the deployment platform

---

## Likely Root Cause

Based on agent analysis, the **most likely cause** is:

**Environment variables aren't configured in the deployment platform (e.g., Vercel, Netlify, Render)**

The `.env` file exists locally with:
```bash
STRIPE_PRICE_MCP_PERSONAL=price_1SNKvLCvpzIkQ1SiPz4PV1F3
STRIPE_PRICE_MCP_TEAM=price_1SNKvYCvpzIkQ1SivEyVtu2z
STRIPE_PRICE_MCP_ENTERPRISE=price_1SNKvbCvpzIkQ1Siq0A9D7Ry
```

But `.env` files are NOT deployed to production (they're in `.gitignore`).

**You MUST set these in your deployment platform's environment variables UI.**

---

## How to Fix (If Env Vars Missing)

### For Vercel:
1. Go to https://vercel.com/your-project/settings/environment-variables
2. Add each variable:
   - `STRIPE_PRICE_MCP_PERSONAL` = `price_1SNKvLCvpzIkQ1SiPz4PV1F3`
   - `STRIPE_PRICE_MCP_TEAM` = `price_1SNKvYCvpzIkQ1SivEyVtu2z`
   - `STRIPE_PRICE_MCP_ENTERPRISE` = `price_1SNKvbCvpzIkQ1Siq0A9D7Ry`
3. Redeploy

### For Render.com:
1. Go to Dashboard → Your Service → Environment
2. Add the three variables above
3. Save (auto-redeploys)

### For Netlify:
1. Site Settings → Build & Deploy → Environment Variables
2. Add the three variables
3. Trigger new deploy

---

## Verification Checklist

Once environment variables are set:

- [ ] Deployment completed with new build hash
- [ ] Favicon 404 errors gone
- [ ] Click Subscribe button
- [ ] Check error response in DevTools
- [ ] If debug shows all `true`, billing should work
- [ ] Should redirect to Stripe checkout page

---

## Additional Debug Info

If the debug shows `hasPersonalPrice: true` but still gets 400:

**Check server logs** for:
```
[Billing Debug] Requested tier: personal
[Billing Debug] Customer email: <email>
[Billing Debug] Price Map: { personal: 'SET', ... }
```

This will confirm the exact tier being sent and whether email is present.

---

## Quick Fix Summary

1. ✅ Fixed favicon 404
2. ✅ Added debug logging
3. ⏳ Waiting for deployment
4. ❓ Check if env vars are set in deployment platform
5. ➡️ Set env vars if missing
6. ✅ Test billing flow again

---

**Last Updated:** After commits 79316f3d, 77118f02
**Monitoring:** Deployment will auto-complete in ~2-5 minutes
