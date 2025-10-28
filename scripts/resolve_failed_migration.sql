-- Script to resolve failed migration P3009 error
-- This marks the failed migration as rolled back so Prisma can re-apply it with the fixed SQL

-- Check current migration status
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';

-- Mark the failed migration as rolled back
-- This tells Prisma the migration needs to be re-applied
UPDATE _prisma_migrations
SET rolled_back_at = NOW(),
    applied_steps_count = 0
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist'
  AND rolled_back_at IS NULL;

-- Verify the update
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';

-- Alternative: If you want to completely remove the failed migration record:
-- DELETE FROM _prisma_migrations WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';
