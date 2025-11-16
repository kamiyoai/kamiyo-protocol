#!/bin/bash
# scripts/verify_x402_migration.sh
# Verify x402 migration was applied correctly
#
# USAGE:
#   ./scripts/verify_x402_migration.sh

set -e

# Colors
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

echo ""
echo "========================================================================"
echo "  x402 Migration Verification"
echo "========================================================================"
echo ""

# Check DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
    echo -e "${RED}[ERROR]${NC} DATABASE_URL not set"
    exit 1
fi

DB_INFO=$(echo "$DATABASE_URL" | sed 's/.*@//' | sed 's/\?.*//')
echo -e "${BLUE}[INFO]${NC} Database: ${DB_INFO}"
echo ""

# Test connection
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}[ERROR]${NC} Failed to connect to database"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Database connection successful"
echo ""

# Check tables
echo "Checking tables..."
TABLES=("x402_payments" "x402_tokens" "x402_usage" "x402_analytics")
TABLE_COUNT=0

for table in "${TABLES[@]}"; do
    EXISTS=$(psql "$DATABASE_URL" -t -c \
        "SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '$table'
        );" | xargs)

    if [ "$EXISTS" = "t" ]; then
        ROWS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM $table;" | xargs)
        echo -e "  ${GREEN}✓${NC} $table (${ROWS} rows)"
        ((TABLE_COUNT++))
    else
        echo -e "  ${RED}✗${NC} $table NOT FOUND"
    fi
done

echo ""

# Check views
echo "Checking views..."
VIEWS=("v_x402_active_payments" "v_x402_stats_24h" "v_x402_top_payers" "v_x402_endpoint_stats")
VIEW_COUNT=0

for view in "${VIEWS[@]}"; do
    EXISTS=$(psql "$DATABASE_URL" -t -c \
        "SELECT EXISTS (
            SELECT FROM information_schema.views
            WHERE table_schema = 'public' AND table_name = '$view'
        );" | xargs)

    if [ "$EXISTS" = "t" ]; then
        echo -e "  ${GREEN}✓${NC} $view"
        ((VIEW_COUNT++))
    else
        echo -e "  ${RED}✗${NC} $view NOT FOUND"
    fi
done

echo ""

# Check functions
echo "Checking functions..."
FUNCTIONS=("cleanup_expired_x402_payments" "update_x402_analytics")
FUNC_COUNT=0

for func in "${FUNCTIONS[@]}"; do
    EXISTS=$(psql "$DATABASE_URL" -t -c \
        "SELECT EXISTS (
            SELECT FROM pg_proc WHERE proname = '$func'
        );" | xargs)

    if [ "$EXISTS" = "t" ]; then
        echo -e "  ${GREEN}✓${NC} ${func}()"
        ((FUNC_COUNT++))
    else
        echo -e "  ${RED}✗${NC} ${func}() NOT FOUND"
    fi
done

echo ""

# Check indexes
echo "Checking indexes..."
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c \
    "SELECT COUNT(*) FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE 'idx_x402_%';" | xargs)

echo -e "  ${GREEN}✓${NC} Found ${INDEX_COUNT} x402 indexes (expected: 13)"
echo ""

# Summary
echo "========================================================================"
echo "  Summary"
echo "========================================================================"
echo ""

EXPECTED_TABLES=4
EXPECTED_VIEWS=4
EXPECTED_FUNCS=2

ALL_GOOD=true

if [ "$TABLE_COUNT" -eq "$EXPECTED_TABLES" ]; then
    echo -e "${GREEN}✓${NC} Tables: ${TABLE_COUNT}/${EXPECTED_TABLES}"
else
    echo -e "${RED}✗${NC} Tables: ${TABLE_COUNT}/${EXPECTED_TABLES}"
    ALL_GOOD=false
fi

if [ "$VIEW_COUNT" -eq "$EXPECTED_VIEWS" ]; then
    echo -e "${GREEN}✓${NC} Views: ${VIEW_COUNT}/${EXPECTED_VIEWS}"
else
    echo -e "${RED}✗${NC} Views: ${VIEW_COUNT}/${EXPECTED_VIEWS}"
    ALL_GOOD=false
fi

if [ "$FUNC_COUNT" -eq "$EXPECTED_FUNCS" ]; then
    echo -e "${GREEN}✓${NC} Functions: ${FUNC_COUNT}/${EXPECTED_FUNCS}"
else
    echo -e "${RED}✗${NC} Functions: ${FUNC_COUNT}/${EXPECTED_FUNCS}"
    ALL_GOOD=false
fi

if [ "$INDEX_COUNT" -eq 13 ]; then
    echo -e "${GREEN}✓${NC} Indexes: ${INDEX_COUNT}/13"
else
    echo -e "${YELLOW}⚠${NC} Indexes: ${INDEX_COUNT}/13 (expected 13)"
fi

echo ""

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✓ Migration verification PASSED${NC}"
    echo ""
    echo "x402 database tables are ready to use!"
    echo ""
    echo "Next steps:"
    echo "  1. Set X402_STORAGE_MODE=database in environment"
    echo "  2. Restart API services"
    echo "  3. Test payment flow"
    exit 0
else
    echo -e "${RED}✗ Migration verification FAILED${NC}"
    echo ""
    echo "Some database objects are missing."
    echo "Run: ./scripts/apply_x402_migration.sh"
    exit 1
fi
