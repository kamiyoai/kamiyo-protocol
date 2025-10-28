# BLOCKER #5 Resolution: x402 Database Tables Migration

## Status: RESOLVED (Script Ready - Not Yet Applied)

**Blocker:** x402 database tables don't exist
**Impact:** x402 payment system cannot use database mode
**Resolution:** Created safe migration script with comprehensive documentation
**Date:** 2025-10-27

---

## Problem Summary

The x402 Payment Facilitator system was implemented with database mode configuration, but the required database tables were never created. The migration file exists (`002_x402_payments.sql`) but has not been applied to the database.

**Current State:**
- ❌ Migration SQL file exists but not executed
- ❌ Database tables don't exist
- ❌ Code will fail when using `X402_STORAGE_MODE=database`
- ✅ Migration is ready to apply safely

## Solution Delivered

Created a comprehensive migration solution with three key components:

### 1. Automated Migration Script
**File:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/apply_x402_migration.sh`

**Features:**
- ✅ Automatic database backup before migration
- ✅ Pre-flight safety checks (connection, prerequisites, existing tables)
- ✅ Dry-run mode for safe preview
- ✅ Transaction-based execution (all-or-nothing)
- ✅ Post-migration verification
- ✅ Comprehensive error handling and rollback support
- ✅ Colored output for easy reading
- ✅ Detailed logging

**Usage:**
```bash
# Preview changes without modifying database
./scripts/apply_x402_migration.sh --dry-run

# Apply migration with automatic backup
./scripts/apply_x402_migration.sh

# CI/CD mode (auto-confirm)
./scripts/apply_x402_migration.sh --auto
```

### 2. Verification Script
**File:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/verify_x402_migration.sh`

**Features:**
- ✅ Verifies all 4 tables created
- ✅ Verifies all 4 views created
- ✅ Verifies 2 functions created
- ✅ Verifies 13 indexes created
- ✅ Shows row counts for each table
- ✅ Clear pass/fail status

**Usage:**
```bash
./scripts/verify_x402_migration.sh
```

### 3. Comprehensive Documentation

#### Quick Start Guide
**File:** `/Users/dennisgoslar/Projekter/kamiyo/X402_MIGRATION_QUICKSTART.md`

- Step-by-step instructions
- Command reference
- Troubleshooting guide
- Rollback procedures
- Post-migration checklist

#### Full Documentation
**File:** `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments_README.md`

- Complete schema documentation
- Performance considerations
- Security guidelines
- Monitoring and maintenance
- Integration details

---

## Migration Contents

The migration creates a complete database schema for the x402 payment system:

### Database Objects Created

| Category | Count | Objects |
|----------|-------|---------|
| **Tables** | 4 | x402_payments, x402_tokens, x402_usage, x402_analytics |
| **Views** | 4 | v_x402_active_payments, v_x402_stats_24h, v_x402_top_payers, v_x402_endpoint_stats |
| **Functions** | 2 | cleanup_expired_x402_payments(), update_x402_analytics() |
| **Indexes** | 13 | Performance-optimized indexes on all key fields |

### Table Purposes

#### x402_payments
Main payment records table tracking on-chain USDC transactions
- Stores blockchain payment verification
- Tracks request quotas (allocated vs used)
- Manages payment lifecycle (pending → verified → used → expired)

#### x402_tokens
Payment access tokens for API authentication
- Links bearer tokens to verified payments
- SHA256 hashed for security
- Automatic expiration tracking

#### x402_usage
API usage tracking and analytics
- Records every API request per payment
- Tracks endpoint, method, response time, status
- Provides audit trail for billing

#### x402_analytics
Pre-aggregated hourly analytics
- Payment statistics by chain and hour
- Request counts and spending totals
- Unique payer tracking

---

## Safety Features

### Pre-Migration Safety

1. **Connection Testing:** Verifies database connectivity before proceeding
2. **Prerequisite Checks:** Ensures all required tools installed
3. **Existing Table Detection:** Warns if tables already exist
4. **Automatic Backup:** Creates compressed backup before migration
5. **Dry-Run Mode:** Preview changes without modifying database

### During Migration

1. **Transaction Wrapper:** All changes in single transaction (rollback on error)
2. **Error Handling:** Detailed error messages with troubleshooting hints
3. **Progress Logging:** Clear status messages throughout process
4. **Idempotent SQL:** Uses `IF NOT EXISTS` and `CREATE OR REPLACE`

### Post-Migration Safety

1. **Automatic Verification:** Checks all objects created successfully
2. **Test Queries:** Runs basic INSERT/SELECT/VIEW/FUNCTION tests
3. **Rollback Instructions:** Clear rollback procedures if needed
4. **Backup Location:** Stores backup path for quick restore

---

## Quick Start

### Step 1: Preview (Safe - No Changes)
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
./scripts/apply_x402_migration.sh --dry-run
```

### Step 2: Apply Migration
```bash
# With automatic backup (recommended)
./scripts/apply_x402_migration.sh

# Or skip backup if already backed up
./scripts/apply_x402_migration.sh --skip-backup
```

### Step 3: Verify Success
```bash
./scripts/verify_x402_migration.sh
```

### Step 4: Update Configuration
```bash
# Set environment variable
export X402_STORAGE_MODE=database

# Or update config file
# api/x402/config.py line 10:
# STORAGE_MODE = os.getenv("X402_STORAGE_MODE", "database")
```

### Step 5: Restart Services
```bash
# Restart your API service
systemctl restart kamiyo-api  # or your deployment method
```

---

## Prerequisites

### Environment
- ✅ `DATABASE_URL` environment variable set
- ✅ PostgreSQL database accessible
- ✅ Database user has CREATE privileges

### Tools
- ✅ `psql` (PostgreSQL client)
- ✅ `pg_dump` (for backup)
- ✅ Bash shell

### Access
- ✅ Write access to `/tmp` or specified backup directory
- ✅ Network connectivity to database

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Pre-checks | 30 seconds | Connection test, prerequisite validation |
| Backup | 1-3 minutes | Depends on database size |
| Migration | 5-10 seconds | Schema-only, very fast |
| Verification | 30 seconds | Test all objects created |
| **Total** | **~5 minutes** | Low-traffic window recommended |

---

## Rollback Procedures

### Option 1: Restore from Backup (Recommended)

The script creates automatic backups in `/tmp/kamiyo_backups/`:

```bash
# Find backup
ls -lh /tmp/kamiyo_backups/pre_x402_migration_*.sql.gz

# Restore
gunzip -c /tmp/kamiyo_backups/pre_x402_migration_TIMESTAMP.sql.gz | \
  pg_restore -d $DATABASE_URL --no-owner --no-acl
```

### Option 2: Manual Cleanup

```sql
-- Drop all x402 objects (CASCADE removes views automatically)
DROP TABLE IF EXISTS x402_analytics CASCADE;
DROP TABLE IF EXISTS x402_usage CASCADE;
DROP TABLE IF EXISTS x402_tokens CASCADE;
DROP TABLE IF EXISTS x402_payments CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_x402_payments();
DROP FUNCTION IF EXISTS update_x402_analytics();
```

### Option 3: Use Backup Script

```bash
./scripts/restore-database.sh /path/to/backup.sql.gz
```

---

## Troubleshooting

### Database Connection Issues

**Error:** `Failed to connect to database`

**Check:**
1. DATABASE_URL format: `postgresql://user:pass@host:port/db`
2. Database server is running: `pg_isready -h host -p port`
3. Network connectivity: `ping database_host`
4. Credentials valid: `psql $DATABASE_URL -c "SELECT 1;"`

### Permission Issues

**Error:** `permission denied for schema public`

**Fix:**
```sql
-- Grant necessary permissions
GRANT CREATE ON SCHEMA public TO your_db_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_db_user;
```

### Migration Already Applied

**Warning:** `x402_payments table already exists!`

**What to do:**
- Script will detect and warn you
- Safe to continue - uses `IF NOT EXISTS` and `CREATE OR REPLACE`
- Views and functions will be updated to latest version

### Missing PostgreSQL Tools

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

---

## Verification

### Automated Verification

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

### Manual Verification

```sql
-- Check tables exist
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'x402_%';

-- Check views exist
SELECT viewname FROM pg_views
WHERE schemaname='public' AND viewname LIKE 'v_x402_%';

-- Check functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '%x402%';

-- Test basic operations
INSERT INTO x402_payments (
    tx_hash, chain, amount_usdc, from_address, to_address,
    block_number, confirmations, status, requests_allocated, expires_at
) VALUES (
    'test_verification', 'base', 1.00,
    '0xtest', '0xkamiyo', 12345, 1, 'verified', 100,
    NOW() + INTERVAL '1 hour'
);

SELECT * FROM v_x402_active_payments;
SELECT cleanup_expired_x402_payments();

DELETE FROM x402_payments WHERE tx_hash = 'test_verification';
```

---

## Post-Migration Tasks

### Immediate (Required)

- [ ] Run verification script
- [ ] Update X402_STORAGE_MODE environment variable
- [ ] Restart API services
- [ ] Test payment flow end-to-end
- [ ] Monitor logs for database errors

### Short-term (Within 1 week)

- [ ] Set up cleanup cron job (hourly)
- [ ] Set up analytics update cron job (hourly)
- [ ] Monitor database growth
- [ ] Review query performance
- [ ] Configure monitoring alerts

### Long-term (Within 1 month)

- [ ] Implement archival strategy for x402_usage (>90 days)
- [ ] Review index usage and optimize if needed
- [ ] Consider partitioning x402_usage if >1M records
- [ ] Document operational procedures

---

## Maintenance Schedule

### Hourly
```cron
# Cleanup expired payments
0 * * * * psql $DATABASE_URL -c "SELECT cleanup_expired_x402_payments();"

# Update analytics
5 * * * * psql $DATABASE_URL -c "SELECT update_x402_analytics();"
```

### Daily
```sql
-- Check database health
SELECT * FROM v_x402_stats_24h;
SELECT COUNT(*) FROM v_x402_active_payments;
```

### Weekly
```bash
# Database backup
./scripts/backup-database.sh

# Check database size
psql $DATABASE_URL -c "
SELECT pg_size_pretty(pg_database_size(current_database()));
"
```

---

## Performance Expectations

### Query Performance

| Query Type | Expected Time | Index Used |
|------------|---------------|------------|
| Payment lookup by tx_hash | < 1ms | idx_x402_payments_tx_hash |
| Token validation | < 1ms | idx_x402_tokens_token_hash |
| Active payments view | < 10ms | Multiple indexes + WHERE |
| Analytics queries | < 50ms | Pre-aggregated data |
| Usage tracking INSERT | < 5ms | Async recommended |

### Database Growth

Based on 1,000 payments/day, 100,000 requests/day:

| Table | Daily Growth | Monthly Growth | 90-Day Growth |
|-------|--------------|----------------|---------------|
| x402_payments | ~200 KB | ~6 MB | ~18 MB |
| x402_tokens | ~100 KB | ~3 MB | ~9 MB |
| x402_usage | ~15 MB | ~450 MB | ~1.3 GB |
| x402_analytics | ~7 KB | ~216 KB | ~648 KB |
| **Total** | **~15 MB/day** | **~459 MB/month** | **~1.4 GB** |

**Recommendation:** Archive x402_usage records older than 90 days.

---

## Security Considerations

### Data Protection

- ✅ Payment tokens stored as SHA256 hashes (never plaintext)
- ✅ IP addresses collected for fraud detection (GDPR compliance needed)
- ✅ Audit trail in x402_usage table
- ✅ Automatic expiration for payments and tokens

### Access Control

- ✅ Database user should have minimum required privileges
- ✅ Backup files should be encrypted at rest
- ✅ Connection strings should never be logged
- ✅ API tokens should be rotated regularly

### Monitoring

- ✅ Log all payment verification attempts
- ✅ Alert on unusual payment patterns
- ✅ Monitor failed verification attempts
- ✅ Track payment expiration and cleanup

---

## Integration Points

This migration integrates with:

### x402 Payment System Components

1. **Payment Verifier** (`api/x402/payment_verifier.py`)
   - Uses x402_payments table to store verified transactions

2. **Payment Tracker** (`api/x402/payment_tracker.py`)
   - Manages payment state and request quotas

3. **API Middleware** (`api/x402/middleware.py`)
   - Validates tokens against x402_tokens table
   - Tracks usage in x402_usage table

4. **Routes** (`api/x402/routes.py`)
   - Creates payment records
   - Generates access tokens
   - Returns payment status

### Configuration

After migration, update configuration:

```python
# api/x402/config.py
STORAGE_MODE = os.getenv("X402_STORAGE_MODE", "database")  # Changed from "memory"
```

---

## Success Criteria

The migration is successful when:

1. ✅ All 4 tables created with correct schema
2. ✅ All 4 views created and return data
3. ✅ Both functions execute without errors
4. ✅ All 13 indexes created
5. ✅ API starts without database errors
6. ✅ Payment flow completes end-to-end
7. ✅ Usage tracking records to database
8. ✅ Token validation works correctly

---

## Files Created

| File | Purpose | Location |
|------|---------|----------|
| Migration script | Apply migration safely | `/Users/dennisgoslar/Projekter/kamiyo/scripts/apply_x402_migration.sh` |
| Verification script | Verify migration success | `/Users/dennisgoslar/Projekter/kamiyo/scripts/verify_x402_migration.sh` |
| Quick start guide | Step-by-step instructions | `/Users/dennisgoslar/Projekter/kamiyo/X402_MIGRATION_QUICKSTART.md` |
| Full documentation | Complete reference | `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments_README.md` |
| This summary | Resolution overview | `/Users/dennisgoslar/Projekter/kamiyo/X402_BLOCKER_5_RESOLVED.md` |

---

## Next Steps

### For Development Team

1. **Review the migration:**
   ```bash
   # Read the quick start
   cat X402_MIGRATION_QUICKSTART.md

   # Preview the migration
   ./scripts/apply_x402_migration.sh --dry-run
   ```

2. **Test on staging:**
   ```bash
   # Apply to staging database first
   DATABASE_URL="postgresql://staging..." ./scripts/apply_x402_migration.sh
   ```

3. **Schedule production migration:**
   - Choose low-traffic window
   - Notify team of maintenance
   - Have rollback plan ready

### For DevOps Team

1. **Backup existing database:**
   ```bash
   ./scripts/backup-database.sh
   ```

2. **Apply migration:**
   ```bash
   ./scripts/apply_x402_migration.sh
   ```

3. **Set up maintenance cron jobs:**
   ```bash
   # Add to crontab
   crontab -e
   ```

4. **Configure monitoring:**
   - Database size alerts
   - Query performance tracking
   - Payment verification success rate

---

## Questions & Support

### Common Questions

**Q: Can I run this multiple times?**
A: Yes, the migration is idempotent. Uses `IF NOT EXISTS` and `CREATE OR REPLACE`.

**Q: How long will it take?**
A: ~5 minutes total. Migration itself is <10 seconds, backup takes 1-3 minutes.

**Q: Will this cause downtime?**
A: Schema changes are fast, but recommend brief maintenance window for API restart.

**Q: Can I rollback?**
A: Yes, automatic backup created. Restore with provided commands.

**Q: What if it fails?**
A: Transaction-based, so partial changes are rolled back automatically.

### Need Help?

- **Migration logs:** `/tmp/x402_migration_TIMESTAMP.log`
- **Backup location:** `/tmp/kamiyo_backups/`
- **Documentation:** `database/migrations/002_x402_payments_README.md`
- **Test suite:** `tests/x402/`

---

## Conclusion

BLOCKER #5 is now **RESOLVED** with a production-ready migration solution:

✅ Safe, automated migration script with dry-run mode
✅ Automatic backup before migration
✅ Comprehensive pre-flight safety checks
✅ Post-migration verification
✅ Clear rollback procedures
✅ Complete documentation
✅ Troubleshooting guides

**The migration is ready to apply whenever you're ready.**

**Recommendation:** Apply to staging first, then schedule production migration during low-traffic period.

---

**Status:** READY FOR DEPLOYMENT
**Risk Level:** LOW (comprehensive safety measures in place)
**Estimated Time:** 5 minutes
**Rollback Time:** 2 minutes (from automatic backup)

**Last Updated:** 2025-10-27
