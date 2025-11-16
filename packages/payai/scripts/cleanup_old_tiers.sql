-- Cleanup script for old tier names (ephemeral, guide, architect, creator, etc.)
-- Run this against your production database to migrate all users to current tiers
--
-- Current valid tiers: free, pro, team, enterprise

-- 1. Update users table - migrate old tiers to new tiers
UPDATE users
SET tier = CASE
    WHEN tier = 'ephemeral' THEN 'enterprise'  -- Ephemeral was special/paid, map to enterprise
    WHEN tier = 'guide' THEN 'pro'              -- Guide was mid-tier, map to pro
    WHEN tier = 'architect' THEN 'team'         -- Architect was team-tier, map to team
    WHEN tier = 'creator' THEN 'enterprise'     -- Creator was high-tier, map to enterprise
    WHEN tier = 'kami' THEN 'enterprise'        -- Any kami variants
    WHEN tier = 'kama' THEN 'enterprise'        -- Any kama variants
    WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'  -- Unknown tiers default to free
    ELSE tier  -- Keep valid tiers as-is
END
WHERE tier IS NOT NULL;

-- 2. Update subscriptions table - migrate old tiers
UPDATE subscriptions
SET tier = CASE
    WHEN tier = 'ephemeral' THEN 'enterprise'
    WHEN tier = 'guide' THEN 'pro'
    WHEN tier = 'architect' THEN 'team'
    WHEN tier = 'creator' THEN 'enterprise'
    WHEN tier = 'kami' THEN 'enterprise'
    WHEN tier = 'kama' THEN 'enterprise'
    WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
    ELSE tier
END
WHERE tier IS NOT NULL;

-- 3. Specifically fix dennisgoslar@gmail.com account
UPDATE users
SET tier = 'enterprise'
WHERE email = 'dennisgoslar@gmail.com';

-- 4. Show results
SELECT email, tier, created_at
FROM users
WHERE email = 'dennisgoslar@gmail.com';

-- 5. Count of users by tier (verification)
SELECT tier, COUNT(*) as user_count
FROM users
GROUP BY tier
ORDER BY user_count DESC;
