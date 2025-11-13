#!/bin/bash
#
# ERC-8004 Deployment Verification Script
# Verifies production readiness of agent identity system
#

set -e

echo "=========================================="
echo "ERC-8004 Deployment Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

check_pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}⚠ WARN:${NC} $1"
}

# 1. Database Schema Verification
echo "1. Verifying Database Schema..."
if psql $DATABASE_URL -c "\dt erc8004_*" &>/dev/null; then
    TABLE_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'erc8004_%';" | tr -d ' ')
    if [ "$TABLE_COUNT" -ge 5 ]; then
        check_pass "Database tables exist ($TABLE_COUNT tables)"
    else
        check_fail "Insufficient tables found ($TABLE_COUNT < 5)"
    fi
else
    check_fail "Cannot connect to database"
fi

# 2. Index Verification
echo ""
echo "2. Verifying Database Indexes..."
INDEX_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename LIKE 'erc8004_%';" | tr -d ' ')
if [ "$INDEX_COUNT" -ge 15 ]; then
    check_pass "Database indexes created ($INDEX_COUNT indexes)"
else
    check_warn "Low index count ($INDEX_COUNT < 15)"
fi

# 3. Materialized Views
echo ""
echo "3. Verifying Materialized Views..."
MV_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_matviews WHERE matviewname LIKE 'mv_erc8004_%';" | tr -d ' ')
if [ "$MV_COUNT" -ge 2 ]; then
    check_pass "Materialized views created ($MV_COUNT views)"
else
    check_fail "Materialized views missing ($MV_COUNT < 2)"
fi

# 4. API Endpoint Availability
echo ""
echo "4. Verifying API Endpoints..."

API_BASE="${API_URL:-http://localhost:8000}"

# Test agent search endpoint
if curl -sf "$API_BASE/api/v1/agents/?limit=1" >/dev/null; then
    check_pass "Agent search endpoint responding"
else
    check_fail "Agent search endpoint not accessible"
fi

# Test supported chains endpoint
if curl -sf "$API_BASE/api/v1/x402/supported-chains" >/dev/null; then
    check_pass "Supported chains endpoint responding"
else
    check_warn "Supported chains endpoint not accessible"
fi

# 5. Python Dependencies
echo ""
echo "5. Verifying Python Dependencies..."

if python3 -c "import httpx" 2>/dev/null; then
    check_pass "httpx library installed"
else
    check_fail "httpx library missing"
fi

if python3 -c "from api.erc8004 import router" 2>/dev/null; then
    check_pass "ERC-8004 module importable"
else
    check_fail "ERC-8004 module import failed"
fi

# 6. Contract Deployment
echo ""
echo "6. Verifying Smart Contracts..."

if [ -f "contracts/deployments/base-deployment.json" ]; then
    check_pass "Contract deployment file exists"

    IDENTITY_REGISTRY=$(cat contracts/deployments/base-deployment.json | grep -o '"identityRegistry":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$IDENTITY_REGISTRY" ]; then
        check_pass "Identity registry address: $IDENTITY_REGISTRY"
    else
        check_fail "Identity registry address not found"
    fi
else
    check_warn "Contract deployment file not found (may not be deployed yet)"
fi

# 7. Environment Variables
echo ""
echo "7. Verifying Environment Variables..."

if [ -n "$DATABASE_URL" ]; then
    check_pass "DATABASE_URL configured"
else
    check_fail "DATABASE_URL not set"
fi

if [ -n "$ERC8004_IDENTITY_REGISTRY_BASE" ]; then
    check_pass "ERC8004_IDENTITY_REGISTRY_BASE configured"
else
    check_warn "ERC8004_IDENTITY_REGISTRY_BASE not set (testnet/dev only)"
fi

# 8. Database Constraints
echo ""
echo "8. Verifying Database Constraints..."

CONSTRAINT_COUNT=$(psql $DATABASE_URL -t -c "
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_name LIKE 'erc8004_%'
    AND constraint_type IN ('CHECK', 'FOREIGN KEY', 'UNIQUE');
" | tr -d ' ')

if [ "$CONSTRAINT_COUNT" -ge 20 ]; then
    check_pass "Database constraints in place ($CONSTRAINT_COUNT constraints)"
else
    check_warn "Low constraint count ($CONSTRAINT_COUNT < 20)"
fi

# 9. Trigger Verification
echo ""
echo "9. Verifying Database Triggers..."

TRIGGER_COUNT=$(psql $DATABASE_URL -t -c "
    SELECT COUNT(*) FROM information_schema.triggers
    WHERE event_object_table LIKE 'erc8004_%';
" | tr -d ' ')

if [ "$TRIGGER_COUNT" -ge 3 ]; then
    check_pass "Database triggers created ($TRIGGER_COUNT triggers)"
else
    check_warn "Low trigger count ($TRIGGER_COUNT < 3)"
fi

# 10. Security Features
echo ""
echo "10. Verifying Security Features..."

# Check for address validation regex
if grep -q "ETH_ADDRESS_REGEX" website/api/erc8004/validators.py; then
    check_pass "Address validation implemented"
else
    check_fail "Address validation missing"
fi

# Check for exception handling
if [ -f "website/api/erc8004/exceptions.py" ]; then
    check_pass "Custom exception classes exist"
else
    check_fail "Exception handling missing"
fi

# 11. Test Coverage
echo ""
echo "11. Verifying Test Coverage..."

if [ -f "website/tests/erc8004/test_production_readiness.py" ]; then
    check_pass "Production readiness tests exist"

    # Count test functions
    TEST_COUNT=$(grep -c "def test_" website/tests/erc8004/test_production_readiness.py || echo 0)
    if [ "$TEST_COUNT" -ge 10 ]; then
        check_pass "Comprehensive test suite ($TEST_COUNT tests)"
    else
        check_warn "Limited test coverage ($TEST_COUNT < 10 tests)"
    fi
else
    check_fail "Test suite missing"
fi

# 12. Documentation
echo ""
echo "12. Verifying Documentation..."

if [ -f "ERC8004_INTEGRATION.md" ]; then
    check_pass "Integration documentation exists"

    # Check documentation completeness
    if grep -q "API Endpoints" ERC8004_INTEGRATION.md && \
       grep -q "Database Schema" ERC8004_INTEGRATION.md && \
       grep -q "Smart Contracts" ERC8004_INTEGRATION.md; then
        check_pass "Documentation is comprehensive"
    else
        check_warn "Documentation may be incomplete"
    fi
else
    check_fail "Integration documentation missing"
fi

# 13. Performance Optimizations
echo ""
echo "13. Verifying Performance Optimizations..."

# Check for materialized view refresh function
if psql $DATABASE_URL -c "\df refresh_erc8004_stats" &>/dev/null; then
    check_pass "Materialized view refresh function exists"
else
    check_warn "Manual materialized view refresh may be needed"
fi

# 14. Rollback Capability
echo ""
echo "14. Verifying Rollback Capability..."

if [ -f "website/database/migrations/017_rollback_erc8004.sql" ]; then
    check_pass "Rollback migration exists"
else
    check_fail "Rollback migration missing"
fi

# Summary
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo "System is ready for production deployment."
    exit 0
elif [ "$FAIL_COUNT" -le 2 ]; then
    echo -e "${YELLOW}⚠ Minor issues detected.${NC}"
    echo "Review failures before production deployment."
    exit 1
else
    echo -e "${RED}✗ Critical issues detected.${NC}"
    echo "Fix failures before proceeding with deployment."
    exit 1
fi
