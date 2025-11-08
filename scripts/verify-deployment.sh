#!/bin/bash

# x402 Infrastructure Deployment Verification Script
#
# Verifies that all systems are operational after deployment
#
# Usage:
#   ./scripts/verify-deployment.sh [environment]
#
# Arguments:
#   environment - staging, production (default: staging)

set -e

ENVIRONMENT="${1:-staging}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
if [ "$ENVIRONMENT" = "production" ]; then
    BASE_URL="https://kamiyo.ai"
elif [ "$ENVIRONMENT" = "staging" ]; then
    BASE_URL="${STAGING_URL:-https://staging.kamiyo.ai}"
else
    echo -e "${RED}Invalid environment: $ENVIRONMENT${NC}"
    echo "Usage: $0 [staging|production]"
    exit 1
fi

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  x402 Infrastructure Deployment Check${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo ""

PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name="$1"
    local method="$2"
    local path="$3"
    local expected_status="$4"
    local headers="$5"

    printf "%-50s " "$name"

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$path" $headers 2>&1 || echo "000")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" $headers 2>&1 || echo "000")
    fi

    status_code=$(echo "$response" | tail -n1)

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status_code)"
        ((FAILED++))
        return 1
    fi
}

echo -e "${YELLOW}Basic Connectivity Tests${NC}"
echo "────────────────────────────────────────"

test_endpoint "Homepage loads" "GET" "/" "200"
test_endpoint "About page loads" "GET" "/about" "200"
test_endpoint "Features page loads" "GET" "/features" "200"
test_endpoint "Pricing page loads" "GET" "/pricing" "200"
test_endpoint "API docs page loads" "GET" "/api-docs" "200"

echo ""
echo -e "${YELLOW}Health Check Tests${NC}"
echo "────────────────────────────────────────"

test_endpoint "x402 health endpoint" "GET" "/api/v1/x402/health" "200"

# Parse health check response
health_response=$(curl -s "$BASE_URL/api/v1/x402/health" 2>&1)

if echo "$health_response" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✓${NC} Health status: healthy"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Health status: not healthy"
    ((FAILED++))
fi

if echo "$health_response" | grep -q '"database"'; then
    echo -e "${GREEN}✓${NC} Database check present"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Database check missing"
    ((FAILED++))
fi

echo ""
echo -e "${YELLOW}API Endpoint Tests (Unauthenticated)${NC}"
echo "────────────────────────────────────────"

test_endpoint "Verify endpoint (no auth)" "POST" "/api/v1/x402/verify" "401"
test_endpoint "Usage endpoint (no auth)" "GET" "/api/v1/x402/usage" "401"
test_endpoint "Analytics endpoint (no auth)" "GET" "/api/v1/x402/analytics" "401"
test_endpoint "Supported chains (no auth)" "GET" "/api/v1/x402/supported-chains" "401"

echo ""
echo -e "${YELLOW}Static Assets Tests${NC}"
echo "────────────────────────────────────────"

test_endpoint "Favicon loads" "GET" "/favicon.ico" "200"
test_endpoint "Robots.txt loads" "GET" "/robots.txt" "200"
test_endpoint "Sitemap.xml loads" "GET" "/sitemap.xml" "200"

echo ""
echo -e "${YELLOW}Security Headers Tests${NC}"
echo "────────────────────────────────────────"

# Check security headers
headers=$(curl -s -I "$BASE_URL" 2>&1)

printf "%-50s " "X-Frame-Options header"
if echo "$headers" | grep -qi "X-Frame-Options"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (missing)"
fi

printf "%-50s " "X-Content-Type-Options header"
if echo "$headers" | grep -qi "X-Content-Type-Options"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (missing)"
fi

printf "%-50s " "Strict-Transport-Security header"
if echo "$headers" | grep -qi "Strict-Transport-Security"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (missing, expected for HTTPS)"
fi

echo ""
echo -e "${YELLOW}Response Time Tests${NC}"
echo "────────────────────────────────────────"

# Test response times
test_response_time() {
    local name="$1"
    local path="$2"
    local max_time="$3"

    printf "%-50s " "$name"

    time_total=$(curl -s -w "%{time_total}" -o /dev/null "$BASE_URL$path" 2>&1)

    # Convert to milliseconds
    time_ms=$(echo "$time_total * 1000" | bc)
    time_ms_int=${time_ms%.*}

    if [ "$time_ms_int" -lt "$max_time" ]; then
        echo -e "${GREEN}✓ PASS${NC} (${time_ms_int}ms < ${max_time}ms)"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ SLOW${NC} (${time_ms_int}ms >= ${max_time}ms)"
    fi
}

test_response_time "Homepage response time" "/" 1000
test_response_time "Health check response time" "/api/v1/x402/health" 500

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}           DEPLOYMENT SUMMARY${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo ""
echo "Tests Passed: $PASSED"
echo "Tests Failed: $FAILED"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    echo -e "${GREEN}✓ Deployment verification successful${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $FAILED test(s) failed${NC}"
    echo -e "${RED}✗ Deployment verification failed${NC}"
    echo ""
    echo "Please check the failed tests above and ensure all services are running correctly."
    exit 1
fi
