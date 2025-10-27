# Fix: Google Sign-In Redirecting Back to Sign-In Page

## Problem
After signing in with Google, users are redirected back to the sign-in page instead of the dashboard.

## Root Cause
This usually happens due to one of these issues:
1. Missing or incorrect `NEXTAUTH_SECRET`
2. Missing Google OAuth credentials
3. Database connection issues
4. Incorrect authorized redirect URIs in Google Cloud Console

## Solutions

### 1. Check Environment Variables

Make sure your `.env` file has these variables:

```bash
# Generate a new secret with:
# openssl rand -base64 32
NEXTAUTH_SECRET=your-generated-secret-here

# From Google Cloud Console
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Must match your development URL
NEXTAUTH_URL=http://localhost:3001
```

### 2. Configure Google OAuth Correctly

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your project (or create a new one)
3. Go to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth 2.0 Client ID**
5. Select **Web application**
6. Add **Authorized redirect URIs**:
   - For development: `http://localhost:3001/api/auth/callback/google`
   - For production: `https://yourdomain.com/api/auth/callback/google`
7. Save and copy the **Client ID** and **Client Secret**

### 3. Check Database Connection

The issue might be that NextAuth can't save sessions to the database.

Test your database connection:

```bash
# Check if Prisma can connect
npx prisma db push

# Check if tables exist
npx prisma studio
```

### 4. Enable Debug Mode

To see what's happening, enable NextAuth debug mode:

```bash
# In .env
NODE_ENV=development
```

Then check your terminal logs when signing in. You should see:
```
🔐 Sign-in attempt: { email: 'user@example.com', isNewUser: false, provider: 'google' }
🔀 Redirect: { url: '/dashboard', baseUrl: 'http://localhost:3001' }
```

### 5. Clear Browser Cookies

Sometimes stale cookies cause issues:

1. Open DevTools (F12)
2. Go to **Application** → **Cookies**
3. Delete all cookies for `localhost:3001`
4. Try signing in again

### 6. Check Database Session Table

Make sure the session is being saved:

```bash
# Open Prisma Studio
npx prisma studio

# Check the "Session" table after signing in
# You should see a new entry with your user ID
```

### 7. Verify Prisma Schema

Make sure your `prisma/schema.prisma` has the correct session configuration:

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Quick Fix

If all else fails, try this quick reset:

```bash
# 1. Stop all servers
# Ctrl+C or kill processes

# 2. Clear the database and regenerate
npx prisma migrate reset --force

# 3. Generate Prisma client
npx prisma generate

# 4. Restart everything
npm run dev
```

## Still Not Working?

Check the browser console (F12) for errors. Common ones:

### "Adapter error"
- Database connection failed
- Fix: Check `DATABASE_URL` in `.env`

### "Invalid callback URL"
- Google OAuth misconfigured
- Fix: Add correct redirect URI in Google Console

### "No secret provided"
- Missing `NEXTAUTH_SECRET`
- Fix: Generate one with `openssl rand -base64 32`

### "CSRF token mismatch"
- Cookie issues or wrong `NEXTAUTH_URL`
- Fix: Clear cookies and ensure `NEXTAUTH_URL` matches your actual URL

## Current Code Status

The redirect logic in `/pages/api/auth/[...nextauth].js` is correct:

```javascript
async redirect({ url, baseUrl }) {
    // Always redirect to dashboard after signin
    if (url.startsWith("/")) return `${baseUrl}${url}`;
    else if (new URL(url).origin === baseUrl) return url;
    return baseUrl + "/dashboard";  // ← This should work
}
```

So the issue is likely with authentication/session not being established, not the redirect itself.

## Test Checklist

- [ ] `NEXTAUTH_SECRET` is set
- [ ] `GOOGLE_CLIENT_ID` is set
- [ ] `GOOGLE_CLIENT_SECRET` is set
- [ ] `NEXTAUTH_URL` matches current URL
- [ ] Google OAuth redirect URI is correct
- [ ] Database connection works
- [ ] Prisma tables exist
- [ ] Browser cookies are clear
- [ ] FastAPI server is running (for dashboard data)

---

Need more help? Check the terminal logs when you try to sign in. They'll show exactly where the process is failing.
