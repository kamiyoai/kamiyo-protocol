# Subscription Status Field Refactor

## Current Issue

The current schema has a confusing design where `User.subscriptionStatus` stores the **tier name** instead of the actual subscription status:

```prisma
model User {
  id                 String         @id @default(uuid())
  email              String         @unique
  subscriptionStatus String         @default("free")  // ❌ This stores tier name!
  // ...
}

model Subscription {
  id        String   @id @default(uuid())
  userId    String
  tier      String   // ✅ This correctly stores tier name
  status    String   // ✅ This correctly stores status
  // ...
}
```

**Problems:**
1. `subscriptionStatus` is misleading - it's actually storing the tier
2. Tier information is duplicated in two places
3. Status should be "active", "inactive", "canceled", "past_due", etc.
4. Tier should be "free", "basic", "pro", "team", "enterprise"

## Recommended Design

### Option 1: Remove subscriptionStatus (Cleanest)

```prisma
model User {
  id                 String         @id @default(uuid())
  email              String         @unique
  passwordHash       String?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  subscriptions      Subscription[]
}

model Subscription {
  id        String   @id @default(uuid())
  userId    String
  tier      String   // "free", "basic", "pro", "team", "enterprise"
  status    String   // "active", "inactive", "canceled", "past_due", "trialing"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**To get user's current tier:**
```javascript
const subscription = await prisma.subscription.findFirst({
  where: { 
    userId: user.id,
    status: 'active' 
  },
  orderBy: { createdAt: 'desc' }
});

const tier = subscription?.tier || 'free';
const isActive = subscription?.status === 'active';
```

### Option 2: Keep for backward compatibility (Less ideal)

```prisma
model User {
  id                 String         @id @default(uuid())
  email              String         @unique
  subscriptionStatus String         @default("active")  // ✅ Now actually status
  subscriptionTier   String         @default("free")    // ✅ Add explicit tier field
  // ...
}
```

## Required Code Updates

If you choose **Option 1** (recommended), update these files:

1. **`pages/api/subscription/status.js`** (lines 18-43)
   - Remove references to `user.subscriptionStatus`
   - Query active subscription directly
   
2. **`pages/api/auth/[...nextauth].js`**
   - Update user creation to not set `subscriptionStatus` to tier name
   
3. **`pages/api/payment/webhook.js`**
   - Update Stripe webhook handler to set `Subscription.status` correctly

4. **Any other files** that query `subscriptionStatus`

## Migration Steps

1. **Create migration file:**
   ```bash
   npx prisma migrate dev --name fix_subscription_status
   ```

2. **Update schema:**
   ```prisma
   model User {
     // Remove subscriptionStatus field
   }
   ```

3. **Update existing records:**
   ```sql
   -- In migration file
   -- Update all subscriptions to have correct status
   UPDATE Subscription SET status = 'active' 
   WHERE status IS NULL OR status = '';
   ```

4. **Update code** to use new structure

5. **Test thoroughly** before deploying

## Status vs Tier

**Status values** (describes if subscription is working):
- `active` - Subscription is paid and working
- `inactive` - Not subscribed / canceled
- `past_due` - Payment failed, grace period
- `canceled` - User canceled
- `trialing` - Free trial period
- `incomplete` - Payment incomplete

**Tier values** (describes what features they have):
- `free` - Free tier
- `basic` - $29/month
- `pro` - $99/month
- `team` - $299/month
- `enterprise` - $499/month

## Decision Required

Choose one approach and I can help implement it:

1. **Option 1: Clean refactor** - Remove `subscriptionStatus`, use `Subscription` model only
2. **Option 2: Keep field** - Rename and fix `subscriptionStatus` to actually store status
3. **Option 3: Do nothing** - Keep current confusing design (not recommended)

Let me know which approach you prefer!
