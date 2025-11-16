# Fixing Failed Migration (P3009 Error)

## Problem
The migration `20251011000000_add_apirequest_webhooks_watchlist` failed due to invalid SQL syntax (using `IF NOT EXISTS` which isn't supported in PostgreSQL for `ALTER TABLE ADD CONSTRAINT`). Even though we fixed the SQL, Prisma sees the failed migration record in the database and refuses to proceed.

## Error
```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `20251011000000_add_apirequest_webhooks_watchlist` migration started at 2025-10-28 09:01:15.971966 UTC failed
```

## Solution Options

### Option 1: Mark Migration as Rolled Back (Recommended)
This tells Prisma to re-apply the migration with the fixed SQL.

**Using Prisma CLI:**
```bash
# Mark the failed migration as rolled back
npx prisma migrate resolve --rolled-back 20251011000000_add_apirequest_webhooks_watchlist

# Then deploy migrations normally
npx prisma migrate deploy
```

**Using SQL directly:**
```bash
# Run the fix script
export DATABASE_URL="your-postgres-connection-string"
bash scripts/fix_failed_migration.sh
```

### Option 2: Mark Migration as Applied
If the tables already exist from a partial migration, mark it as applied:

```bash
npx prisma migrate resolve --applied 20251011000000_add_apirequest_webhooks_watchlist
```

### Option 3: Manual Database Update
Connect to your PostgreSQL database and run:

```sql
-- Check migration status
SELECT * FROM _prisma_migrations
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';

-- Mark as rolled back
UPDATE _prisma_migrations
SET rolled_back_at = NOW(), applied_steps_count = 0
WHERE migration_name = '20251011000000_add_apirequest_webhooks_watchlist';
```

## For Render Deployment

**Update build command to handle failed migrations automatically:**

Replace this in Render settings:
```bash
npm install --legacy-peer-deps && npx prisma generate && npx prisma migrate deploy && npm run build
```

With this:
```bash
npm install --legacy-peer-deps && npx prisma generate && npx prisma migrate resolve --rolled-back 20251011000000_add_apirequest_webhooks_watchlist || true && npx prisma migrate deploy && npm run build
```

The `|| true` ensures the build continues even if the migration doesn't need resolving.

## Verification

After applying the fix, verify migrations ran successfully:

```bash
npx prisma migrate status
```

You should see all migrations marked as applied.
