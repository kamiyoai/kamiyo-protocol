# Signup Integration for API Key Auto-Generation

## Status: Pending NextAuth Setup

The API key management system is complete and ready, but **NextAuth authentication is not yet fully configured** in this project.

## What's Missing

1. **NextAuth Configuration File**: `pages/api/auth/[...nextauth].js`
2. **Authentication Pages**: Sign in, sign up, etc.
3. **User Creation Flow**: Where/how users are added to the database

## What's Ready

✅ API key generation utility functions (lib/apiKeyUtils.js)
✅ `createDefaultApiKey()` function ready to use
✅ Database schema with ApiKey model
✅ API routes for key management
✅ Dashboard UI for users to manage keys

## Implementation Steps (When NextAuth is Set Up)

### Step 1: Create NextAuth Configuration

Create `/pages/api/auth/[...nextauth].js`:

```javascript
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { createDefaultApiKey } from '../../../lib/apiKeyUtils';

const prisma = new PrismaClient();

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
        }),
        // Add other providers as needed
    ],
    callbacks: {
        async signIn({ user, account, profile, isNewUser }) {
            // Auto-generate API key for new users
            if (isNewUser) {
                try {
                    await createDefaultApiKey(user.id);
                    console.log(`✅ Auto-generated API key for new user: ${user.email}`);
                } catch (error) {
                    console.error(`❌ Failed to auto-generate API key for ${user.email}:`, error);
                    // Don't block signup if key generation fails
                }
            }
            return true;
        },
        async session({ session, user }) {
            session.user.id = user.id;
            return session;
        }
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    session: {
        strategy: 'database'
    }
};

export default NextAuth(authOptions);
```

### Step 2: Install Required Packages

```bash
npm install next-auth @next-auth/prisma-adapter
```

### Step 3: Update Prisma Schema

Ensure your Prisma schema includes NextAuth models:

```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  apiKeys       ApiKey[]  // Already added
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### Step 4: Create Sign-In Page

Create `/pages/auth/signin.js`:

```javascript
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function SignIn() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="max-w-md w-full space-y-8 p-8 border border-gray-500 border-opacity-25 rounded-lg">
                <h2 className="text-3xl font-light text-center">Sign in to KAMIYO</h2>

                <button
                    onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                    className="w-full px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition"
                >
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}
```

### Step 5: Update Environment Variables

Add to `.env.local`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_key
```

### Step 6: Wrap App with SessionProvider

Update `pages/_app.js`:

```javascript
import { SessionProvider } from 'next-auth/react';

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
    return (
        <SessionProvider session={session}>
            <Component {...pageProps} />
        </SessionProvider>
    );
}

export default MyApp;
```

## Testing

Once implemented, test the complete flow:

1. **New User Signup**:
   - Sign in with Google (or other provider)
   - Check that user is created in database
   - Verify API key was auto-generated (`SELECT * FROM "ApiKey" WHERE "userId" = 'new-user-id'`)
   - Confirm user can see key in dashboard at `/dashboard/api-keys`

2. **Existing User**:
   - Sign in again
   - Should NOT generate duplicate keys
   - Existing keys should still be accessible

3. **Error Handling**:
   - Test with invalid database connection
   - Verify signup succeeds even if key generation fails
   - Check console logs for error messages

## Current Workaround

Until NextAuth is set up, use the manual script to generate keys for existing users:

```bash
# Generate key for specific user
node scripts/generate-api-key.js user@example.com

# Generate keys for all users
node scripts/generate-api-key.js --all
```

## Next Steps

1. Set up NextAuth configuration
2. Create authentication pages
3. Test full signup flow
4. Deploy to production
5. Monitor logs for any key generation failures

## Related Files

- `/lib/apiKeyUtils.js` - Key generation utilities
- `/pages/api/user/api-keys.js` - Key management API
- `/pages/dashboard/api-keys.js` - User dashboard
- `/API_KEY_MANAGEMENT_GUIDE.md` - Complete system documentation
