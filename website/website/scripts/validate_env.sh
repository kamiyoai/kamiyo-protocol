#!/bin/bash

# Kamiyo Environment Validation Script
# Validates all required environment variables for deployment
# Usage: ./scripts/validate_env.sh [environment]
#   environment: development|staging|production (default: development)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment (default: development)
ENV=${1:-development}

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Kamiyo Environment Validation Script            ║${NC}"
echo -e "${BLUE}║   Environment: ${ENV}                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Validation functions
check_required() {
    local var_name=$1
    local var_value=$2
    local description=$3

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$var_value" ]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name is not set"
        echo -e "   ${description}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    else
        echo -e "${GREEN}✓ PASS${NC} - $var_name is set"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    fi
}

check_optional() {
    local var_name=$1
    local var_value=$2
    local description=$3

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$var_value" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - $var_name is not set (optional)"
        echo -e "   ${description}"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
        return 1
    else
        echo -e "${GREEN}✓ PASS${NC} - $var_name is set"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    fi
}

check_url_format() {
    local var_name=$1
    local url=$2
    local require_https=$3

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$url" ]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name is not set"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    # Check URL format
    if [[ ! "$url" =~ ^https?:// ]]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name is not a valid URL: $url"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    # Check HTTPS requirement for production
    if [ "$require_https" = "true" ] && [[ ! "$url" =~ ^https:// ]]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name must use HTTPS in production: $url"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    echo -e "${GREEN}✓ PASS${NC} - $var_name is valid: $url"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
}

check_min_length() {
    local var_name=$1
    local var_value=$2
    local min_length=$3
    local description=$4

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$var_value" ]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name is not set"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    local length=${#var_value}
    if [ $length -lt $min_length ]; then
        echo -e "${RED}✗ FAIL${NC} - $var_name is too short (${length} chars, min ${min_length})"
        echo -e "   ${description}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    echo -e "${GREEN}✓ PASS${NC} - $var_name length is sufficient (${length} chars)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
}

check_database_url() {
    local url=$1

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$url" ]; then
        echo -e "${RED}✗ FAIL${NC} - DATABASE_URL is not set"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    # Check PostgreSQL URL format
    if [[ ! "$url" =~ ^postgresql:// ]]; then
        echo -e "${RED}✗ FAIL${NC} - DATABASE_URL must be PostgreSQL URL (postgresql://...)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    # Try to extract connection details (without exposing password)
    if [[ "$url" =~ postgresql://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+) ]]; then
        local user="${BASH_REMATCH[1]}"
        local host="${BASH_REMATCH[3]}"
        local port="${BASH_REMATCH[4]}"
        local db="${BASH_REMATCH[5]}"

        echo -e "${GREEN}✓ PASS${NC} - DATABASE_URL format valid"
        echo -e "   User: ${user}"
        echo -e "   Host: ${host}"
        echo -e "   Port: ${port}"
        echo -e "   Database: ${db}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} - DATABASE_URL format is invalid"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

test_database_connection() {
    local url=$1

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$url" ]; then
        echo -e "${YELLOW}⚠ SKIP${NC} - Cannot test database connection (URL not set)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
        return 1
    fi

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        echo -e "${YELLOW}⚠ SKIP${NC} - psql not installed, cannot test database connection"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
        return 1
    fi

    # Try to connect (with 5 second timeout)
    if psql "$url" -c "SELECT 1;" &> /dev/null; then
        echo -e "${GREEN}✓ PASS${NC} - Database connection successful"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} - Cannot connect to database"
        echo -e "   Check DATABASE_URL, network access, and database server"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

check_redis_url() {
    local url=$1

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ -z "$url" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - REDIS_URL is not set (optional but recommended)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
        return 1
    fi

    # Check Redis URL format
    if [[ ! "$url" =~ ^redis:// ]]; then
        echo -e "${RED}✗ FAIL${NC} - REDIS_URL must start with redis://"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    echo -e "${GREEN}✓ PASS${NC} - REDIS_URL format valid"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
}

# Determine if HTTPS is required
REQUIRE_HTTPS="false"
if [ "$ENV" = "production" ]; then
    REQUIRE_HTTPS="true"
fi

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Database Configuration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_database_url "$DATABASE_URL"
test_database_connection "$DATABASE_URL"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Cache Configuration (Optional)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_redis_url "$REDIS_URL"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  API Configuration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_required "ENVIRONMENT" "$ENVIRONMENT" "Must be: development, staging, or production"
check_url_format "ALLOWED_ORIGINS" "$ALLOWED_ORIGINS" "$REQUIRE_HTTPS"

if [ "$ENV" = "production" ]; then
    # In production, check that ALLOWED_ORIGINS uses HTTPS
    if [[ "$ALLOWED_ORIGINS" =~ http:// ]]; then
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -e "${RED}✗ FAIL${NC} - ALLOWED_ORIGINS contains HTTP URLs in production"
        echo -e "   All origins must use HTTPS in production"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
fi
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Authentication & Security${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_min_length "JWT_SECRET" "$JWT_SECRET" 32 "JWT secret must be at least 32 characters for security"
check_min_length "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET" 32 "NextAuth secret must be at least 32 characters"
check_url_format "NEXTAUTH_URL" "$NEXTAUTH_URL" "$REQUIRE_HTTPS"
check_required "ADMIN_API_KEY" "$ADMIN_API_KEY" "Required for admin endpoints"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Payment Processing (Stripe)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_required "STRIPE_SECRET_KEY" "$STRIPE_SECRET_KEY" "Required for payment processing"
check_required "STRIPE_PUBLISHABLE_KEY" "$STRIPE_PUBLISHABLE_KEY" "Required for frontend Stripe integration"
check_required "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET" "Required for webhook signature verification"
check_required "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "Required for frontend"

# Validate Stripe key formats
if [ -n "$STRIPE_SECRET_KEY" ]; then
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ "$ENV" = "production" ]; then
        if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_live_ ]]; then
            echo -e "${RED}✗ FAIL${NC} - STRIPE_SECRET_KEY must be live key (sk_live_...) in production"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        else
            echo -e "${GREEN}✓ PASS${NC} - Using Stripe live key"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        fi
    else
        if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_test_ ]]; then
            echo -e "${YELLOW}⚠ WARN${NC} - STRIPE_SECRET_KEY should be test key (sk_test_...) in ${ENV}"
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
        else
            echo -e "${GREEN}✓ PASS${NC} - Using Stripe test key"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        fi
    fi
fi

if [ -n "$STRIPE_PUBLISHABLE_KEY" ]; then
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ "$ENV" = "production" ]; then
        if [[ ! "$STRIPE_PUBLISHABLE_KEY" =~ ^pk_live_ ]]; then
            echo -e "${RED}✗ FAIL${NC} - STRIPE_PUBLISHABLE_KEY must be live key (pk_live_...) in production"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        else
            echo -e "${GREEN}✓ PASS${NC} - Using Stripe live publishable key"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        fi
    else
        if [[ ! "$STRIPE_PUBLISHABLE_KEY" =~ ^pk_test_ ]]; then
            echo -e "${YELLOW}⚠ WARN${NC} - STRIPE_PUBLISHABLE_KEY should be test key (pk_test_...) in ${ENV}"
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
        else
            echo -e "${GREEN}✓ PASS${NC} - Using Stripe test publishable key"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        fi
    fi
fi
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  External API Keys (Optional)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_optional "ETHERSCAN_API_KEY" "$ETHERSCAN_API_KEY" "Recommended for on-chain verification"
check_optional "GITHUB_TOKEN" "$GITHUB_TOKEN" "Recommended for security advisory aggregation"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Monitoring & Error Tracking${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_optional "SENTRY_DSN" "$SENTRY_DSN" "Strongly recommended for error tracking"
check_optional "NEXT_PUBLIC_SENTRY_DSN" "$NEXT_PUBLIC_SENTRY_DSN" "Strongly recommended for frontend error tracking"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Alert Channels (Optional)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_optional "DISCORD_WEBHOOK" "$DISCORD_WEBHOOK" "For Discord alert notifications"
check_optional "TELEGRAM_BOT_TOKEN" "$TELEGRAM_BOT_TOKEN" "For Telegram alert notifications"
check_optional "SLACK_WEBHOOK" "$SLACK_WEBHOOK" "For Slack alert notifications"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Frontend Environment Variables${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
check_url_format "NEXT_PUBLIC_API_URL" "$NEXT_PUBLIC_API_URL" "$REQUIRE_HTTPS"
check_url_format "NEXT_PUBLIC_API_ENDPOINT" "$NEXT_PUBLIC_API_ENDPOINT" "$REQUIRE_HTTPS"
echo ""

# Additional production-specific checks
if [ "$ENV" = "production" ]; then
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Production-Specific Checks${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"

    # Check NODE_ENV
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ "$NODE_ENV" != "production" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - NODE_ENV should be 'production' in production environment"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - NODE_ENV is set to production"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    fi

    # Check LOG_LEVEL
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ "$LOG_LEVEL" = "DEBUG" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - LOG_LEVEL=DEBUG is verbose for production (consider INFO or WARNING)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - LOG_LEVEL is appropriate for production"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    fi

    # Check Redis is configured (strongly recommended for production)
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ -z "$REDIS_URL" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - REDIS_URL not set - caching and rate limiting will use memory"
        echo -e "   This is not recommended for production (single instance limitation)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - Redis is configured for production"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    fi

    echo ""
fi

# Summary
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Validation Summary${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "Total Checks:    ${TOTAL_CHECKS}"
echo -e "${GREEN}Passed:          ${PASSED_CHECKS}${NC}"
echo -e "${RED}Failed:          ${FAILED_CHECKS}${NC}"
echo -e "${YELLOW}Warnings:        ${WARNING_CHECKS}${NC}"
echo ""

# Exit code based on failures
if [ $FAILED_CHECKS -gt 0 ]; then
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo -e "${RED}Fix the failed checks before deploying to ${ENV}${NC}"
    exit 1
elif [ $WARNING_CHECKS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS${NC}"
    echo -e "${YELLOW}Review warnings before deploying to ${ENV}${NC}"
    if [ "$ENV" = "production" ]; then
        echo -e "${YELLOW}Production deployment not recommended with warnings${NC}"
        exit 2
    fi
    exit 0
else
    echo -e "${GREEN}✅ VALIDATION PASSED${NC}"
    echo -e "${GREEN}Environment is ready for ${ENV} deployment${NC}"
    exit 0
fi
