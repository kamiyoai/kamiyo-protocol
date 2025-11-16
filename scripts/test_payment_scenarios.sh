#!/bin/bash
# Payment Testing Scenarios
# Interactive script for manual payment system testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
STRIPE_CLI="${STRIPE_CLI:-stripe}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Kamiyo Payment Testing Scenarios${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check dependencies
check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}❌ psql not found${NC}"
        exit 1
    fi
    
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${RED}❌ redis-cli not found${NC}"
        exit 1
    fi
    
    if ! command -v stripe &> /dev/null; then
        echo -e "${YELLOW}⚠️  Stripe CLI not found (some tests will be skipped)${NC}"
    fi
    
    echo -e "${GREEN}✓ Dependencies OK${NC}"
    echo ""
}

# Test database connection
test_database() {
    echo -e "${YELLOW}Testing database connection...${NC}"
    
    if psql $DATABASE_URL -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Database connected${NC}"
    else
        echo -e "${RED}❌ Database connection failed${NC}"
        exit 1
    fi
}

# Test Redis connection
test_redis() {
    echo -e "${YELLOW}Testing Redis connection...${NC}"
    
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis connected${NC}"
    else
        echo -e "${RED}❌ Redis connection failed${NC}"
        exit 1
    fi
}

# Create test customer
create_test_customer() {
    echo -e "${YELLOW}Creating test customer...${NC}"
    
    CUSTOMER_EMAIL="test-$(date +%s)@kamiyo.ai"
    
    curl -X POST "$API_URL/api/v1/payments/customers" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$CUSTOMER_EMAIL\",
            \"name\": \"Test User\"
        }" | jq .
    
    echo -e "${GREEN}✓ Test customer created${NC}"
}

# Create test subscription
create_test_subscription() {
    echo -e "${YELLOW}Creating test subscription...${NC}"
    echo "Enter customer ID:"
    read CUSTOMER_ID
    echo "Enter tier (free/basic/pro/enterprise):"
    read TIER
    
    curl -X POST "$API_URL/api/v1/subscriptions" \
        -H "Content-Type: application/json" \
        -d "{
            \"customer_id\": \"$CUSTOMER_ID\",
            \"tier\": \"$TIER\"
        }" | jq .
    
    echo -e "${GREEN}✓ Test subscription created${NC}"
}

# Test webhook delivery
test_webhook() {
    echo -e "${YELLOW}Testing webhook...${NC}"
    
    if ! command -v stripe &> /dev/null; then
        echo -e "${RED}❌ Stripe CLI required for webhook testing${NC}"
        return 1
    fi
    
    echo "Select event to trigger:"
    echo "1) customer.created"
    echo "2) customer.subscription.created"
    echo "3) invoice.payment_succeeded"
    echo "4) invoice.payment_failed"
    read EVENT_CHOICE
    
    case $EVENT_CHOICE in
        1) EVENT="customer.created" ;;
        2) EVENT="customer.subscription.created" ;;
        3) EVENT="invoice.payment_succeeded" ;;
        4) EVENT="invoice.payment_failed" ;;
        *) echo "Invalid choice"; return 1 ;;
    esac
    
    stripe trigger $EVENT
    
    echo -e "${GREEN}✓ Webhook triggered${NC}"
}

# Test rate limiting
test_rate_limit() {
    echo -e "${YELLOW}Testing rate limiting...${NC}"
    echo "Enter user ID to test:"
    read USER_ID
    echo "Enter number of requests:"
    read NUM_REQUESTS
    
    for i in $(seq 1 $NUM_REQUESTS); do
        echo -n "Request $i... "
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "$API_URL/api/v1/exploits?user_id=$USER_ID")
        
        if [ "$STATUS" = "429" ]; then
            echo -e "${RED}RATE LIMITED${NC}"
            break
        else
            echo -e "${GREEN}OK${NC}"
        fi
        
        sleep 0.1
    done
}

# Test tier upgrade
test_tier_upgrade() {
    echo -e "${YELLOW}Testing tier upgrade...${NC}"
    echo "Enter user ID:"
    read USER_ID
    echo "Current tier:"
    read CURRENT_TIER
    echo "New tier:"
    read NEW_TIER
    
    curl -X POST "$API_URL/api/v1/subscriptions/upgrade" \
        -H "Content-Type: application/json" \
        -d "{
            \"user_id\": \"$USER_ID\",
            \"new_tier\": \"$NEW_TIER\"
        }" | jq .
    
    echo -e "${GREEN}✓ Tier upgrade completed${NC}"
}

# Check database state
check_db_state() {
    echo -e "${YELLOW}Checking database state...${NC}"
    
    echo "Customers:"
    psql $DATABASE_URL -c "SELECT id, email, stripe_customer_id, created_at FROM customers ORDER BY created_at DESC LIMIT 5;"
    
    echo ""
    echo "Subscriptions:"
    psql $DATABASE_URL -c "SELECT id, customer_id, tier, status, created_at FROM subscriptions ORDER BY created_at DESC LIMIT 5;"
    
    echo ""
    echo "Invoices:"
    psql $DATABASE_URL -c "SELECT id, customer_id, amount, status, created_at FROM invoices ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "No invoices table"
}

# Check Redis state
check_redis_state() {
    echo -e "${YELLOW}Checking Redis state...${NC}"
    echo "Enter user ID:"
    read USER_ID
    
    echo ""
    echo "Tier cache:"
    redis-cli GET "tier:$USER_ID"
    
    echo ""
    echo "Usage stats:"
    redis-cli --scan --pattern "usage:$USER_ID:*"
}

# Cleanup test data
cleanup_test_data() {
    echo -e "${RED}WARNING: This will delete test data${NC}"
    echo "Continue? (yes/no)"
    read CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        echo "Cancelled"
        return
    fi
    
    echo -e "${YELLOW}Cleaning up test data...${NC}"
    
    # Clean database
    psql $DATABASE_URL -c "DELETE FROM customers WHERE email LIKE 'test-%@kamiyo.ai';"
    
    # Clean Redis
    redis-cli FLUSHDB
    
    echo -e "${GREEN}✓ Cleanup completed${NC}"
}

# Main menu
show_menu() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo "Select a test scenario:"
    echo "1)  Check dependencies"
    echo "2)  Test database connection"
    echo "3)  Test Redis connection"
    echo "4)  Create test customer"
    echo "5)  Create test subscription"
    echo "6)  Test webhook"
    echo "7)  Test rate limiting"
    echo "8)  Test tier upgrade"
    echo "9)  Check database state"
    echo "10) Check Redis state"
    echo "11) Cleanup test data"
    echo "12) Run all unit tests"
    echo "0)  Exit"
    echo -e "${BLUE}========================================${NC}"
    echo -n "Choice: "
}

# Run all unit tests
run_unit_tests() {
    echo -e "${YELLOW}Running all unit tests...${NC}"
    pytest tests/payments/ -v --cov=api/payments --cov=api/subscriptions --cov=api/webhooks --cov=api/billing
}

# Main loop
main() {
    check_dependencies
    
    while true; do
        show_menu
        read CHOICE
        
        case $CHOICE in
            1) check_dependencies ;;
            2) test_database ;;
            3) test_redis ;;
            4) create_test_customer ;;
            5) create_test_subscription ;;
            6) test_webhook ;;
            7) test_rate_limit ;;
            8) test_tier_upgrade ;;
            9) check_db_state ;;
            10) check_redis_state ;;
            11) cleanup_test_data ;;
            12) run_unit_tests ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) echo -e "${RED}Invalid choice${NC}" ;;
        esac
    done
}

# Run main
main
