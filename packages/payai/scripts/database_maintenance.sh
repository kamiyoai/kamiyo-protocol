#!/bin/bash
# =====================================================
# Database Maintenance Script
# Performs VACUUM, ANALYZE, REINDEX, and other maintenance tasks
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://localhost/kamiyo}"
LOG_DIR="./maintenance_logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/maintenance_${TIMESTAMP}.log"

# Maintenance settings
VACUUM_ANALYZE="${VACUUM_ANALYZE:-true}"
REINDEX="${REINDEX:-false}"  # REINDEX is more aggressive, set to true for deep maintenance
REFRESH_MATERIALIZED_VIEWS="${REFRESH_MATERIALIZED_VIEWS:-true}"
CLEANUP_OLD_PARTITIONS="${CLEANUP_OLD_PARTITIONS:-false}"
ARCHIVE_OLD_DATA="${ARCHIVE_OLD_DATA:-false}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Database Maintenance Tool${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Create log directory
mkdir -p "${LOG_DIR}"

# Function to log messages
log() {
    local message="$1"
    echo -e "${message}" | tee -a "${LOG_FILE}"
}

# Function to run SQL query
run_query() {
    local query="$1"
    psql "${DATABASE_URL}" -c "${query}" 2>&1 | tee -a "${LOG_FILE}"
}

# Start maintenance
log "${BLUE}Starting database maintenance at $(date)${NC}"
log "Database: ${DATABASE_URL}"
log ""

# =====================================================
# 1. DATABASE STATISTICS BEFORE MAINTENANCE
# =====================================================

log "${YELLOW}========================================${NC}"
log "${YELLOW}1. Database Statistics (Before)${NC}"
log "${YELLOW}========================================${NC}"
log ""

log "Database size:"
run_query "SELECT pg_size_pretty(pg_database_size(current_database()));"
log ""

log "Table sizes:"
run_query "
    SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10;
"
log ""

log "Dead tuples:"
run_query "
    SELECT
        schemaname,
        tablename,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND n_dead_tup > 0
    ORDER BY n_dead_tup DESC
    LIMIT 10;
"
log ""

# =====================================================
# 2. VACUUM ANALYZE
# =====================================================

if [ "${VACUUM_ANALYZE}" = "true" ]; then
    log "${YELLOW}========================================${NC}"
    log "${YELLOW}2. VACUUM ANALYZE${NC}"
    log "${YELLOW}========================================${NC}"
    log ""

    log "Running VACUUM ANALYZE on all tables..."
    start_time=$(date +%s)

    # Get list of tables
    tables=$(psql "${DATABASE_URL}" -t -c "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    " | sed 's/^ *//;s/ *$//')

    # VACUUM ANALYZE each table
    for table in $tables; do
        if [ ! -z "$table" ]; then
            log "  VACUUM ANALYZE ${table}..."
            run_query "VACUUM ANALYZE ${table};" > /dev/null 2>&1 || log "    ${RED}Failed${NC}"
        fi
    done

    end_time=$(date +%s)
    duration=$((end_time - start_time))
    log "${GREEN}VACUUM ANALYZE completed in ${duration}s${NC}"
    log ""
else
    log "Skipping VACUUM ANALYZE (disabled)"
    log ""
fi

# =====================================================
# 3. REINDEX
# =====================================================

if [ "${REINDEX}" = "true" ]; then
    log "${YELLOW}========================================${NC}"
    log "${YELLOW}3. REINDEX${NC}"
    log "${YELLOW}========================================${NC}"
    log ""

    log "${RED}WARNING: REINDEX will lock tables. Use during maintenance window only.${NC}"
    log "Running REINDEX on all tables..."
    start_time=$(date +%s)

    # Get list of tables
    tables=$(psql "${DATABASE_URL}" -t -c "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    " | sed 's/^ *//;s/ *$//')

    # REINDEX each table
    for table in $tables; do
        if [ ! -z "$table" ]; then
            log "  REINDEX ${table}..."
            run_query "REINDEX TABLE ${table};" > /dev/null 2>&1 || log "    ${RED}Failed${NC}"
        fi
    done

    end_time=$(date +%s)
    duration=$((end_time - start_time))
    log "${GREEN}REINDEX completed in ${duration}s${NC}"
    log ""
else
    log "Skipping REINDEX (disabled - set REINDEX=true to enable)"
    log ""
fi

# =====================================================
# 4. REFRESH MATERIALIZED VIEWS
# =====================================================

if [ "${REFRESH_MATERIALIZED_VIEWS}" = "true" ]; then
    log "${YELLOW}========================================${NC}"
    log "${YELLOW}4. Refresh Materialized Views${NC}"
    log "${YELLOW}========================================${NC}"
    log ""

    # Check if materialized views exist
    mv_count=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*)
        FROM pg_matviews
        WHERE schemaname = 'public';
    " | xargs)

    if [ "$mv_count" -gt 0 ]; then
        log "Found ${mv_count} materialized views to refresh"

        # Get list of materialized views
        mvs=$(psql "${DATABASE_URL}" -t -c "
            SELECT matviewname
            FROM pg_matviews
            WHERE schemaname = 'public'
            ORDER BY matviewname;
        " | sed 's/^ *//;s/ *$//')

        # Refresh each materialized view
        for mv in $mvs; do
            if [ ! -z "$mv" ]; then
                log "  Refreshing ${mv}..."
                start_time=$(date +%s)
                run_query "REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv};" > /dev/null 2>&1 || {
                    log "    ${YELLOW}Concurrent refresh failed, trying non-concurrent...${NC}"
                    run_query "REFRESH MATERIALIZED VIEW ${mv};" > /dev/null 2>&1 || log "    ${RED}Failed${NC}"
                }
                end_time=$(date +%s)
                duration=$((end_time - start_time))
                log "    ${GREEN}Done in ${duration}s${NC}"
            fi
        done
        log ""
    else
        log "No materialized views found"
        log ""
    fi
else
    log "Skipping materialized view refresh (disabled)"
    log ""
fi

# =====================================================
# 5. CLEANUP OLD PARTITIONS
# =====================================================

if [ "${CLEANUP_OLD_PARTITIONS}" = "true" ]; then
    log "${YELLOW}========================================${NC}"
    log "${YELLOW}5. Cleanup Old Partitions${NC}"
    log "${YELLOW}========================================${NC}"
    log ""

    log "Checking for old partitions to drop..."

    # Find old usage_history partitions (>90 days old)
    old_partitions=$(psql "${DATABASE_URL}" -t -c "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'usage_history_%'
        AND tablename < 'usage_history_' || TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY_MM')
        ORDER BY tablename;
    " | sed 's/^ *//;s/ *$//')

    if [ ! -z "$old_partitions" ]; then
        for partition in $old_partitions; do
            if [ ! -z "$partition" ]; then
                log "  Dropping old partition: ${partition}"
                run_query "DROP TABLE IF EXISTS ${partition};" > /dev/null 2>&1 || log "    ${RED}Failed${NC}"
            fi
        done
        log "${GREEN}Old partitions cleaned up${NC}"
    else
        log "No old partitions to clean up"
    fi
    log ""
else
    log "Skipping partition cleanup (disabled)"
    log ""
fi

# =====================================================
# 6. DATA ARCHIVAL
# =====================================================

if [ "${ARCHIVE_OLD_DATA}" = "true" ]; then
    log "${YELLOW}========================================${NC}"
    log "${YELLOW}6. Data Archival${NC}"
    log "${YELLOW}========================================${NC}"
    log ""

    log "Running data archival..."

    # Check if archival Python script exists
    if [ -f "../database/archival.py" ]; then
        log "Running archival script..."
        python3 ../database/archival.py 2>&1 | tee -a "${LOG_FILE}" || log "  ${RED}Archival failed${NC}"
    else
        log "  ${YELLOW}Archival script not found, skipping${NC}"
    fi
    log ""
else
    log "Skipping data archival (disabled)"
    log ""
fi

# =====================================================
# 7. UPDATE TABLE STATISTICS
# =====================================================

log "${YELLOW}========================================${NC}"
log "${YELLOW}7. Update Table Statistics${NC}"
log "${YELLOW}========================================${NC}"
log ""

log "Running ANALYZE to update query planner statistics..."
run_query "ANALYZE;" > /dev/null 2>&1
log "${GREEN}Statistics updated${NC}"
log ""

# =====================================================
# 8. CHECK FOR INDEX BLOAT
# =====================================================

log "${YELLOW}========================================${NC}"
log "${YELLOW}8. Index Bloat Check${NC}"
log "${YELLOW}========================================${NC}"
log ""

log "Checking for bloated indexes..."
run_query "
    SELECT
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        idx_scan as index_scans
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND pg_relation_size(indexrelid) > 1024 * 1024  -- Larger than 1MB
    AND idx_scan < 100  -- Less than 100 scans
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 10;
"
log ""

# =====================================================
# 9. CONNECTION CLEANUP
# =====================================================

log "${YELLOW}========================================${NC}"
log "${YELLOW}9. Connection Cleanup${NC}"
log "${YELLOW}========================================${NC}"
log ""

log "Terminating idle connections (idle > 1 hour)..."
run_query "
    SELECT
        pid,
        usename,
        state,
        state_change
    FROM pg_stat_activity
    WHERE state = 'idle'
    AND state_change < NOW() - INTERVAL '1 hour'
    AND pid <> pg_backend_pid();
"

# Optionally terminate them (commented out for safety)
# run_query "
#     SELECT pg_terminate_backend(pid)
#     FROM pg_stat_activity
#     WHERE state = 'idle'
#     AND state_change < NOW() - INTERVAL '1 hour'
#     AND pid <> pg_backend_pid();
# "

log ""

# =====================================================
# 10. DATABASE STATISTICS AFTER MAINTENANCE
# =====================================================

log "${YELLOW}========================================${NC}"
log "${YELLOW}10. Database Statistics (After)${NC}"
log "${YELLOW}========================================${NC}"
log ""

log "Database size:"
run_query "SELECT pg_size_pretty(pg_database_size(current_database()));"
log ""

log "Cache hit ratio:"
run_query "
    SELECT
        'index hit rate' as metric,
        ROUND(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit + idx_blks_read), 0), 2) || '%' as percentage
    FROM pg_statio_user_indexes
    UNION ALL
    SELECT
        'table hit rate' as metric,
        ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0), 2) || '%' as percentage
    FROM pg_statio_user_tables;
"
log ""

log "Dead tuples after maintenance:"
run_query "
    SELECT
        schemaname,
        tablename,
        n_dead_tup as dead_tuples,
        n_live_tup as live_tuples,
        ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND n_dead_tup > 0
    ORDER BY n_dead_tup DESC
    LIMIT 10;
"
log ""

# =====================================================
# SUMMARY
# =====================================================

log "${GREEN}========================================${NC}"
log "${GREEN}Database Maintenance Complete!${NC}"
log "${GREEN}========================================${NC}"
log ""

log "Maintenance completed at $(date)"
log "Log file: ${LOG_FILE}"
log ""

log "${BLUE}Tasks performed:${NC}"
[ "${VACUUM_ANALYZE}" = "true" ] && log "  ✅ VACUUM ANALYZE" || log "  ⏭️  VACUUM ANALYZE (skipped)"
[ "${REINDEX}" = "true" ] && log "  ✅ REINDEX" || log "  ⏭️  REINDEX (skipped)"
[ "${REFRESH_MATERIALIZED_VIEWS}" = "true" ] && log "  ✅ Refresh Materialized Views" || log "  ⏭️  Refresh Materialized Views (skipped)"
[ "${CLEANUP_OLD_PARTITIONS}" = "true" ] && log "  ✅ Cleanup Old Partitions" || log "  ⏭️  Cleanup Old Partitions (skipped)"
[ "${ARCHIVE_OLD_DATA}" = "true" ] && log "  ✅ Data Archival" || log "  ⏭️  Data Archival (skipped)"
log ""

log "${YELLOW}Next Steps:${NC}"
log "  - Review the log file for any errors"
log "  - Monitor database performance after maintenance"
log "  - Schedule this script to run regularly (e.g., nightly)"
log ""

echo -e "${GREEN}Maintenance log saved to: ${LOG_FILE}${NC}"
