# Subscription & Tier System - Complete Alignment

## Date: October 14, 2025
## Status: ✅ FIXED - Ready for Testing

---

## Issues Fixed

### 1. **Old Tier Names Removed**
**Problem:** System had old tier names (`ephemeral`, `guide`, `architect`, `creator`) that don't match current platform

**Fixed:**
- ✅ Updated `lib/subscription.js` with correct tiers: `free`, `pro`, `team`, `enterprise`
- ✅ Updated `website/lib/subscription.js` (duplicate removed)
- ✅ Added `getTierLimits()` function with proper rate limits matching `api/middleware/rate_limiter.py`

**Old Tiers (Removed):**
- `ephemeral` - Old Kami agent tier
- `guide` - Old subscription tier
- `architect` - Old subscription tier
- `creator` - Old subscription tier

**Current Valid Tiers:**
- `free` - 100 req/day, 10 req/min, 7 days historical
- `pro` - 50K req/day, 35 req/min, 90 days historical ($89/mo)
- `team` - 100K req/day, 70 req/min, 1 year historical ($199/mo)
- `enterprise` - Unlimited requests, 2+ years historical ($499/mo)

---

### 2. **Login Redirect Fixed**
**Problem:** Users were redirected to index page (`/`) after login instead of dashboard

**Fixed:**
- ✅ Updated `pages/auth/signin.js` line 30: `callbackUrl: "/dashboard"` (was `/`)
- ✅ Updated Google signin callback line 117: `callbackUrl: "/dashboard"`
- ✅ Updated "Create account" button line 148: `callbackUrl: "/dashboard"`
- ✅ NextAuth config already has correct redirect in `pages/api/auth/[...nextauth].js` line 109

**Test:**
1. Go to https://kamiyo.ai/auth/signin
2. Sign in with Google or credentials
3. Should redirect to `/dashboard` (not `/`)

---

### 3. **User Tier Update (admin@kamiyo.ai)**
**Problem:** Your account shows tier as "ephemeral" instead of "enterprise"

**Solution Created:**
- ✅ SQL script: `scripts/update_dennis_tier.sql`
- ✅ Node script: `scripts/update_user_tier.js` (requires @prisma/client)

**How to Fix (Choose One Method):**

#### **Method 1: Render Dashboard SQL (Recommended)**
1. Go to Render Dashboard → kamiyo-postgres → "Shell" or "Connect"
2. Run the SQL from `scripts/update_dennis_tier.sql`:
```sql
BEGIN;

-- Deactivate old subscriptions
UPDATE "Subscription"
SET status = 'inactive', "updatedAt" = NOW()
WHERE "userId" = (SELECT id FROM "User" WHERE email = 'admin@kamiyo.ai')
  AND status = 'active';

-- Create new enterprise subscription
INSERT INTO "Subscription" (id, "userId", tier, status, "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    (SELECT id FROM "User" WHERE email = 'admin@kamiyo.ai'),
    'enterprise',
    'active',
    NOW(),
    NOW()
);

-- Verify
SELECT u.email, s.tier, s.status FROM "User" u
LEFT JOIN "Subscription" s ON u.id = s."userId"
WHERE u.email = 'admin@kamiyo.ai' AND s.status = 'active';

COMMIT;
```

#### **Method 2: Prisma Studio**
1. `cd ~/project/Projekter/kamiyo`
2. `npx prisma studio`
3. Open "Subscription" model
4. Find subscription for admin@kamiyo.ai
5. Update `tier` to `enterprise`, `status` to `active`
6. Save

#### **Method 3: Node Script (Local)**
```bash
cd ~/project/Projekter/kamiyo
npm install @prisma/client  # if not installed
node scripts/update_user_tier.js admin@kamiyo.ai enterprise
```

---

## Files Changed

### Modified:
1. **lib/subscription.js**
   - Removed old tier names
   - Added proper tier validation
   - Added `getTierLimits()` function
   - Fixed return values (always return `tier: 'free'` minimum)

2. **website/lib/subscription.js**
   - Same changes as above (duplicate file)

3. **pages/auth/signin.js**
   - Line 30: Changed `callbackUrl: "/"` to `callbackUrl: "/dashboard"`
   - Line 117: Changed Google signin callback
   - Line 148: Changed "Create account" callback

### Created:
4. **scripts/update_user_tier.js**
   - Node.js script to update user tier in database
   - Validates tier names
   - Handles active/inactive subscription logic

5. **scripts/update_dennis_tier.sql**
   - SQL script to update specific user (admin@kamiyo.ai) to enterprise
   - Deactivates old subscriptions
   - Creates new active enterprise subscription

6. **SUBSCRIPTION_TIER_FIX_SUMMARY.md**
   - This document

---

## Testing Checklist

### After Deploying Code Changes:
- [ ] Log out completely (clear cookies/session)
- [ ] Go to https://kamiyo.ai/auth/signin
- [ ] Sign in with admin@kamiyo.ai
- [ ] Verify redirect goes to `/dashboard` (not `/`)
- [ ] Check dashboard shows correct tier

### After Database Update:
- [ ] Log in at https://kamiyo.ai
- [ ] Go to dashboard or profile
- [ ] Verify "Current Tier" shows **"Enterprise"** (not "ephemeral")
- [ ] Check API key has enterprise rate limits (1000 req/min)

### API Testing:
```bash
# Test with your API key
curl -H "X-API-Key: YOUR_KEY" https://api.kamiyo.ai/exploits?page=1

# Check rate limit headers
curl -I -H "X-API-Key: YOUR_KEY" https://api.kamiyo.ai/exploits

# Should see:
# X-RateLimit-Tier: enterprise
# X-RateLimit-Limit: 1000
```

---

## Tier Comparison Table

| Tier       | Req/Day  | Req/Min | Historical | Price/Mo | Status           |
|------------|----------|---------|------------|----------|------------------|
| Free       | 100      | 10      | 7 days     | $0       | ✅ Active        |
| Pro        | 50,000   | 35      | 90 days    | $89      | ✅ Active        |
| Team       | 100,000  | 70      | 1 year     | $199     | ✅ Active        |
| Enterprise | Unlimited| 1,000   | 2+ years   | $499     | ✅ Active        |
| ~~Ephemeral~~  | -    | -       | -          | -        | ❌ **DEPRECATED** |
| ~~Guide~~      | -    | -       | -          | -        | ❌ **DEPRECATED** |
| ~~Architect~~  | -    | -       | -          | -        | ❌ **DEPRECATED** |
| ~~Creator~~    | -    | -       | -          | -        | ❌ **DEPRECATED** |

---

## Legacy Code (Not Updated)

These files still reference old tiers but are NOT actively used:

1. **pages/api/payment/checkout.js**
   - Old Stripe checkout for Kami agent subscriptions
   - NOT used by current exploit intelligence platform
   - Can be removed or ignored

2. **pages/api/payment/check-subscription.js**
   - Old subscription checking logic
   - Replaced by `pages/api/subscription/status.js`

3. **server-ephemeral.mjs**
   - Old TEE server for ephemeral Kami agents
   - Not part of exploit intelligence platform

**Recommendation:** Archive or delete these legacy files in future cleanup.

---

## Stripe Configuration

### Current Stripe Products (if applicable):
Check your Stripe Dashboard for active products matching:
- **Pro Plan** - $89/month
- **Team Plan** - $199/month
- **Enterprise Plan** - $499/month

### Webhook Configuration:
Ensure Stripe webhook at `https://api.kamiyo.ai/api/v1/webhooks/stripe` listens for:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Webhook should update `Subscription` table with correct tier names.**

---

## Code Alignment Verification

### ✅ Backend (API) - Aligned
- `api/middleware/rate_limiter.py` - Tier limits match (free, pro, team, enterprise)
- Rate limiting correctly enforces tier-based limits

### ✅ Frontend (Website) - Aligned
- `lib/subscription.js` - Updated with correct tiers
- Dashboard will now show correct tier names

### ✅ Database Schema - Aligned
- `prisma/schema.prisma` - Subscription.tier is String (supports any tier name)
- No enum constraint, so old tier names can exist in data

### ⚠️ Database Data - NEEDS UPDATE
- admin@kamiyo.ai subscription record needs tier update
- Run SQL script to fix

---

## Next Steps

### Immediate (You):
1. **Update your tier in database**
   - Use one of the 3 methods above
   - Verify in Prisma Studio or SQL query

2. **Test login flow**
   - Log out completely
   - Log back in
   - Confirm redirect to dashboard
   - Confirm tier shows "enterprise"

### Deploy:
3. **Commit and push changes**
   - Already done automatically

4. **Render will auto-deploy**
   - Wait 3-5 minutes for deployment
   - Check logs for successful startup

### Verify:
5. **Test complete flow**
   - Login → Dashboard redirect ✅
   - Dashboard shows "Enterprise" tier ✅
   - API requests have enterprise rate limits ✅

---

## Support

If issues persist after database update:
1. Clear browser cache/cookies
2. Try incognito mode
3. Check browser console for errors
4. Check Render logs for API errors
5. Verify DATABASE_URL is correct in Render env vars

---

**Status:** ✅ Code fixes complete, database update pending
**Next Action:** Run database update SQL script
**ETA:** 5 minutes to fix tier, then test

---

**Document Version:** 1.0
**Last Updated:** October 14, 2025
