# Production Authentication Debug Guide

## ✅ Verified Working
- NextAuth configuration is correct
- Google OAuth provider is configured
- NEXTAUTH_URL is set to https://kamiyo.ai
- DATABASE_URL is updated with correct credentials
- Auth endpoints are responding (200/302 status codes)
- API backend database has 424 exploits

## 🔍 Likely Issues

### Issue 1: Prisma Client Not Regenerated After DATABASE_URL Change

When you update DATABASE_URL on Render, Prisma Client is built with the **old** connection string during build time.

**Fix:**
1. Go to Render Dashboard → kamiyo-frontend
2. Click **Manual Deploy** → **Clear build cache & deploy**
3. This will:
   - Clear the cached Prisma Client
   - Run `npx prisma generate` with new DATABASE_URL
   - Rebuild the app from scratch

### Issue 2: Multiple Prisma Client Instances

The current NextAuth config creates a new `PrismaClient()` on every request:

```javascript
const prisma = new PrismaClient(); // ❌ Creates new instance per import
```

**Fix:** Use a singleton pattern.

See fix below in "Recommended Fixes" section.

### Issue 3: Database Connection Pool Exhaustion

If Prisma is creating too many connections, the database might be rejecting new ones.

**How to check:**
1. Go to Render Dashboard → kamiyo-frontend → Logs
2. Look for errors like:
   - `Too many connections`
   - `Connection pool timeout`
   - `P1001: Can't reach database server`
   - `P2024: Timed out fetching a new connection`

### Issue 4: Session Callback Error

The session callback might be throwing an error silently.

**How to check:**
Look in Render logs for:
- `PrismaClient` errors
- `user is not defined`
- Any uncaught exceptions during auth

## 🛠️ Recommended Fixes

### Fix 1: Update NextAuth to Use Prisma Singleton

Create `/lib/prisma.js`:

```javascript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

Then update `/pages/api/auth/[...nextauth].js`:

```javascript
import prisma from '../../../lib/prisma'; // ✅ Use singleton instead
// Remove: const prisma = new PrismaClient();
```

### Fix 2: Add Error Handling to Session Callback

Update the session callback:

```javascript
async session({ session, user }) {
    try {
        if (user && user.id) {
            session.user.id = user.id;
        }
        return session;
    } catch (error) {
        console.error('❌ Session callback error:', error);
        // Return session even if error to avoid auth loop
        return session;
    }
}
```

### Fix 3: Add Debugging to signIn Callback

```javascript
async signIn({ user, account, profile, isNewUser }) {
    console.log('🔐 Sign-in attempt:', {
        email: user?.email,
        isNewUser,
        provider: account?.provider
    });

    try {
        if (isNewUser) {
            await createDefaultApiKey(user.id);
            console.log(`✅ API key created for: ${user.email}`);
        }
        return true;
    } catch (error) {
        console.error(`❌ Sign-in error for ${user?.email}:`, error);
        // Still allow sign-in even if API key fails
        return true;
    }
}
```

## 📝 Immediate Action Plan

### Step 1: Check Render Logs Right Now
1. Go to: https://dashboard.render.com
2. Navigate to: kamiyo-frontend → Logs
3. Try to sign in on https://kamiyo.ai
4. Watch the logs for errors in real-time
5. Look for keywords: `Prisma`, `Database`, `Error`, `Failed`

### Step 2: Clear Build Cache
1. Go to kamiyo-frontend service
2. Manual Deploy → **Clear build cache & deploy**
3. Wait for deployment (3-5 minutes)
4. Test sign-in again

### Step 3: If Still Failing, Apply Prisma Singleton Fix
1. Create the `lib/prisma.js` file (see above)
2. Update `pages/api/auth/[...nextauth].js` to use it
3. Commit and push
4. Deploy

### Step 4: Add Debugging (Temporary)
1. Add console.log statements to all callbacks
2. Deploy
3. Try to sign in
4. Check logs to see exactly where it's failing
5. Remove debug logs after finding the issue

## 🔬 Diagnostic Checklist

Run through this checklist:

- [ ] DATABASE_URL is set correctly on Render ✅ (verified from screenshot)
- [ ] NEXTAUTH_URL is https://kamiyo.ai ✅ (verified from API test)
- [ ] NEXTAUTH_SECRET is set ✅ (verified from screenshot)
- [ ] GOOGLE_CLIENT_ID is set ✅ (verified from screenshot)
- [ ] GOOGLE_CLIENT_SECRET is set ✅ (verified from screenshot)
- [ ] Google OAuth redirect URI includes https://kamiyo.ai/api/auth/callback/google
- [ ] Build cache has been cleared after DATABASE_URL change
- [ ] Render logs show no Prisma errors during sign-in attempt
- [ ] Browser console shows no JavaScript errors
- [ ] Session is actually being created in database (check `Session` table)

## 🎯 Most Likely Root Cause

Based on the symptoms:
1. **Prisma Client built with old DATABASE_URL** (70% likely)
2. **Session callback throwing error** (20% likely)
3. **Google OAuth redirect URI mismatch** (10% likely)

**Recommended fix:** Clear build cache and redeploy. This will rebuild Prisma Client with the new DATABASE_URL.

## 📞 Next Steps

1. **Immediately:** Check Render logs while trying to sign in
2. **If logs show Prisma errors:** Clear build cache and deploy
3. **If still failing:** Apply Prisma singleton fix
4. **If still failing:** Enable debug mode and add logging to callbacks

---

**Question:** When you sign in, do you:
1. Get redirected to Google successfully?
2. Authorize the app on Google?
3. Get redirected back to kamiyo.ai?
4. Then get sent back to /auth/signin?

Or does it fail at a different step?
