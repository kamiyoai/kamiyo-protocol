-- Update admin@kamiyo.ai to enterprise tier
-- Run this in your Render PostgreSQL database or via prisma studio

BEGIN;

-- Find the user ID
SELECT id, email FROM "User" WHERE email = 'admin@kamiyo.ai';

-- Update or create active subscription
-- First, deactivate any existing active subscriptions
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

-- Verify the change
SELECT u.email, s.tier, s.status, s."createdAt"
FROM "User" u
LEFT JOIN "Subscription" s ON u.id = s."userId"
WHERE u.email = 'admin@kamiyo.ai'
ORDER BY s."createdAt" DESC;

COMMIT;
