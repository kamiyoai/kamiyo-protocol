# RENDER.COM Environment Variables Not Loading

**Status:** Environment variables confirmed missing from Next.js deployment
**Test Result:** All three Stripe price IDs return `false`

---

## 🔴 Problem Confirmed

Test response from production:
```json
{
  "error": "Invalid tier. Valid tiers: personal, team, enterprise",
  "debug": {
    "tier": "personal",
    "hasPersonalPrice": false,
    "hasTeamPrice": false,
    "hasEnterprisePrice": false
  }
}
```

**All three values are `false` - environment variables are NOT loaded.**

---

## 🎯 Root Cause

The billing endpoint is a **Next.js API route** at:
```
/pages/api/billing/create-checkout-session.js
```

This runs on your **Next.js frontend service**, NOT the Python backend service.

You mentioned adding variables to "frontend and backend (api) render.com service", but the issue is:
- The billing endpoint needs these variables on the **Next.js/frontend service**
- They may have been added to the wrong service or with incorrect names

---

## ✅ Required Environment Variables

Add these to your **Next.js web service** on Render.com:

```bash
# Stripe Price IDs (from .env file)
STRIPE_PRICE_MCP_PERSONAL=price_1SNKvLCvpzIkQ1SiPz4PV1F3
STRIPE_PRICE_MCP_TEAM=price_1SNKvYCvpzIkQ1SivEyVtu2z
STRIPE_PRICE_MCP_ENTERPRISE=price_1SNKvbCvpzIkQ1Siq0A9D7Ry

# Stripe Keys (also needed)
STRIPE_SECRET_KEY=sk_live_...  # or sk_test_... for testing
STRIPE_PUBLISHABLE_KEY=pk_live_...  # or pk_test_...

# NextAuth (if not already set)
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=https://kamiyo.ai
NEXT_PUBLIC_URL=https://kamiyo.ai
```

---

## 📋 Step-by-Step Fix

### 1. Identify Your Next.js Service
Log into Render.com and find the service that deploys your Next.js app:
- Look for the service with build command like `npm run build` or `next build`
- **NOT** the service running your Python API

### 2. Add Environment Variables
1. Go to that service → **Environment** tab
2. Click **Add Environment Variable**
3. Add each variable **exactly as shown above**
4. Variable names are case-sensitive and must match exactly

### 3. Verify Variable Names
Common mistakes:
- ❌ `STRIPE_PRICE_PERSONAL` (missing `_MCP`)
- ✅ `STRIPE_PRICE_MCP_PERSONAL` (correct)
- ❌ Extra spaces in values
- ❌ Quotes around values (don't add quotes)

### 4. Trigger Redeploy
- Render.com should auto-redeploy when you save environment variables
- If not, click **Manual Deploy** → **Deploy latest commit**

### 5. Wait for Deployment
Monitor the build hash:
```bash
curl -s https://kamiyo.ai/ | grep -o '_app-[a-f0-9]*\.js' | head -1
```

Current hash: `_app-3ca6262c5e59c1e3.js`
Wait for it to change (usually 2-5 minutes)

### 6. Test Again
```bash
curl -s -X POST https://kamiyo.ai/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"tier":"personal","user_email":"test@example.com"}'
```

**Expected result after fix:**
```json
{
  "debug": {
    "tier": "personal",
    "hasPersonalPrice": true,   ← Should be true
    "hasTeamPrice": true,        ← Should be true
    "hasEnterprisePrice": true   ← Should be true
  }
}
```

---

## 🔍 Troubleshooting

### If still shows `false` after adding variables:

**Check 1: Correct Service**
- The variables MUST be on the **Next.js frontend service**
- NOT on the Python API backend service

**Check 2: Variable Names**
- Must be **exactly**: `STRIPE_PRICE_MCP_PERSONAL` (not `STRIPE_PRICE_PERSONAL`)
- Check for typos in all three variable names

**Check 3: Deployment Completed**
- Build hash must change after saving env vars
- Check Render.com logs for successful deployment

**Check 4: Server Logs**
Check your Render.com service logs for:
```
[Billing Debug] Price Map: { personal: 'SET', team: 'SET', enterprise: 'SET' }
```

If you see `MISSING` in the logs, the variables aren't loading.

---

## 📸 Screenshot Checklist

If the issue persists, take screenshots of:
1. Render.com dashboard showing your services (to identify which is Next.js)
2. Environment variables tab for the Next.js service
3. The exact variable names and their values (blur the actual IDs)
4. Deployment logs showing successful build

---

## 🎯 Quick Verification

Once fixed, visit https://kamiyo.ai/pricing and:
1. Click "Subscribe - $19/mo"
2. Should redirect to Stripe checkout (not 400 error)
3. Check browser DevTools console - no errors

---

**Current Status:** Waiting for environment variables to be added to the correct Render.com service.
