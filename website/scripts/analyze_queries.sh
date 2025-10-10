#!/bin/bash
# =====================================================
# Query Analysis Script
# Analyzes SQL queries, identifies missing indexes, and generates optimization report
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
OUTPUT_DIR="./query_analysis_reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${OUTPUT_DIR}/query_analysis_${TIMESTAMP}.txt"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Query Analysis Tool${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Function to run SQL query and capture output
run_query() {
    local query="$1"
    psql "${DATABASE_URL}" -t -c "${query}" 2>&1
}

# Function to analyze query with EXPLAIN
explain_query() {
    local query="$1"
    local label="$2"

    echo -e "${YELLOW}Analyzing: ${label}${NC}"
    echo "Query: ${query}"

    local explain_result=$(psql "${DATABASE_URL}" -c "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}" 2>&1)

    echo "${explain_result}"
    echo ""

    # Check for sequential scans
    if echo "${explain_result}" | grep -q "Seq Scan"; then
        echo -e "${RED}⚠️  Sequential scan detected - consider adding index${NC}"
    fi

    # Check for high cost
    local cost=$(echo "${explain_result}" | grep -oP 'cost=\K[\d.]+' | head -1)
    if [ ! -z "${cost}" ] && (( $(echo "${cost} > 1000" | bc -l) )); then
        echo -e "${YELLOW}⚠️  High query cost: ${cost}${NC}"
    fi

    echo ""
}

# Start report
{
    echo "========================================"
    echo "Query Analysis Report"
    echo "Generated: $(date)"
    echo "Database: ${DATABASE_URL}"
    echo "========================================"
    echo ""

    # =====================================================
    # 1. ANALYZE ALL SQL QUERIES IN CODEBASE
    # =====================================================

    echo "========================================"
    echo "1. SQL QUERIES IN CODEBASE"
    echo "========================================"
    echo ""

    # Find all SQL queries in Python files
    echo "Scanning Python files for SQL queries..."
    grep -r -n "SELECT\|INSERT\|UPDATE\|DELETE" \
        --include="*.py" \
        ../database/ ../api/ ../aggregators/ 2>/dev/null | \
        grep -v ".pyc" | \
        head -50
    echo ""

    # =====================================================
    # 2. INDEX USAGE STATISTICS
    # =====================================================

    echo "========================================"
    echo "2. INDEX USAGE STATISTICS"
    echo "========================================"
    echo ""

    run_query "
        SELECT
            schemaname,
            tablename,
            indexname,
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan ASC
        LIMIT 20;
    "
    echo ""

    # =====================================================
    # 3. UNUSED INDEXES
    # =====================================================

    echo "========================================"
    echo "3. UNUSED INDEXES (Never Used)"
    echo "========================================"
    echo ""

    run_query "
        SELECT
            schemaname,
            tablename,
            indexname,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        AND idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
        ORDER BY pg_relation_size(indexrelid) DESC;
    "
    echo ""

    # =====================================================
    # 4. MISSING INDEXES DETECTION
    # =====================================================

    echo "========================================"
    echo "4. MISSING INDEXES DETECTION"
    echo "========================================"
    echo ""

    # Check for sequential scans on large tables
    echo "Tables with sequential scans (potential missing indexes):"
    run_query "
        SELECT
            schemaname,
            tablename,
            seq_scan,
            seq_tup_read,
            idx_scan,
            seq_tup_read / seq_scan as avg_seq_read,
            pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND seq_scan > 0
        ORDER BY seq_tup_read DESC
        LIMIT 10;
    "
    echo ""

    # =====================================================
    # 5. TABLE BLOAT ANALYSIS
    # =====================================================

    echo "========================================"
    echo "5. TABLE BLOAT ANALYSIS"
    echo "========================================"
    echo ""

    run_query "
        SELECT
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
            pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10;
    "
    echo ""

    # =====================================================
    # 6. SLOW QUERIES FROM pg_stat_statements
    # =====================================================

    echo "========================================"
    echo "6. SLOW QUERIES (pg_stat_statements)"
    echo "========================================"
    echo ""

    # Check if pg_stat_statements is enabled
    if run_query "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';" | grep -q "pg_stat_statements"; then
        echo "pg_stat_statements is enabled"
        echo ""

        run_query "
            SELECT
                LEFT(query, 100) as query_preview,
                calls,
                ROUND(total_exec_time::numeric, 2) as total_time_ms,
                ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
                ROUND(max_exec_time::numeric, 2) as max_time_ms,
                ROUND(stddev_exec_time::numeric, 2) as stddev_time_ms
            FROM pg_stat_statements
            WHERE query NOT LIKE '%pg_stat_statements%'
            ORDER BY mean_exec_time DESC
            LIMIT 20;
        "
    else
        echo "⚠️  pg_stat_statements extension is not enabled"
        echo "To enable: CREATE EXTENSION pg_stat_statements;"
    fi
    echo ""

    # =====================================================
    # 7. CONNECTION AND ACTIVITY STATS
    # =====================================================

    echo "========================================"
    echo "7. CONNECTION AND ACTIVITY STATS"
    echo "========================================"
    echo ""

    echo "Active connections:"
    run_query "
        SELECT
            datname,
            COUNT(*) as connections,
            COUNT(*) FILTER (WHERE state = 'active') as active,
            COUNT(*) FILTER (WHERE state = 'idle') as idle,
            COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        GROUP BY datname;
    "
    echo ""

    # =====================================================
    # 8. CACHE HIT RATIO
    # =====================================================

    echo "========================================"
    echo "8. CACHE HIT RATIO"
    echo "========================================"
    echo ""

    run_query "
        SELECT
            'index hit rate' as metric,
            ROUND(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit + idx_blks_read), 0), 2) as percentage
        FROM pg_statio_user_indexes
        UNION ALL
        SELECT
            'table hit rate' as metric,
            ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0), 2) as percentage
        FROM pg_statio_user_tables;
    "
    echo ""

    # =====================================================
    # 9. ANALYZE COMMON QUERIES
    # =====================================================

    echo "========================================"
    echo "9. EXPLAIN ANALYZE - COMMON QUERIES"
    echo "========================================"
    echo ""

    # Check if tables exist before running queries
    if run_query "SELECT to_regclass('public.exploits');" | grep -q "exploits"; then
        echo "Analyzing exploit listing query..."
        explain_query "SELECT * FROM exploits WHERE chain = 'ethereum' ORDER BY created_at DESC LIMIT 100;" "Exploit Listing"

        echo "Analyzing exploit search by amount..."
        explain_query "SELECT * FROM exploits WHERE amount_usd > 1000000 ORDER BY amount_usd DESC LIMIT 50;" "High Value Exploits"

        echo "Analyzing exploit aggregation..."
        explain_query "SELECT chain, COUNT(*), SUM(amount_usd) FROM exploits GROUP BY chain;" "Exploits by Chain"
    fi

    if run_query "SELECT to_regclass('public.subscriptions');" | grep -q "subscriptions"; then
        echo "Analyzing subscription lookup..."
        explain_query "SELECT * FROM subscriptions WHERE user_id = '123' AND status = 'active';" "Active Subscription Lookup"
    fi

    if run_query "SELECT to_regclass('public.usage_history');" | grep -q "usage_history"; then
        echo "Analyzing usage tracking..."
        explain_query "SELECT COUNT(*) FROM usage_history WHERE user_id = '123' AND timestamp >= NOW() - INTERVAL '1 day';" "Daily Usage Count"
    fi

    echo ""

    # =====================================================
    # 10. INDEX RECOMMENDATIONS
    # =====================================================

    echo "========================================"
    echo "10. INDEX RECOMMENDATIONS"
    echo "========================================"
    echo ""

    echo "Based on analysis, consider these indexes:"
    echo ""

    # Analyze which columns are frequently used in WHERE clauses
    echo "Frequently filtered columns (from query patterns):"
    echo "  - exploits.chain (used in WHERE clauses)"
    echo "  - exploits.amount_usd (used for filtering high-value)"
    echo "  - exploits.created_at (used for sorting)"
    echo "  - subscriptions.user_id + status (composite lookup)"
    echo "  - usage_history.user_id + timestamp (rate limiting)"
    echo ""

    echo "Recommended indexes (if not already created):"
    echo "  CREATE INDEX idx_exploits_chain_created ON exploits(chain, created_at DESC);"
    echo "  CREATE INDEX idx_exploits_amount_desc ON exploits(amount_usd DESC) WHERE amount_usd > 1000000;"
    echo "  CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status) WHERE status = 'active';"
    echo "  CREATE INDEX idx_usage_user_timestamp ON usage_history(user_id, timestamp DESC);"
    echo ""

    # =====================================================
    # 11. QUERY OPTIMIZATION TIPS
    # =====================================================

    echo "========================================"
    echo "11. QUERY OPTIMIZATION TIPS"
    echo "========================================"
    echo ""

    echo "General Optimization Tips:"
    echo "  1. Use EXPLAIN ANALYZE to understand query plans"
    echo "  2. Add indexes on columns used in WHERE, JOIN, and ORDER BY"
    echo "  3. Use covering indexes for frequently accessed column sets"
    echo "  4. Consider partial indexes for filtered queries"
    echo "  5. Use LIMIT to reduce result set size"
    echo "  6. Avoid SELECT * - specify needed columns"
    echo "  7. Use connection pooling to reduce connection overhead"
    echo "  8. Regular VACUUM ANALYZE to update statistics"
    echo "  9. Monitor cache hit ratio (target >99%)"
    echo " 10. Use materialized views for expensive aggregations"
    echo ""

    # =====================================================
    # 12. PERFORMANCE BENCHMARKS
    # =====================================================

    echo "========================================"
    echo "12. PERFORMANCE BENCHMARKS"
    echo "========================================"
    echo ""

    if run_query "SELECT to_regclass('public.exploits');" | grep -q "exploits"; then
        echo "Benchmarking simple SELECT..."
        time_start=$(date +%s.%N)
        run_query "SELECT * FROM exploits LIMIT 1;" > /dev/null
        time_end=$(date +%s.%N)
        time_elapsed=$(echo "$time_end - $time_start" | bc)
        echo "Simple SELECT: ${time_elapsed}s"

        echo "Benchmarking COUNT(*)..."
        time_start=$(date +%s.%N)
        run_query "SELECT COUNT(*) FROM exploits;" > /dev/null
        time_end=$(date +%s.%N)
        time_elapsed=$(echo "$time_end - $time_start" | bc)
        echo "COUNT(*): ${time_elapsed}s"

        echo "Benchmarking ORDER BY with LIMIT..."
        time_start=$(date +%s.%N)
        run_query "SELECT * FROM exploits ORDER BY created_at DESC LIMIT 100;" > /dev/null
        time_end=$(date +%s.%N)
        time_elapsed=$(echo "$time_end - $time_start" | bc)
        echo "ORDER BY + LIMIT: ${time_elapsed}s"
    fi

    echo ""

    # =====================================================
    # SUMMARY
    # =====================================================

    echo "========================================"
    echo "SUMMARY"
    echo "========================================"
    echo ""
    echo "Report generated: ${TIMESTAMP}"
    echo "Saved to: ${REPORT_FILE}"
    echo ""
    echo "Next Steps:"
    echo "  1. Review unused indexes and consider dropping them"
    echo "  2. Add recommended indexes for frequently used queries"
    echo "  3. Run VACUUM ANALYZE on tables with high dead tuple %"
    echo "  4. Enable pg_stat_statements if not already enabled"
    echo "  5. Monitor slow queries and optimize them"
    echo "  6. Review cache hit ratio and tune if needed"
    echo ""

} | tee "${REPORT_FILE}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Query Analysis Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Report saved to: ${REPORT_FILE}${NC}"
echo ""

# Generate summary stats
echo -e "${BLUE}Quick Stats:${NC}"
echo "  - Total tables analyzed: $(run_query "SELECT COUNT(*) FROM pg_stat_user_tables WHERE schemaname = 'public';" | xargs)"
echo "  - Total indexes: $(run_query "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" | xargs)"
echo "  - Database size: $(run_query "SELECT pg_size_pretty(pg_database_size(current_database()));" | xargs)"
echo ""

echo -e "${YELLOW}Tip: Run this script regularly to monitor query performance!${NC}"
