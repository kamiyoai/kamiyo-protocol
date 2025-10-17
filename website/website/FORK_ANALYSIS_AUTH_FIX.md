# Fork Analysis Authentication Fix

## Problem

The fork-analysis page at https://kamiyo.ai/fork-analysis was showing:

> ⚠️ Demo Data Fallback
> Unable to load real fork detection data from API. Displaying demo data for visualization purposes.

**Root Cause**: The frontend was calling the FastAPI backend directly (`/api/v2/analysis/fork-families`) without proper authentication headers. The FastAPI backend requires `Authorization: Bearer {token}` header with either a JWT token or API key.

## Solution

### 1. Created Next.js API Proxy Route

**File**: `/pages/api/analysis/fork-families.js`

This proxy route:
- Receives requests from the frontend with user's email
- Looks up the user's active API key from the database (Prisma)
- Forwards the request to the FastAPI backend with proper `Authorization: Bearer {apiKey}` header
- Returns the response to the frontend

**Why a proxy?**
- Keeps API keys server-side (secure)
- Consistent with existing architecture (e.g., `/api/subscription/status`)
- Centralizes authentication logic
- No need to expose API keys to the browser

### 2. Updated Frontend to Use Proxy

**File**: `/pages/fork-analysis.js`

Changed from:
```javascript
// ❌ OLD: Called FastAPI backend directly (no auth headers)
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const response = await fetch(`${apiUrl}/api/v2/analysis/fork-families?${params}`);
```

To:
```javascript
// ✅ NEW: Calls Next.js API proxy (handles auth)
const response = await fetch(`/api/analysis/fork-families?${params}`);
```

### 3. Created API Key Generation Script

**File**: `/scripts/generate-api-key.js`

Helper script to generate API keys for users who don't have one:

```bash
# Generate API key for specific user
node scripts/generate-api-key.js user@example.com

# Generate API keys for all users without keys
node scripts/generate-api-key.js --all
```

**Important**: This script requires database access. Run it on the server or with VPN/tunnel to the production database.

## Architecture Overview

```
┌─────────────────┐
│  Browser        │
│  (fork-analysis)│
└────────┬────────┘
         │ 1. fetch('/api/analysis/fork-families?email=...')
         │    (no auth headers needed)
         ▼
┌─────────────────────────────────────┐
│  Next.js API Proxy                  │
│  /pages/api/analysis/fork-families  │
│                                     │
│  2. Lookup user's API key in DB     │
│  3. Add Authorization header        │
└────────┬────────────────────────────┘
         │ 4. fetch('http://backend:8000/api/v2/analysis/fork-families',
         │    { headers: { Authorization: 'Bearer {apiKey}' }})
         ▼
┌─────────────────────────────────────┐
│  FastAPI Backend                    │
│  /api/v2/analysis/fork-families     │
│                                     │
│  5. Validates API key               │
│  6. Checks user tier (Team+)        │
│  7. Returns fork families data      │
└─────────────────────────────────────┘
```

## Database Schema (Prisma)

```prisma
model User {
  id       String   @id @default(uuid())
  email    String   @unique
  apiKeys  ApiKey[]
}

model ApiKey {
  id        String    @id @default(uuid())
  userId    String
  key       String    @unique
  status    String    @default("active")  // active, revoked, expired
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])
}
```

## Testing

### Prerequisites
1. User must have an active subscription (Team or Enterprise tier)
2. User must have an active API key in the database

### Test Case 1: User with API Key
1. Log in to https://kamiyo.ai
2. Navigate to https://kamiyo.ai/fork-analysis
3. ✅ Expected: Real fork detection data loads (no demo data warning)

### Test Case 2: User without API Key
1. Log in as user without API key
2. Navigate to https://kamiyo.ai/fork-analysis
3. ⚠️ Expected: Error message "No active API key found. Please generate an API key in your dashboard."
4. Run: `node scripts/generate-api-key.js user@example.com` on the server
5. Refresh page
6. ✅ Expected: Real data loads

### Test Case 3: Free Tier User
1. Log in as free tier user
2. Navigate to https://kamiyo.ai/fork-analysis
3. ✅ Expected: Shows upgrade notice (existing tier gating still works)

## Deployment Checklist

- [x] Create Next.js API proxy route
- [x] Update fork-analysis.js frontend
- [x] Create API key generation script
- [ ] Generate API keys for existing Team/Enterprise users
- [ ] Deploy to production
- [ ] Test with real Team/Enterprise user accounts

## Production Setup

### Generate API Keys for Existing Users

SSH into the production server and run:

```bash
cd /path/to/kamiyo
node scripts/generate-api-key.js --all
```

This will generate API keys for all users who don't have one.

### Environment Variables

Ensure these are set:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_API_URL` - FastAPI backend URL (e.g., http://localhost:8000)

## Files Changed

1. `/pages/api/analysis/fork-families.js` - NEW: Next.js API proxy route
2. `/pages/fork-analysis.js` - UPDATED: Use proxy instead of direct backend call
3. `/scripts/generate-api-key.js` - NEW: API key generation helper
4. `/FORK_ANALYSIS_AUTH_FIX.md` - NEW: This documentation

## Related Files

- `/api/v2/analysis/routes.py` - FastAPI backend (no changes needed)
- `/api/auth_helpers.py` - FastAPI auth logic (no changes needed)
- `/lib/prisma.js` - Prisma client instance
- `/prisma/schema.prisma` - Database schema

## Security Notes

1. **API Keys are stored server-side only** - Never exposed to the browser
2. **API keys follow the pattern** `kmy_{64 hex chars}` for easy identification
3. **Users can have multiple API keys** - Useful for different integrations
4. **API keys can be revoked** - Set `status = 'revoked'` in database
5. **API keys have optional expiration** - `expiresAt` field in database

## Future Improvements

1. **API Key Management UI** - Add dashboard page for users to:
   - View their API keys
   - Generate new keys
   - Revoke keys
   - Set expiration dates
   - Name keys for different integrations

2. **API Key Rotation** - Automatic rotation with grace period

3. **Usage Tracking** - Track API calls per key for rate limiting

4. **Key Scopes** - Limit keys to specific endpoints or features

## Summary

The fork-analysis page now works correctly with proper authentication:
- Frontend calls Next.js API proxy (no auth needed from browser)
- Proxy looks up user's API key and forwards to FastAPI backend
- Backend validates API key and returns real data
- No more "Demo Data Fallback" for authenticated Team/Enterprise users
