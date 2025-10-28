# x402 Payment Tables Migration Guide

## Overview

This migration creates the database schema for the KAMIYO x402 Payment Facilitator system, which enables HTTP 402 payment-required access to the exploit database API using on-chain USDC payments.

**Migration File:** `002_x402_payments.sql`
**Status:** NOT YET APPLIED
**Created:** 2025-10-27

## What This Migration Creates

### Tables

#### 1. `x402_payments`
Main payment records table for tracking on-chain USDC payments.

**Purpose:** Store verified blockchain transactions that grant API access
**Key Fields:**
- `tx_hash` - Unique blockchain transaction hash
- `chain` - Blockchain network (base, ethereum, solana)
- `amount_usdc` - Payment amount in USDC
- `from_address` - Payer's wallet address
- `requests_allocated` - Number of API requests granted
- `requests_used` - Number of requests consumed
- `status` - Payment status (pending, verified, expired, used)
- `expires_at` - When the payment access expires

**Indexes:** 6 indexes for optimal query performance on tx_hash, chain, from_address, status, and timestamps

#### 2. `x402_tokens`
Payment access tokens for authenticated API requests.

**Purpose:** Map bearer tokens to payments for request authentication
**Key Fields:**
- `token_hash` - SHA256 hash of the access token
- `payment_id` - Foreign key to x402_payments
- `expires_at` - Token expiration timestamp

**Indexes:** 3 indexes on token_hash, payment_id, and expires_at

#### 3. `x402_usage`
API usage tracking per payment.

**Purpose:** Track every API request made with payment tokens for analytics and auditing
**Key Fields:**
- `payment_id` - Foreign key to x402_payments
- `endpoint` - API endpoint accessed
- `method` - HTTP method (GET, POST, etc.)
- `status_code` - HTTP response code
- `response_time_ms` - Request latency
- `ip_address` - Client IP address
- `user_agent` - Client user agent

**Indexes:** 3 indexes on payment_id, endpoint, and created_at

#### 4. `x402_analytics`
Aggregated payment analytics by hour.

**Purpose:** Pre-computed analytics for dashboards and reporting
**Key Fields:**
- `hour_bucket` - Hour timestamp for aggregation
- `chain` - Blockchain network
- `total_payments` - Count of payments in this hour
- `total_amount_usdc` - Sum of payments in this hour
- `total_requests` - Total API requests in this hour
- `unique_payers` - Count of unique payer addresses
- `average_payment_usdc` - Average payment amount

**Indexes:** 2 indexes on hour_bucket and chain
**Constraint:** Unique constraint on (hour_bucket, chain)

### Views

#### 1. `v_x402_active_payments`
Shows currently active payments with remaining request quotas.

**Query:**
```sql
SELECT * FROM v_x402_active_payments
WHERE from_address = '0xYourAddress';
```

#### 2. `v_x402_stats_24h`
Payment statistics by chain for the last 24 hours.

**Query:**
```sql
SELECT * FROM v_x402_stats_24h;
```

#### 3. `v_x402_top_payers`
Top 100 payers ranked by total spending.

**Query:**
```sql
SELECT * FROM v_x402_top_payers LIMIT 10;
```

#### 4. `v_x402_endpoint_stats`
API endpoint usage statistics for the last 24 hours.

**Query:**
```sql
SELECT * FROM v_x402_endpoint_stats
ORDER BY request_count DESC;
```

### Functions

#### 1. `cleanup_expired_x402_payments()`
Cleans up expired payment records.

**Purpose:** Mark expired verified payments and delete expired tokens
**Returns:** Number of expired payments updated
**Usage:**
```sql
SELECT cleanup_expired_x402_payments();
```

**Recommended:** Run every hour via cron or scheduler

#### 2. `update_x402_analytics()`
Updates hourly analytics aggregations.

**Purpose:** Pre-compute analytics for the previous hour
**Returns:** VOID
**Usage:**
```sql
SELECT update_x402_analytics();
```

**Recommended:** Run at the start of each hour (e.g., 00:05, 01:05, etc.)

## Database Size Estimates

Based on expected usage patterns:

| Component | Size per Record | Daily Growth | 30-Day Estimate |
|-----------|----------------|--------------|-----------------|
| x402_payments | ~200 bytes | 1,000 payments | ~6 MB |
| x402_tokens | ~100 bytes | 1,000 tokens | ~3 MB |
| x402_usage | ~150 bytes | 100,000 requests | ~450 MB |
| x402_analytics | ~100 bytes | 72 hourly records | ~216 KB |
| **Total** | | | **~459 MB/month** |

**Recommendation:** Implement archival strategy after 90 days for x402_usage table.

## Pre-Migration Checklist

- [ ] DATABASE_URL environment variable is set
- [ ] PostgreSQL client tools installed (psql, pg_dump)
- [ ] Database backup completed
- [ ] Maintenance window scheduled (estimated 2-5 minutes downtime)
- [ ] x402 configuration updated for database mode
- [ ] Environment variable X402_STORAGE_MODE=database ready

## Migration Execution

### Option 1: Automated Script (Recommended)

```bash
# Step 1: Dry run to preview changes
./scripts/apply_x402_migration.sh --dry-run

# Step 2: Apply migration with backup
./scripts/apply_x402_migration.sh

# Step 3: Verify tables exist
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'x402_%';"
```

### Option 2: Manual Application

```bash
# Step 1: Create backup
pg_dump $DATABASE_URL -F c > backup_pre_x402_$(date +%Y%m%d).dump

# Step 2: Apply migration
psql $DATABASE_URL -f database/migrations/002_x402_payments.sql

# Step 3: Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM x402_payments;"
```

### Option 3: Python Migration Runner

```bash
# Runs all pending migrations including x402
python scripts/run_migrations.py
```

## Post-Migration Verification

### 1. Verify Tables Created

```bash
psql $DATABASE_URL << EOF
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'x402_%'
ORDER BY tablename;
EOF
```

Expected output:
```
     tablename     | size
-------------------+------
 x402_analytics    | 8192 bytes
 x402_payments     | 8192 bytes
 x402_tokens       | 8192 bytes
 x402_usage        | 8192 bytes
```

### 2. Verify Views Created

```bash
psql $DATABASE_URL -c "SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'v_x402_%';"
```

Expected output:
```
       viewname
-----------------------
 v_x402_active_payments
 v_x402_endpoint_stats
 v_x402_stats_24h
 v_x402_top_payers
```

### 3. Verify Functions Created

```bash
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname LIKE '%x402%';"
```

Expected output:
```
           proname
--------------------------------
 cleanup_expired_x402_payments
 update_x402_analytics
```

### 4. Test Basic Operations

```sql
-- Test INSERT
INSERT INTO x402_payments (
    tx_hash, chain, amount_usdc, from_address, to_address,
    block_number, confirmations, status, requests_allocated, expires_at
) VALUES (
    'test_migration_check', 'base', 1.00,
    '0xtest', '0xkamiyo',
    12345, 1, 'verified', 100,
    NOW() + INTERVAL '1 hour'
);

-- Test SELECT
SELECT * FROM x402_payments WHERE tx_hash = 'test_migration_check';

-- Test VIEW
SELECT * FROM v_x402_active_payments;

-- Test FUNCTION
SELECT cleanup_expired_x402_payments();

-- Clean up test
DELETE FROM x402_payments WHERE tx_hash = 'test_migration_check';
```

## Configuration Updates Required

After migration, update the following configuration:

### 1. Environment Variables

Add to `.env` or environment:

```bash
# Enable database storage mode
X402_STORAGE_MODE=database

# Database connection (already set)
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

### 2. Application Configuration

Update `/Users/dennisgoslar/Projekter/kamiyo/api/x402/config.py`:

```python
STORAGE_MODE = os.getenv("X402_STORAGE_MODE", "database")  # Changed from "memory"
```

### 3. Restart Services

```bash
# Restart API services to apply new configuration
systemctl restart kamiyo-api  # or your deployment method
```

## Monitoring and Maintenance

### Daily Monitoring

```sql
-- Check payment statistics
SELECT * FROM v_x402_stats_24h;

-- Check active payments
SELECT COUNT(*) as active_payments,
       SUM(requests_allocated - requests_used) as remaining_requests
FROM v_x402_active_payments;

-- Check endpoint usage
SELECT * FROM v_x402_endpoint_stats
ORDER BY request_count DESC
LIMIT 10;
```

### Weekly Maintenance

```sql
-- Run cleanup function
SELECT cleanup_expired_x402_payments() as expired_count;

-- Check database size
SELECT
    pg_size_pretty(pg_database_size(current_database())) as total_size,
    pg_size_pretty(pg_total_relation_size('x402_usage')) as usage_table_size;
```

### Scheduled Tasks

Add to cron or scheduler:

```bash
# Cleanup expired payments every hour
0 * * * * psql $DATABASE_URL -c "SELECT cleanup_expired_x402_payments();"

# Update analytics at start of each hour
5 * * * * psql $DATABASE_URL -c "SELECT update_x402_analytics();"
```

## Rollback Procedure

If you need to rollback this migration:

### Option 1: Drop All Objects

```sql
-- Drop tables (CASCADE removes views automatically)
DROP TABLE IF EXISTS x402_analytics CASCADE;
DROP TABLE IF EXISTS x402_usage CASCADE;
DROP TABLE IF EXISTS x402_tokens CASCADE;
DROP TABLE IF EXISTS x402_payments CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_expired_x402_payments();
DROP FUNCTION IF EXISTS update_x402_analytics();
```

### Option 2: Restore from Backup

```bash
# Restore from backup created before migration
pg_restore -d $DATABASE_URL backup_pre_x402_20251027.dump
```

### Option 3: Use Migration Rollback Script

```sql
-- Create rollback migration file: 002_x402_payments_rollback.sql
DROP TABLE IF EXISTS x402_analytics CASCADE;
DROP TABLE IF EXISTS x402_usage CASCADE;
DROP TABLE IF EXISTS x402_tokens CASCADE;
DROP TABLE IF EXISTS x402_payments CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_x402_payments();
DROP FUNCTION IF EXISTS update_x402_analytics();
```

Then apply:
```bash
psql $DATABASE_URL -f database/migrations/002_x402_payments_rollback.sql
```

## Troubleshooting

### Issue: Tables Already Exist

**Error:** `relation "x402_payments" already exists`

**Solution:** The migration uses `CREATE TABLE IF NOT EXISTS`, so this shouldn't error. If it does, check for conflicting table definitions:

```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'x402_%';
```

### Issue: Permission Denied

**Error:** `permission denied for schema public`

**Solution:** Ensure database user has CREATE privileges:

```sql
GRANT CREATE ON SCHEMA public TO your_db_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_db_user;
```

### Issue: Foreign Key Constraint Fails

**Error:** Foreign key constraint violation

**Solution:** This shouldn't happen on initial migration. If it does, ensure tables are created in correct order (x402_payments first).

### Issue: Migration Takes Too Long

**Symptom:** Migration runs for more than 10 minutes

**Solution:** This is a schema-only migration with no data, so it should complete in seconds. If it hangs:

1. Check for locks: `SELECT * FROM pg_locks WHERE NOT granted;`
2. Check active queries: `SELECT * FROM pg_stat_activity;`
3. Kill blocking queries if necessary

## Security Considerations

1. **Token Hashes:** Tokens are stored as SHA256 hashes, never plaintext
2. **IP Tracking:** IP addresses are stored for fraud detection but should be handled per GDPR
3. **Access Control:** Ensure proper database user permissions (principle of least privilege)
4. **Backup Encryption:** Encrypt backups containing payment data
5. **Audit Logs:** x402_usage table provides comprehensive audit trail

## Integration with Existing Systems

This migration is part of the x402 payment system and integrates with:

- **Payment Verification:** `api/x402/payment_verifier.py` verifies blockchain payments
- **Payment Tracking:** `api/x402/payment_tracker.py` manages payment state
- **API Middleware:** `api/x402/middleware.py` enforces payment requirements
- **Routes:** `api/x402/routes.py` handles payment flow

## Performance Considerations

### Expected Query Performance

- Payment lookup by tx_hash: **< 1ms** (indexed)
- Token validation: **< 1ms** (indexed)
- Active payments view: **< 10ms** (materialized with WHERE)
- Analytics queries: **< 50ms** (pre-aggregated)

### Optimization Recommendations

1. **Indexes:** All critical indexes are included in migration
2. **Partitioning:** Consider partitioning x402_usage by date after 1M records
3. **Archival:** Move usage data > 90 days to archive table
4. **Vacuum:** Enable autovacuum for all tables

## Support and Resources

- **Migration Script:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/apply_x402_migration.sh`
- **Migration SQL:** `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments.sql`
- **Config File:** `/Users/dennisgoslar/Projekter/kamiyo/api/x402/config.py`
- **Tests:** `/Users/dennisgoslar/Projekter/kamiyo/tests/x402/`

## Version History

- **v1.0** (2025-10-27): Initial x402 payment tables schema
  - 4 tables: payments, tokens, usage, analytics
  - 4 views: active_payments, stats_24h, top_payers, endpoint_stats
  - 2 functions: cleanup, analytics update
  - 13 indexes for performance

## Sign-off

Before applying to production:

- [ ] Reviewed migration SQL
- [ ] Tested on staging environment
- [ ] Backup completed and verified
- [ ] Rollback procedure tested
- [ ] Team notified of maintenance window
- [ ] Monitoring alerts configured

**Applied by:** ___________________
**Date:** ___________________
**Environment:** ___________________
**Backup location:** ___________________
