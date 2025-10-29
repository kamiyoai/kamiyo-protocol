# Billing 400 Error - Root Cause Identified ✅

**Status:** Environment variables confirmed missing
**Date:** 2025-10-29
**Current Build:** `_app-3ca6262c5e59c1e3.js`

---

## 🎯 Root Cause Identified

**The Stripe environment variables are NOT being loaded by your Next.js application on Render.com.**

Test confirmation:
```json
{
  "debug": {
    "hasPersonalPrice": false,
    "hasTeamPrice": false,
    "hasEnterprisePrice": false
  }
}
```

All three values return `false` - the variables are not available to the Next.js process.

---

## 🔧 The Fix (3 Steps)

### Step 1: Identify Your Next.js Service on Render.com

The billing endpoint at `/pages/api/billing/create-checkout-session.js` is a **Next.js API route**, which means it runs on your **Next.js frontend service**, NOT the Python backend.

**Find the service that:**
- Has build command: `npm run build` or `next build`
- Has start command: `npm start` or `next start`
- Serves your frontend at `https://kamiyo.ai`

### Step 2: Add These Exact Variables

Go to that service → **Environment** tab → Add these variables:

```bash
STRIPE_PRICE_MCP_PERSONAL=price_1SNKvLCvpzIkQ1SiPz4PV1F3
STRIPE_PRICE_MCP_TEAM=price_1SNKvYCvpzIkQ1SivEyVtu2z
STRIPE_PRICE_MCP_ENTERPRISE=price_1SNKvbCvpzIkQ1Siq0A9D7Ry
```

**Critical:**
- Variable names must be **exactly** as shown (case-sensitive)
- No quotes around the values
- No extra spaces

### Step 3: Verify the Fix

After Render.com redeploys (2-5 minutes), run:

```bash
/tmp/verify_billing.sh
```

This will test the endpoint and show you if the variables are loaded.

**Expected output after fix:**
```
✅ SUCCESS: All environment variables are loaded!
```

---

## 📋 Quick Checklist

- [ ] Log into Render.com dashboard
- [ ] Find the Next.js frontend service (NOT the Python API)
- [ ] Go to Environment tab
- [ ] Add all three `STRIPE_PRICE_MCP_*` variables with exact names
- [ ] Wait for auto-redeploy (check build hash changes)
- [ ] Run `/tmp/verify_billing.sh` to confirm
- [ ] Test at https://kamiyo.ai/pricing

---

## 🚨 Common Mistakes to Avoid

1. ❌ Adding variables to the wrong service (Python backend instead of Next.js frontend)
2. ❌ Wrong variable names (missing `_MCP` in the name)
3. ❌ Adding quotes around values (don't do this)
4. ❌ Not waiting for redeployment to complete

---

## 📝 Why This Happened

- The `.env` file exists locally and works in development
- `.env` files are in `.gitignore` and NOT deployed to production
- Environment variables must be configured in Render.com's dashboard
- You mentioned adding them to "frontend and backend", but the issue suggests:
  - They may have been added to the Python backend service only
  - Or they were named incorrectly

---

## 📊 Technical Details

**Endpoint:** `pages/api/billing/create-checkout-session.js`
**Type:** Next.js API route (server-side, runs on frontend service)
**Required variables:**
- `STRIPE_PRICE_MCP_PERSONAL` - Personal tier ($19/mo)
- `STRIPE_PRICE_MCP_TEAM` - Team tier ($99/mo)
- `STRIPE_PRICE_MCP_ENTERPRISE` - Enterprise tier ($299/mo)

**How it works:**
1. User clicks "Subscribe" button
2. Frontend sends POST to `/api/billing/create-checkout-session`
3. Next.js API route reads `process.env.STRIPE_PRICE_MCP_*`
4. Creates Stripe checkout session
5. Returns checkout URL to redirect user

**Current issue:**
- Step 3 fails because `process.env.STRIPE_PRICE_MCP_*` is `undefined`
- Returns 400 error with debug info showing all `false`

---

## 🔍 Verification Tools

**Check current status:**
```bash
/tmp/verify_billing.sh
```

**Monitor deployment:**
```bash
watch -n 10 'curl -s https://kamiyo.ai/ | grep -o "_app-[a-f0-9]*\.js" | head -1'
```

**Manual test:**
```bash
curl -s -X POST https://kamiyo.ai/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"tier":"personal","user_email":"test@example.com"}'
```

---

## 📚 Documentation References

- Full fix guide: `RENDER_ENV_VARS_FIX.md`
- Previous fixes: `FIXES_APPLIED.md`
- Debug instructions: `DEBUG_INSTRUCTIONS.md`
- Test script: `/tmp/quick_test.sh`
- Verification script: `/tmp/verify_billing.sh`

---

## ✅ Success Criteria

After fixing, you should see:

1. **In terminal:**
   ```
   ✅ SUCCESS: All environment variables are loaded!
   ```

2. **In browser (kamiyo.ai/pricing):**
   - Click "Subscribe - $19/mo"
   - Redirected to Stripe checkout page
   - No 400 errors in console

3. **In API response:**
   ```json
   {
     "debug": {
       "hasPersonalPrice": true,
       "hasTeamPrice": true,
       "hasEnterprisePrice": true
     }
   }
   ```

---

**Next Action:** Add the three environment variables to your Next.js service on Render.com and run `/tmp/verify_billing.sh` after redeployment.
