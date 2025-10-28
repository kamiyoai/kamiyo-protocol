#!/bin/bash
# Script to resolve Prisma P3009 failed migration error
# This marks the failed migration as rolled back so it can be re-applied

set -e

echo "==> Resolving failed migration in production database..."

if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    echo "Please set it to your PostgreSQL connection string"
    exit 1
fi

echo "==> Checking migration status..."
psql "$DATABASE_URL" -c "
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';
"

echo ""
echo "==> Marking failed migration as rolled back..."
psql "$DATABASE_URL" -c "
UPDATE _prisma_migrations
SET rolled_back_at = NOW(),
    applied_steps_count = 0
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist'
  AND rolled_back_at IS NULL;
"

echo ""
echo "==> Verifying update..."
psql "$DATABASE_URL" -c "
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';
"

echo ""
echo "✓ Migration marked as rolled back successfully!"
echo "Now run 'npx prisma migrate deploy' to re-apply the migration with the fixed SQL"
