# Fix: Missing v_source_health View

## Problem

The `/health` API endpoint is failing with this error:

```
ERROR:database.postgres_manager:Transaction failed: relation "v_source_health" does not exist
LINE 1: SELECT * FROM v_source_health ORDER BY success_rate DESC
```

## Root Cause

The database view `v_source_health` was not created during the initial database setup. This view is used to monitor the health of data aggregation sources.

## Immediate Fix (Already Applied)

✅ The code has been updated to gracefully handle the missing view by using a fallback query.

**File Modified:** `/database/postgres_manager.py`

The `get_source_health()` method now:
1. Tries to query the view `v_source_health`
2. If the view doesn't exist, falls back to a direct query on the `sources` table
3. Returns an empty list if both fail (instead of crashing)

This means the API will no longer return 500 errors for `/health` endpoint.

## Permanent Fix (Apply Migration)

To create the view in the production database, run the migration:

### Option 1: Using the Migration Script

```bash
# From the kamiyo directory
cd database

# Run the migration tool
python3 apply_migration.py 002_create_source_health_view.sql
```

The script will:
1. Show you the migration SQL
2. Ask for confirmation
3. Apply the migration to your DATABASE_URL
4. Verify the view was created

### Option 2: Manual SQL

Connect to your production database and run:

```sql
CREATE OR REPLACE VIEW v_source_health AS
SELECT
    name,
    last_fetch,
    fetch_count,
    error_count,
    ROUND((1.0 * (fetch_count - error_count) / NULLIF(fetch_count, 0)) * 100, 2) as success_rate,
    is_active
FROM sources
WHERE fetch_count > 0;

-- Grant access
GRANT SELECT ON v_source_health TO PUBLIC;
```

### Option 3: Via Render Database Dashboard

1. Log in to Render
2. Go to your PostgreSQL database
3. Open the "SQL Editor" tab
4. Paste the SQL from Option 2
5. Click "Run"

## Verify the Fix

After applying the migration, verify it works:

```bash
# Check if view exists
psql $DATABASE_URL -c "\dv v_source_health"

# Query the view
psql $DATABASE_URL -c "SELECT * FROM v_source_health;"

# Test the API endpoint
curl https://your-api.com/health
```

## What the View Does

The `v_source_health` view provides:

- **name**: Source name (e.g., "Rekt News", "BlockSec")
- **last_fetch**: Last time source was fetched
- **fetch_count**: Total number of fetch attempts
- **error_count**: Number of failed fetches
- **success_rate**: Percentage of successful fetches
- **is_active**: Whether source is currently active

This is used for monitoring aggregator health on the dashboard.

## Files Created/Modified

### Modified
- `/database/postgres_manager.py` - Added fallback query logic

### Created
- `/database/migrations/002_create_source_health_view.sql` - Migration SQL
- `/database/apply_migration.py` - Migration application tool
- `/database/FIX_SOURCE_HEALTH_VIEW.md` - This documentation

## Status

- ✅ **Code Fix**: Applied (fallback query prevents 500 errors)
- ⏳ **Database Migration**: Pending (apply when convenient)

The API is now stable and won't crash. The migration is recommended but not urgent.
