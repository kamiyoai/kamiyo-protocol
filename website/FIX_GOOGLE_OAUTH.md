# Fix Google OAuth Error

## 🚨 Current Issue

When signing in with Google, users are redirected back to the signin page with `?error=google` parameter.

## 🔍 Root Cause

The error `?error=google` indicates a Google OAuth configuration problem. Most likely one of:

1. **Redirect URI mismatch** - The most common cause
2. **Invalid Google Client ID or Secret**
3. **OAuth consent screen not configured properly**

## ✅ Step-by-Step Fix

### Step 1: Verify Google Cloud Console Settings

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID (the one with ID: `258771482547-mooavqco7lr8ebaneos4aes5rjrttpnm`)
3. Click on it to edit

### Step 2: Check Authorized Redirect URIs

**CRITICAL:** The redirect URI must match EXACTLY. Add both:

```
https://kamiyo.ai/api/auth/callback/google
http://localhost:3001/api/auth/callback/google
```

**Common mistakes:**
- ❌ `https://kamiyo.ai/api/auth/callback/google/` (trailing slash)
- ❌ `https://www.kamiyo.ai/api/auth/callback/google` (www subdomain)
- ❌ `http://kamiyo.ai/api/auth/callback/google` (http instead of https)
- ✅ `https://kamiyo.ai/api/auth/callback/google` (CORRECT)

### Step 3: Verify OAuth Consent Screen

1. In Google Cloud Console, go to: **APIs & Services** → **OAuth consent screen**
2. Ensure:
   - App name is set
   - User support email is set
   - Developer contact email is set
   - App is published (or you're testing with the Google account listed in test users)

### Step 4: Check Render Environment Variables

Verify these on Render (kamiyo-frontend service):

```bash
# Must match Google Cloud Console
GOOGLE_CLIENT_ID=258771482547-mooavqco7lr8ebaneos4aes5rjrttpnm.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your_secret_here>

# Must match your domain exactly
NEXTAUTH_URL=https://kamiyo.ai

# Must be set to any random string
NEXTAUTH_SECRET=<your_secret_here>
```

### Step 5: Test the Fix

After making changes:

1. **Google Cloud Console changes**: Take effect immediately (no restart needed)
2. **Render environment variable changes**: Require redeploy

To redeploy on Render:
1. Go to kamiyo-frontend service
2. Click **Manual Deploy** → **Clear build cache & deploy**
3. Wait ~3-5 minutes

### Step 6: Verify it's working

1. Open browser in incognito mode
2. Go to https://kamiyo.ai
3. Click "Sign In"
4. Click the scramble button "Continue with Google"
5. You should be redirected to Google (not back to signin)
6. After authorizing, you should land on `/dashboard`

## 🔬 Debugging

### Check what Google sees

Run this to see the OAuth authorization URL:

```bash
curl -sS 'https://kamiyo.ai/api/auth/signin/google' -I | grep location
```

The redirect_uri parameter should be: `https%3A%2F%2Fkamiyo.ai%2Fapi%2Fauth%2Fcallback%2Fgoogle`

(URL-encoded version of: `https://kamiyo.ai/api/auth/callback/google`)

### Check Render logs during sign-in

1. Go to Render Dashboard → kamiyo-frontend → Logs
2. Try to sign in while watching logs
3. Look for errors like:
   - `GOOGLE_CLIENT_ID is not defined`
   - `GOOGLE_CLIENT_SECRET is not defined`
   - `redirect_uri_mismatch`
   - Any Prisma/Database errors

### Browser Console Errors

1. Open https://kamiyo.ai
2. Open Developer Tools (F12)
3. Go to Console tab
4. Try to sign in
5. Look for JavaScript errors or network failures

## 📋 Checklist

- [ ] Google Cloud Console → Authorized redirect URIs includes `https://kamiyo.ai/api/auth/callback/google`
- [ ] OAuth consent screen is fully configured
- [ ] GOOGLE_CLIENT_ID on Render matches Google Cloud Console
- [ ] GOOGLE_CLIENT_SECRET on Render matches Google Cloud Console
- [ ] NEXTAUTH_URL on Render is exactly `https://kamiyo.ai`
- [ ] NEXTAUTH_SECRET on Render is set to a random string
- [ ] Cleared build cache and redeployed on Render
- [ ] Tested sign-in in incognito mode

## 🎯 Expected Behavior After Fix

1. ✅ Click "Continue with Google" on signin page
2. ✅ Redirected to Google authorization page
3. ✅ After authorizing, redirected back to kamiyo.ai
4. ✅ Logged in and redirected to /dashboard
5. ✅ Session persists across page refreshes
6. ✅ No `?error=google` parameter in URL

## 💡 Still Not Working?

### Option 1: Generate New OAuth Credentials

If the credentials are corrupted:

1. Go to Google Cloud Console
2. Create a NEW OAuth 2.0 Client ID
3. Set the redirect URIs correctly
4. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render
5. Redeploy

### Option 2: Enable Debug Mode

Temporarily enable NextAuth debug mode to see detailed errors:

In `pages/api/auth/[...nextauth].js`, change:
```javascript
debug: process.env.NODE_ENV === 'development',
```

To:
```javascript
debug: true,  // TEMPORARY - for debugging only
```

Then check Render logs while trying to sign in.

**Remember to change it back after debugging!**

## 📞 Quick Test

Run this command to test if NextAuth is configured correctly:

```bash
curl -sS 'https://kamiyo.ai/api/auth/providers'
```

Expected response:
```json
{
  "google": {
    "id": "google",
    "name": "Google",
    "type": "oauth",
    "signinUrl": "https://kamiyo.ai/api/auth/signin/google",
    "callbackUrl": "https://kamiyo.ai/api/auth/callback/google"
  }
}
```

If you see this, NextAuth is configured. The issue is likely the redirect URI mismatch in Google Cloud Console.

---

**Most likely fix:** Add `https://kamiyo.ai/api/auth/callback/google` to Google Cloud Console Authorized redirect URIs.
