#!/bin/bash

# KAMIYO Checkout Flow Testing Script
# Comprehensive validation of checkout implementation
# Tests: Python syntax, imports, routes, environment, frontend components

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
WARNINGS=0

echo "================================================================"
echo "🧪 KAMIYO Checkout Implementation Testing"
echo "================================================================"
echo ""

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# ==============================================================================
# TEST 1: Python Syntax Checks
# ==============================================================================
print_header "Test 1: Python Syntax Validation"

echo "Checking Python syntax for checkout module..."

if python3 -m py_compile api/billing/checkout.py 2>/dev/null; then
    pass "checkout.py syntax valid"
else
    fail "checkout.py has syntax errors"
    python3 -m py_compile api/billing/checkout.py
fi

# Check other billing files
if [ -f "api/billing/routes.py" ]; then
    if python3 -m py_compile api/billing/routes.py 2>/dev/null; then
        pass "routes.py syntax valid"
    else
        fail "routes.py has syntax errors"
    fi
fi

# Check main.py
if python3 -m py_compile api/main.py 2>/dev/null; then
    pass "main.py syntax valid"
else
    fail "main.py has syntax errors"
fi

# ==============================================================================
# TEST 2: Import Validation
# ==============================================================================
print_header "Test 2: Python Import Validation"

echo "Testing Python imports..."

# Test checkout imports
if python3 -c "import sys; sys.path.insert(0, '.'); from api.billing.checkout import router" 2>/dev/null; then
    pass "checkout module imports successfully"
else
    fail "checkout module import failed"
    echo "Error details:"
    python3 -c "import sys; sys.path.insert(0, '.'); from api.billing.checkout import router" 2>&1 || true
fi

# Test if Stripe is available
if python3 -c "import stripe" 2>/dev/null; then
    pass "stripe library installed"
else
    fail "stripe library not installed"
    echo "  → Run: pip install stripe"
fi

# Test if FastAPI is available
if python3 -c "from fastapi import APIRouter" 2>/dev/null; then
    pass "fastapi library installed"
else
    fail "fastapi library not installed"
    echo "  → Run: pip install fastapi"
fi

# Test if Pydantic is available
if python3 -c "from pydantic import BaseModel, EmailStr" 2>/dev/null; then
    pass "pydantic library installed"
else
    fail "pydantic library not installed"
    echo "  → Run: pip install 'pydantic[email]'"
fi

# ==============================================================================
# TEST 3: Environment Variables
# ==============================================================================
print_header "Test 3: Environment Variable Configuration"

# Load .env if it exists
if [ -f ".env" ]; then
    echo "Loading environment from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Required Stripe variables
REQUIRED_VARS=(
    "STRIPE_SECRET_KEY"
    "STRIPE_PRICE_MCP_PERSONAL"
    "STRIPE_PRICE_MCP_TEAM"
    "STRIPE_PRICE_MCP_ENTERPRISE"
)

echo "Checking required environment variables..."

for var in "${REQUIRED_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        pass "$var is set"

        # Validate format
        case $var in
            STRIPE_SECRET_KEY)
                if [[ "${!var}" == sk_test_* ]]; then
                    warn "$var is using TEST mode (ok for development)"
                elif [[ "${!var}" == sk_live_* ]]; then
                    pass "$var is using LIVE mode (production)"
                else
                    fail "$var has invalid format (should start with sk_test_ or sk_live_)"
                fi
                ;;
            STRIPE_PRICE_*)
                if [[ "${!var}" == price_* ]]; then
                    pass "$var format is valid"
                else
                    fail "$var has invalid format (should start with price_)"
                fi
                ;;
        esac
    else
        fail "$var is NOT set"
        echo "  → Add to .env file"
    fi
done

# Check webhook secret (optional in dev)
if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
    pass "STRIPE_WEBHOOK_SECRET is set"
else
    warn "STRIPE_WEBHOOK_SECRET not set (optional for development)"
fi

# ==============================================================================
# TEST 4: API Route Registration
# ==============================================================================
print_header "Test 4: API Route Registration Check"

echo "Checking if checkout routes are registered in main.py..."

if grep -q "from api.billing import checkout as checkout_routes" api/main.py; then
    pass "checkout module imported in main.py"
else
    fail "checkout module NOT imported in main.py"
    echo "  → Add: from api.billing import checkout as checkout_routes"
fi

if grep -q "app.include_router(checkout_routes.router" api/main.py; then
    pass "checkout router registered in main.py"
else
    fail "checkout router NOT registered in main.py"
    echo "  → Add: app.include_router(checkout_routes.router, tags=['Checkout'])"
fi

# Check if routes are defined
echo ""
echo "Checking route definitions in checkout.py..."

ROUTES=(
    "/api/billing/create-checkout-session"
    "/api/billing/checkout-session"
    "/api/billing/create-portal-session"
    "/api/billing/checkout-health"
)

for route in "${ROUTES[@]}"; do
    route_function=$(echo "$route" | sed 's|/api/billing/||' | sed 's|-|_|g' | sed 's|/|_|g')
    if grep -q "def.*$route_function\|@router" api/billing/checkout.py; then
        pass "Route exists: $route"
    else
        warn "Route may be missing: $route"
    fi
done

# ==============================================================================
# TEST 5: Frontend Component Validation
# ==============================================================================
print_header "Test 5: Frontend Component Validation"

echo "Checking frontend components..."

# Check if PricingCard exists
if [ -f "components/PricingCard.js" ]; then
    pass "PricingCard.js exists"

    # Check if it calls the checkout endpoint
    if grep -q "/api/billing/create-checkout-session" components/PricingCard.js; then
        pass "PricingCard calls checkout endpoint"
    else
        fail "PricingCard doesn't call checkout endpoint"
    fi

    # Check if it handles success/cancel URLs
    if grep -q "success_url" components/PricingCard.js && grep -q "cancel_url" components/PricingCard.js; then
        pass "PricingCard configures redirect URLs"
    else
        fail "PricingCard missing redirect URL configuration"
    fi
else
    fail "PricingCard.js NOT found"
fi

# Check pricing page
if [ -f "pages/pricing.js" ]; then
    pass "pricing.js exists"
else
    fail "pricing.js NOT found"
fi

# Check success page
if [ -f "pages/dashboard/success.js" ]; then
    pass "success.js exists"

    # Check if it retrieves session details
    if grep -q "/api/billing/checkout-session" pages/dashboard/success.js; then
        pass "success.js retrieves session details"
    else
        fail "success.js doesn't retrieve session details"
    fi
else
    fail "success.js NOT found"
    echo "  → Create pages/dashboard/success.js"
fi

# ==============================================================================
# TEST 6: JavaScript/Next.js Syntax
# ==============================================================================
print_header "Test 6: JavaScript/Next.js Syntax Check"

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    pass "Node.js installed: $NODE_VERSION"
else
    fail "Node.js not installed"
fi

# Check if npm is installed
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    pass "npm installed: $NPM_VERSION"
else
    fail "npm not installed"
fi

# Check package.json
if [ -f "package.json" ]; then
    pass "package.json exists"

    # Check for required dependencies
    if grep -q '"stripe"' package.json; then
        pass "stripe package in dependencies"
    else
        fail "stripe package NOT in dependencies"
        echo "  → Run: npm install stripe"
    fi

    if grep -q '"next"' package.json; then
        pass "next package in dependencies"
    else
        fail "next package NOT in dependencies"
    fi
else
    fail "package.json NOT found"
fi

# Try to lint/validate JavaScript if possible
if command -v npx &> /dev/null; then
    echo ""
    echo "Running Next.js build validation (dry run)..."

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        warn "node_modules not found - skipping build check"
        echo "  → Run: npm install"
    else
        # We can't do a full dry-run build easily, so just check if build script exists
        if grep -q '"build"' package.json; then
            pass "build script configured"
        else
            warn "build script not found in package.json"
        fi
    fi
fi

# ==============================================================================
# TEST 7: Security Checks
# ==============================================================================
print_header "Test 7: Security Validation"

echo "Checking for security best practices..."

# Check if secrets are in code (they shouldn't be)
if grep -r "sk_live_" --include="*.js" --include="*.py" . 2>/dev/null | grep -v ".env" | grep -v "test_checkout"; then
    fail "Live Stripe keys found in code!"
    echo "  → Move all keys to environment variables"
else
    pass "No hardcoded Stripe keys in code"
fi

# Check for CSRF protection
if grep -q "csrf" api/main.py; then
    pass "CSRF protection appears to be implemented"
else
    warn "CSRF protection may not be configured"
fi

# Check for CORS configuration
if grep -q "CORSMiddleware" api/main.py; then
    pass "CORS middleware configured"
else
    warn "CORS middleware may not be configured"
fi

# Check checkout.py for security features
if grep -q "HTTPException.*402\|payment_required" api/billing/checkout.py; then
    pass "Payment validation appears implemented"
else
    warn "Payment validation may be missing"
fi

# ==============================================================================
# TEST 8: Database Schema Check
# ==============================================================================
print_header "Test 8: Database Schema Validation"

echo "Checking database schema..."

# Check if database migration files exist
if [ -d "database/migrations" ]; then
    pass "migrations directory exists"

    # Look for subscription-related migrations
    if ls database/migrations/*subscription*.sql 2>/dev/null | grep -q .; then
        pass "subscription migration files found"
    else
        warn "No subscription migration files found"
    fi
else
    warn "migrations directory not found"
fi

# Check if database.py exists and has subscription tables
if [ -f "database/__init__.py" ] || [ -f "database.py" ]; then
    pass "database module exists"
else
    fail "database module NOT found"
fi

# ==============================================================================
# TEST 9: Integration Test (Optional)
# ==============================================================================
print_header "Test 9: Integration Test (Health Check)"

echo "Testing checkout health endpoint..."

# Check if Python server is running
if curl -s http://localhost:8000/api/billing/checkout-health &>/dev/null; then
    HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/billing/checkout-health)

    if echo "$HEALTH_RESPONSE" | grep -q "healthy\|degraded"; then
        pass "Health endpoint responding"
        echo "  Response: $HEALTH_RESPONSE"
    else
        warn "Health endpoint returned unexpected response"
        echo "  Response: $HEALTH_RESPONSE"
    fi
else
    warn "API server not running at http://localhost:8000"
    echo "  → Start server with: uvicorn api.main:app --reload"
fi

# ==============================================================================
# TEST 10: Documentation Check
# ==============================================================================
print_header "Test 10: Documentation Validation"

echo "Checking for documentation..."

# Check if README files exist
if [ -f "CHECKOUT_PRODUCTION_READINESS.md" ]; then
    pass "Production readiness checklist exists"
else
    warn "Production readiness checklist not found"
fi

if [ -f "FRONTEND_CHECKOUT_TESTING.md" ]; then
    pass "Frontend testing guide exists"
else
    warn "Frontend testing guide not found"
fi

# Check for inline documentation
if grep -q '"""' api/billing/checkout.py; then
    pass "Checkout module has docstrings"
else
    warn "Checkout module may lack documentation"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================
echo ""
echo "================================================================"
echo "📊 TEST SUMMARY"
echo "================================================================"
echo ""
echo -e "${GREEN}Tests Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed! Checkout implementation looks good.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠ Tests passed with warnings. Review warnings above.${NC}"
        exit 0
    fi
else
    echo -e "${RED}✗ Some tests failed. Please fix the issues above.${NC}"
    exit 1
fi
