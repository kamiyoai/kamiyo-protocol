# x402 Database Migration - Quick Start Guide

## TL;DR

```bash
# 1. Preview the migration (safe, no changes)
./scripts/apply_x402_migration.sh --dry-run

# 2. Apply the migration (creates backup automatically)
./scripts/apply_x402_migration.sh

# 3. Verify it worked
./scripts/verify_x402_migration.sh

# 4. Update environment
export X402_STORAGE_MODE=database

# 5. Restart services
systemctl restart kamiyo-api  # or your deployment method
```

## What This Fixes

**BLOCKER #5:** x402 database tables don't exist

Currently, the x402 payment system can't use database mode because the required tables haven't been created. This migration:

- Creates 4 tables for payments, tokens, usage, and analytics
- Creates 4 views for common queries
- Creates 2 functions for cleanup and analytics
- Adds 13 indexes for performance

## Prerequisites

1. **DATABASE_URL** environment variable set
2. **PostgreSQL client tools** installed (psql, pg_dump)
3. **2-5 minutes** of maintenance window

## Migration Overview

The migration creates these database objects:

| Object Type | Count | Names |
|-------------|-------|-------|
| Tables | 4 | x402_payments, x402_tokens, x402_usage, x402_analytics |
| Views | 4 | v_x402_active_payments, v_x402_stats_24h, v_x402_top_payers, v_x402_endpoint_stats |
| Functions | 2 | cleanup_expired_x402_payments(), update_x402_analytics() |
| Indexes | 13 | Various for performance optimization |

## Step-by-Step Guide

### Step 1: Pre-Migration Check

Verify you have everything needed:

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Check PostgreSQL tools are installed
which psql pg_dump

# Test database connection
psql $DATABASE_URL -c "SELECT version();"
```

### Step 2: Dry Run

Preview what the migration will do without making changes:

```bash
./scripts/apply_x402_migration.sh --dry-run
```

You'll see:
- Database connection info
- Tables/views/functions to be created
- No actual changes made

### Step 3: Apply Migration

Run the migration with automatic backup:

```bash
./scripts/apply_x402_migration.sh
```

The script will:
1. Check prerequisites
2. Test database connection
3. Create a backup (stored in /tmp/kamiyo_backups/)
4. Apply the migration
5. Verify all objects were created
6. Test basic queries

**Interactive prompts:**
- Confirmation before applying
- Automatic backup (can skip with --skip-backup)

### Step 4: Verify Success

Run the verification script:

```bash
./scripts/verify_x402_migration.sh
```

Expected output:
```
✓ Tables: 4/4
✓ Views: 4/4
✓ Functions: 2/2
✓ Indexes: 13/13

✓ Migration verification PASSED
```

### Step 5: Update Configuration

Update your environment to use database mode:

```bash
# In .env or environment variables
export X402_STORAGE_MODE=database
```

Or update the config file directly:

```python
# api/x402/config.py
STORAGE_MODE = os.getenv("X402_STORAGE_MODE", "database")  # Changed from "memory"
```

### Step 6: Restart Services

Restart your API services to pick up the new configuration:

```bash
# Docker Compose
docker-compose restart api

# Systemd
systemctl restart kamiyo-api

# PM2
pm2 restart kamiyo-api

# Manual
pkill -f "python.*api/main.py" && python api/main.py &
```

### Step 7: Test the System

Verify the payment flow works:

```bash
# Check tables are accessible
psql $DATABASE_URL -c "SELECT COUNT(*) FROM x402_payments;"

# Check views work
psql $DATABASE_URL -c "SELECT * FROM v_x402_active_payments LIMIT 1;"

# Test the API
curl http://localhost:8000/x402/pricing
```

## Command Reference

### Migration Script Options

```bash
# Dry run - preview without changes
./scripts/apply_x402_migration.sh --dry-run

# Skip backup (not recommended)
./scripts/apply_x402_migration.sh --skip-backup

# Auto-confirm (for CI/CD)
./scripts/apply_x402_migration.sh --auto

# Show help
./scripts/apply_x402_migration.sh --help
```

### Verification Script

```bash
# Verify migration was applied
./scripts/verify_x402_migration.sh
```

### Manual Queries

```sql
-- Check if migration applied
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'x402_%';

-- View payment stats
SELECT * FROM v_x402_stats_24h;

-- Check active payments
SELECT * FROM v_x402_active_payments;

-- Run cleanup
SELECT cleanup_expired_x402_payments();
```

## Troubleshooting

### Issue: DATABASE_URL not set

**Error:** `DATABASE_URL environment variable not set`

**Fix:**
```bash
export DATABASE_URL='postgresql://user:password@host:port/database'
```

### Issue: Migration already applied

**Error:** `x402_payments table already exists!`

**What to do:** The script will detect this and ask if you want to continue. If tables exist, you can safely skip the migration or continue to ensure all views/functions are up to date.

### Issue: Permission denied

**Error:** `permission denied for schema public`

**Fix:**
```sql
GRANT CREATE ON SCHEMA public TO your_db_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_db_user;
```

### Issue: Can't connect to database

**Error:** `Failed to connect to database`

**Check:**
1. DATABASE_URL is correct
2. Database server is running
3. Network connectivity
4. Firewall rules
5. Database credentials

### Issue: Missing tools

**Error:** `psql not found` or `pg_dump not found`

**Fix:**
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# CentOS/RHEL
sudo yum install postgresql
```

## Rollback Procedure

If something goes wrong, you can rollback:

### Option 1: Restore from Backup

The migration script creates a backup automatically:

```bash
# Find your backup
ls -lh /tmp/kamiyo_backups/

# Restore it
gunzip -c /tmp/kamiyo_backups/pre_x402_migration_TIMESTAMP.sql.gz | \
  pg_restore -d $DATABASE_URL --no-owner --no-acl
```

### Option 2: Manual Rollback

```sql
-- Drop all x402 objects
DROP TABLE IF EXISTS x402_analytics CASCADE;
DROP TABLE IF EXISTS x402_usage CASCADE;
DROP TABLE IF EXISTS x402_tokens CASCADE;
DROP TABLE IF EXISTS x402_payments CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_x402_payments();
DROP FUNCTION IF EXISTS update_x402_analytics();
```

### Option 3: Use Backup Script

```bash
# If you have a backup from before migration
./scripts/restore-database.sh /path/to/backup.sql.gz
```

## Post-Migration Checklist

After migration, verify everything works:

- [ ] All tables created (`./scripts/verify_x402_migration.sh`)
- [ ] API can connect to database
- [ ] Payment verification works
- [ ] Token generation works
- [ ] Usage tracking records requests
- [ ] Analytics views return data
- [ ] Cleanup function runs without errors
- [ ] API logs show no database errors

## Monitoring

After migration, monitor these metrics:

```sql
-- Payment statistics (last 24h)
SELECT * FROM v_x402_stats_24h;

-- Active payments
SELECT COUNT(*) FROM v_x402_active_payments;

-- Database size
SELECT
    pg_size_pretty(pg_total_relation_size('x402_payments')) as payments_size,
    pg_size_pretty(pg_total_relation_size('x402_usage')) as usage_size;

-- Recent payments
SELECT * FROM x402_payments
ORDER BY created_at DESC
LIMIT 10;
```

## Scheduled Maintenance

Set up these cron jobs:

```cron
# Cleanup expired payments every hour
0 * * * * psql $DATABASE_URL -c "SELECT cleanup_expired_x402_payments();"

# Update analytics at start of each hour
5 * * * * psql $DATABASE_URL -c "SELECT update_x402_analytics();"

# Weekly backup
0 2 * * 0 /path/to/kamiyo/scripts/backup-database.sh
```

## Performance Tuning

After migration, consider these optimizations:

1. **Enable autovacuum** (should be enabled by default)
2. **Monitor index usage** after 1 week
3. **Consider partitioning** x402_usage table after 1M records
4. **Archive old data** after 90 days

## Need Help?

- **Migration logs:** Check `/tmp/x402_migration_TIMESTAMP.log`
- **Backup location:** `/tmp/kamiyo_backups/`
- **Full documentation:** `database/migrations/002_x402_payments_README.md`
- **Test suite:** `tests/x402/`

## Success Criteria

The migration is successful when:

1. ✅ `verify_x402_migration.sh` passes
2. ✅ API starts without database errors
3. ✅ Payment flow completes end-to-end
4. ✅ Usage tracking records in database
5. ✅ Views return expected data

## Timeline

Typical migration timeline:

- **Pre-checks:** 2 minutes
- **Backup:** 1-3 minutes (depends on database size)
- **Migration:** 5-10 seconds
- **Verification:** 30 seconds
- **Total:** ~5 minutes

**Recommendation:** Schedule during low-traffic period.

## Support Files

| File | Purpose |
|------|---------|
| `/Users/dennisgoslar/Projekter/kamiyo/scripts/apply_x402_migration.sh` | Main migration script |
| `/Users/dennisgoslar/Projekter/kamiyo/scripts/verify_x402_migration.sh` | Verification script |
| `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments.sql` | SQL migration file |
| `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments_README.md` | Full documentation |
| `/Users/dennisgoslar/Projekter/kamiyo/X402_MIGRATION_QUICKSTART.md` | This quick start guide |

## Questions?

Common questions answered in full documentation:

- **Database size estimates?** See README.md
- **Security considerations?** See README.md
- **Performance optimization?** See README.md
- **Rollback procedure?** See above and README.md

---

**Ready to apply the migration?**

```bash
./scripts/apply_x402_migration.sh --dry-run  # Safe preview first
./scripts/apply_x402_migration.sh             # Then apply for real
```
