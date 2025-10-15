# Fork Analysis Demo Data Fallback - Fix Guide

## Problem

When logged in as an Enterprise user, the `/fork-analysis` page shows:

> ⚠️ Demo Data Fallback
> Unable to load real fork detection data from API. Displaying demo data for visualization purposes.

## Root Cause

The `NEXT_PUBLIC_API_URL` environment variable is **not set** in the production environment.

### Technical Details

The fork-analysis page uses a Next.js API proxy at `/pages/api/analysis/fork-families.js` that:

1. Receives the user's email from the frontend
2. Looks up the user's active API key in the database
3. Forwards the request to the FastAPI backend with Bearer token authentication

**The proxy code (line 53 in `/pages/api/analysis/fork-families.js`):**

```javascript
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const backendUrl = `${apiUrl}/api/v2/analysis/fork-families${params.toString() ? '?' + params.toString() : ''}`;
```

**Without `NEXT_PUBLIC_API_URL` set:**
- The proxy defaults to `http://localhost:8000`
- In production, `localhost:8000` is not accessible
- The request fails, triggering the demo data fallback

## Solution

### Important Note: render.yaml Already Configures This!

Looking at `/render.yaml`, the `NEXT_PUBLIC_API_URL` variable is **already configured** to auto-inject:

```yaml
- key: NEXT_PUBLIC_API_URL
  fromService:
    type: web
    name: kamiyo-api
    envVarKey: RENDER_EXTERNAL_URL
```

This means Render should automatically set `NEXT_PUBLIC_API_URL` to the `kamiyo-api` service's external URL.

**If you're still seeing the demo data fallback, the issue is likely:**

1. **The frontend hasn't been redeployed recently** (may have stale env vars)
2. **The kamiyo-api service is not running** or has a different name
3. **The auto-injection is not working** (Render configuration issue)

### Step 1: Verify and Fix in Production

#### Option A: Redeploy Frontend (Try This First)

The simplest solution is to trigger a redeploy of the frontend service:

1. **Log in to Render Dashboard**
2. **Navigate to `kamiyo-frontend` service**
3. **Click "Manual Deploy" → "Deploy latest commit"**
4. **Wait for deployment to complete** (~2-3 minutes)
5. **Test the fork-analysis page**

#### Option B: Verify Auto-Injection is Working

Check if the variable is being injected correctly:

1. **Log in to Render Dashboard**
2. **Navigate to `kamiyo-frontend` service**
3. **Go to the `Environment` tab**
4. **Look for `NEXT_PUBLIC_API_URL`**
   - If it shows: `https://kamiyo-api.onrender.com` or similar → ✅ Working
   - If it's missing or shows an error → ❌ Fix needed

#### Option C: Manual Override (If Auto-Injection Fails)

If the auto-injection isn't working, manually set the variable:

1. **Log in to Render Dashboard**
2. **Navigate to `kamiyo-frontend` service**
3. **Go to the `Environment` tab**
4. **Add a new environment variable:**
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://api.kamiyo.ai` (or your actual API URL)
5. **Click "Save Changes"**
6. **The service will automatically redeploy** (takes ~2-3 minutes)

#### For Vercel:

```bash
vercel env add NEXT_PUBLIC_API_URL production
# Enter value: https://api.kamiyo.ai
```

Or via Vercel Dashboard:
1. Project Settings → Environment Variables
2. Add: `NEXT_PUBLIC_API_URL` = `https://api.kamiyo.ai`
3. Redeploy

#### For Other Platforms:

Set the environment variable in your platform's dashboard or configuration:

```bash
export NEXT_PUBLIC_API_URL=https://api.kamiyo.ai
```

### Step 2: Verify the Fix

After the redeployment completes:

1. **Clear your browser cache** (or open in incognito mode)
2. **Log in to https://kamiyo.ai**
3. **Navigate to https://kamiyo.ai/fork-analysis**
4. **Expected result:** Real fork detection data loads (no demo data warning)

### Step 3: Troubleshooting

If you still see the demo data warning after setting the variable:

#### Check 1: Verify Environment Variable

SSH into your production server or check your platform's dashboard:

```bash
# Verify the variable is set
echo $NEXT_PUBLIC_API_URL
# Should output: https://api.kamiyo.ai
```

#### Check 2: Check API Key Exists

Verify your user has an active API key in the database:

```bash
node scripts/check-database-simple.js
# Look for your email and verify you have an active API key
```

If no API key exists, generate one:

```bash
node scripts/generate-all-api-keys.js
```

#### Check 3: Test API Proxy Directly

Test the proxy endpoint directly:

```bash
curl "https://kamiyo.ai/api/analysis/fork-families?email=your-email@example.com" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Expected responses:**
- ✅ **200 OK** with fork families data → Working correctly
- ❌ **401** "No active API key found" → Run API key generation script
- ❌ **500** "Backend API request failed" → Check FastAPI backend is running
- ❌ **404** "User not found" → Verify email is correct

#### Check 4: Verify FastAPI Backend is Accessible

Test that the FastAPI backend is reachable:

```bash
curl https://api.kamiyo.ai/health
# Should return: {"status": "healthy"}
```

If this fails, the FastAPI backend service is down or not accessible.

## Files Modified

### Updated:
- `/website/.env.local.example` - Added `NEXT_PUBLIC_API_URL` with documentation

### Created:
- `/website/FORK_ANALYSIS_DEMO_DATA_FIX.md` - This guide

## Architecture Overview

```
┌─────────────────────────────────────┐
│  Browser                            │
│  (fork-analysis.js)                 │
│  User logged in as Enterprise       │
└────────────┬────────────────────────┘
             │ 1. fetch('/api/analysis/fork-families?email=...')
             │    (uses session cookie for auth)
             ▼
┌─────────────────────────────────────┐
│  Next.js API Proxy                  │
│  /pages/api/analysis/fork-families  │
│                                     │
│  2. Lookup user by email            │
│  3. Get active API key from DB      │
│  4. Build backend URL using         │
│     process.env.NEXT_PUBLIC_API_URL │
└────────────┬────────────────────────┘
             │ 5. fetch(NEXT_PUBLIC_API_URL + '/api/v2/analysis/fork-families', {
             │    headers: { Authorization: 'Bearer {apiKey}' }
             │ })
             ▼
┌─────────────────────────────────────┐
│  FastAPI Backend                    │
│  https://api.kamiyo.ai              │
│  /api/v2/analysis/fork-families     │
│                                     │
│  6. Validate API key                │
│  7. Check user tier (Team+)         │
│  8. Return fork families data       │
└─────────────────────────────────────┘
```

## Environment Variables Required

### Production (.env):

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# NextAuth Configuration
NEXTAUTH_URL=https://kamiyo.ai
NEXTAUTH_SECRET=your-nextauth-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# FastAPI Backend URL (THIS WAS MISSING!)
NEXT_PUBLIC_API_URL=https://api.kamiyo.ai
```

### Development (.env.local):

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/kamiyo_dev

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=development-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# FastAPI Backend URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Prevention

To prevent this issue in the future:

1. **Always check `.env.local.example`** before deployment
2. **Run environment variable validation:**
   ```bash
   ./scripts/validate_env.sh production
   ```
3. **Use infrastructure-as-code** (render.yaml) to declare all required variables
4. **Document all environment variables** in `/docs/PRODUCTION_ENV_SETUP.md`

## Related Documentation

- `/website/FORK_ANALYSIS_AUTH_FIX.md` - Original authentication fix
- `/website/AUTHENTICATION_DEPLOYMENT_COMPLETE.md` - API key system setup
- `/website/docs/PRODUCTION_ENV_SETUP.md` - Complete production environment guide
- `/website/.env.local.example` - Environment variables template

## Summary

**Issue:** Demo data fallback on fork-analysis page for Enterprise users

**Cause:** Missing `NEXT_PUBLIC_API_URL` environment variable in production

**Fix:** Set `NEXT_PUBLIC_API_URL=https://api.kamiyo.ai` in production environment

**Verification:** Log in → Navigate to /fork-analysis → No demo data warning

---

**Created:** 2025-10-15
**Status:** ✅ Fix Ready - Awaiting Production Deployment
**Action Required:** Set `NEXT_PUBLIC_API_URL` in production environment variables
