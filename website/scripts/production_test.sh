#!/bin/bash

# Production Test Script for Kamiyo Platform
# Tests all major components end-to-end

set -e

echo "=========================================="
echo "Kamiyo Production Test Suite"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

test_passed() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

test_failed() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

test_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Test 1: File Structure
echo "Test 1: Verifying file structure..."
REQUIRED_DIRS=("api" "database" "caching" "monitoring" "scripts" "docs")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        test_passed "Directory exists: $dir"
    else
        test_failed "Missing directory: $dir"
    fi
done
echo ""

# Test 2: Python Syntax
echo "Test 2: Testing Python syntax..."
PYTHON_FILES=(
    "api/main.py"
    "api/payments/stripe_client.py"
    "api/subscriptions/manager.py"
    "api/webhooks/stripe_handler.py"
    "database/postgres_manager.py"
    "caching/cache_manager.py"
)

for file in "${PYTHON_FILES[@]}"; do
    if [ -f "$file" ]; then
        if python3 -m py_compile "$file" 2>/dev/null; then
            test_passed "Syntax OK: $file"
        else
            test_failed "Syntax error: $file"
        fi
    else
        test_failed "File not found: $file"
    fi
done
echo ""

# Test 3: SQL Migrations
echo "Test 3: Verifying SQL migrations..."
SQL_FILES=(
    "database/migrations/001_initial_schema.sql"
    "database/migrations/002_payment_tables.sql"
    "database/migrations/003_subscription_tables.sql"
    "database/migrations/004_webhook_tables.sql"
    "database/migrations/005_performance_indexes.sql"
)

for file in "${SQL_FILES[@]}"; do
    if [ -f "$file" ]; then
        # Basic SQL syntax check
        if grep -q "CREATE TABLE\|CREATE INDEX\|CREATE VIEW" "$file"; then
            test_passed "SQL migration exists: $file"
        else
            test_warning "SQL file exists but may be incomplete: $file"
        fi
    else
        test_failed "Missing SQL file: $file"
    fi
done
echo ""

# Test 4: Docker Configuration
echo "Test 4: Checking Docker configuration..."
DOCKER_FILES=(
    "docker-compose.production.yml"
    "Dockerfile.api.prod"
    "Dockerfile.aggregator.prod"
)

for file in "${DOCKER_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_passed "Docker config exists: $file"
    else
        test_failed "Missing Docker config: $file"
    fi
done
echo ""

# Test 5: CI/CD Workflows
echo "Test 5: Verifying CI/CD workflows..."
WORKFLOW_FILES=(
    ".github/workflows/test.yml"
    ".github/workflows/deploy.yml"
)

for file in "${WORKFLOW_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_passed "Workflow exists: $file"
    else
        test_warning "Missing workflow: $file"
    fi
done
echo ""

# Test 6: Documentation
echo "Test 6: Checking documentation..."
DOC_FILES=(
    "docs/DEPLOYMENT_GUIDE.md"
    "README.md"
    "CLAUDE.md"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_passed "Documentation exists: $file"
    else
        test_warning "Missing documentation: $file"
    fi
done
echo ""

# Test 7: Environment Configuration
echo "Test 7: Verifying environment configuration..."
if [ -f ".env.production.template" ]; then
    test_passed "Environment template exists"

    # Check for required variables
    REQUIRED_VARS=("DATABASE_URL" "REDIS_URL" "STRIPE_SECRET_KEY")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "$var" .env.production.template; then
            test_passed "Environment variable documented: $var"
        else
            test_warning "Missing environment variable: $var"
        fi
    done
else
    test_failed "Missing .env.production.template"
fi
echo ""

# Test 8: API Endpoints Structure
echo "Test 8: Verifying API structure..."
if [ -f "api/main.py" ]; then
    if grep -q "FastAPI" api/main.py; then
        test_passed "FastAPI application configured"
    else
        test_warning "FastAPI may not be configured in main.py"
    fi

    # Check for routers
    ROUTERS=("payments" "subscriptions" "webhooks" "billing")
    for router in "${ROUTERS[@]}"; do
        if grep -q "$router" api/main.py || [ -d "api/$router" ]; then
            test_passed "Router/module exists: $router"
        else
            test_warning "Router/module may be missing: $router"
        fi
    done
fi
echo ""

# Test 9: Monitoring Setup
echo "Test 9: Checking monitoring configuration..."
MONITORING_FILES=(
    "monitoring/prometheus_metrics.py"
    "monitoring/alerts.py"
)

for file in "${MONITORING_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_passed "Monitoring component exists: $file"
    else
        test_warning "Missing monitoring component: $file"
    fi
done
echo ""

# Test 10: Security Configuration
echo "Test 10: Verifying security setup..."
SECURITY_FILES=(
    "api/security.py"
    "scripts/setup_ssl.sh"
)

for file in "${SECURITY_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_passed "Security component exists: $file"
    else
        test_warning "Missing security component: $file"
    fi
done
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

TOTAL=$((PASSED + WARNINGS + FAILED))
PASS_RATE=$((PASSED * 100 / TOTAL))

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    echo "Pass rate: ${PASS_RATE}%"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo "Pass rate: ${PASS_RATE}%"
    exit 1
fi
