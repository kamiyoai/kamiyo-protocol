# Correct Twitter App Setup for Bot Posting

## Current Problem

Your app is configured for OAuth 2.0 with Integromat redirect URLs. This is for a different use case (user authorization flow). For a bot that posts to **your own account**, you need simpler setup.

---

## Correct Configuration

### 1. App Permissions (Most Important!)

Go to: **User authentication settings** → Edit

Set these:
- **App permissions**: ✅ **Read and Write** (NOT "Read only")
- Type of App: "Web App, Automated App or Bot" (this is fine)
- Callback/Redirect URL: Can be anything, even `http://localhost:8080` (not used for bot posting)
- Website URL: `https://kamiyo.ai` (just for display)

The key thing is: **Permissions MUST be "Read and Write"**

### 2. Get Your Tokens

After setting permissions to "Read and Write":

1. Go to **"Keys and tokens"** tab
2. You should see:
   ```
   Consumer Keys
   - API Key: FTrK9PbdXiWEnFKafkMwwr9B5 ✅ (you have this)
   - API Key Secret: 3zmsw9NPw8... ✅ (you have this)

   Authentication Tokens
   - Access Token: [CLICK "REGENERATE" HERE]
   - Access Token Secret: [WILL APPEAR AFTER REGENERATE]
   ```

3. Click **"Regenerate"** under "Access Token and Secret"
   - This ensures tokens match your new "Read and Write" permissions
   - Copy both immediately (shown only once)

---

## Why Integromat URLs Are Wrong

Integromat (now Make.com) is a separate automation service. Those redirect URLs are for:
- Users logging in through Make.com
- OAuth authorization flow
- Third-party app access

You DON'T need this because:
- Your bot posts as YOU (not as other users)
- You're using direct API authentication (not OAuth flow)
- No user authorization needed

---

## Simple Test

Once you have all 4 credentials, test locally:

```bash
export X_API_KEY="FTrK9PbdXiWEnFKafkMwwr9B5"
export X_API_SECRET="3zmsw9NPw8iJircJQQh7urdeh6oobyXsxUETrgAzIj45jzKbxy"
export X_ACCESS_TOKEN="[your new access token]"
export X_ACCESS_SECRET="[your new access token secret]"

python3 test_twitter_posting.py
```

If you see:
```
✅ Authenticated as @your_username
```

Then it's working! Add those to Render.

---

## Minimal Working Settings

If you want to keep it super simple:

**User authentication settings:**
```
App permissions: Read and Write ✅ CRITICAL
Type of App: Automated App or Bot
Callback URI: http://localhost:8080 (doesn't matter for bot posting)
Website URL: https://kamiyo.ai
```

Everything else (OAuth 2.0, Terms of Service, Privacy Policy) is **optional** for bot posting.

---

## What You're Building

You're NOT building:
- ❌ A service where users log in with Twitter
- ❌ An OAuth app that posts on behalf of others
- ❌ An integration requiring user authorization

You ARE building:
- ✅ A bot that posts to YOUR Twitter account
- ✅ Automated exploit alerts from YOUR account
- ✅ Direct API authentication (API keys + Access tokens)

This is much simpler and doesn't need OAuth redirect URLs.

---

## TL;DR - Quick Fix

1. **User authentication settings** → Edit
2. Set **App permissions** to **"Read and Write"** (critical!)
3. Save changes
4. Go to **"Keys and tokens"** tab
5. Click **"Regenerate"** under "Access Token and Secret"
6. Copy both tokens
7. Add to Render as `X_ACCESS_TOKEN` and `X_ACCESS_SECRET`
8. Done!

The Integromat URLs won't affect bot posting, but you can change them to `https://kamiyo.ai` if you want it to look cleaner.
