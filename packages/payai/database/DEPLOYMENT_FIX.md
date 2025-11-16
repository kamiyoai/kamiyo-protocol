# Production Deployment Fixes

## Issues Fixed

1. **Missing v_stats_24h database view**
2. **Redis connection failures (graceful degradation)**
3. **JSON serialization errors for Decimal and datetime types**

## Required Actions

### 1. Apply Database Migration

Run the new migration on your Render PostgreSQL database:

```bash
# Connect to your Render PostgreSQL instance
# Get connection string from Render dashboard

psql $DATABASE_URL -f database/migrations/015_add_stats_views.sql
```

Or run directly on Render:
1. Go to Render Dashboard > Your PostgreSQL instance
2. Open Shell
3. Paste the contents of `database/migrations/015_add_stats_views.sql`

### 2. Redis Configuration (Optional)

**Option A: Add Redis to Render**

1. Add Redis service on Render
2. Set `REDIS_URL` environment variable in your web service:
   ```
   REDIS_URL=redis://your-redis-instance:6379/0
   ```

**Option B: Run without Redis (L1 cache only)**

The application now gracefully degrades to in-memory L1 cache only.
No action needed - it will log warnings but continue operating.

### 3. Deploy Updated Code

Deploy the updated cache_manager.py to production:

```bash
git add caching/cache_manager.py database/migrations/015_add_stats_views.sql
git commit -m "Fix production cache and database issues"
git push
```

## Verification

After deployment, check logs for:

1. **Database view created**:
   - No more "relation v_stats_24h does not exist" errors

2. **Redis graceful degradation**:
   - If Redis unavailable: "Redis unavailable, running without L2 cache" warning
   - If Redis available: "Connected to Redis" info message

3. **No serialization errors**:
   - No more "Object of type Decimal is not JSON serializable" errors
   - No more "Object of type datetime is not JSON serializable" errors

## Testing

Test the /stats endpoint:

```bash
curl https://kamiyo-api.onrender.com/stats?days=1
```

Should return:
```json
{
  "total_exploits": 123,
  "total_loss_usd": 1234567.89,
  "chains_affected": 5,
  "protocols_affected": 10
}
```

## Rollback (if needed)

If issues occur, the changes are backward compatible:
- Migration creates views with `OR REPLACE` (idempotent)
- Cache manager falls back to L1 only if Redis unavailable
- JSON encoder handles both old and new data types

No rollback needed unless critical issues arise.
