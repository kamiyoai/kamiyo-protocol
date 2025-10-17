#!/bin/bash
# Test Stripe Webhooks for Kamiyo
# Day 8: Webhook Handler Testing Script
#
# This script helps test Stripe webhook integration using Stripe CLI

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
WEBHOOK_ENDPOINT="${API_URL}/api/v1/webhooks/stripe"
ADMIN_API_KEY="${ADMIN_API_KEY:-your_admin_api_key_here}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Kamiyo Stripe Webhook Testing${NC}"
echo -e "${BLUE}========================================${NC}\n"

# ==========================================
# 1. Check Prerequisites
# ==========================================

echo -e "${YELLOW}1. Checking prerequisites...${NC}"

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo -e "${RED}✗ Stripe CLI not found${NC}"
    echo -e "${YELLOW}Installing Stripe CLI...${NC}"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install stripe/stripe-cli/stripe
        else
            echo -e "${RED}Homebrew not found. Please install Stripe CLI manually:${NC}"
            echo "  https://stripe.com/docs/stripe-cli"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo -e "${YELLOW}Downloading Stripe CLI...${NC}"
        curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
        echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
        sudo apt update
        sudo apt install stripe
    else
        echo -e "${RED}Unsupported OS. Please install Stripe CLI manually:${NC}"
        echo "  https://stripe.com/docs/stripe-cli"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Stripe CLI installed${NC}"

# Check if API is running
echo -e "${YELLOW}Checking if API is running at ${API_URL}...${NC}"
if curl -s "${API_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API is running${NC}"
else
    echo -e "${RED}✗ API is not running at ${API_URL}${NC}"
    echo -e "${YELLOW}Please start the API first:${NC}"
    echo "  cd /path/to/exploit-intel-platform"
    echo "  uvicorn api.main:app --reload"
    exit 1
fi

# Check webhook health
echo -e "${YELLOW}Checking webhook health...${NC}"
HEALTH_RESPONSE=$(curl -s "${API_URL}/api/v1/webhooks/health")
HEALTH_STATUS=$(echo $HEALTH_RESPONSE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$HEALTH_STATUS" = "healthy" ] || [ "$HEALTH_STATUS" = "degraded" ]; then
    echo -e "${GREEN}✓ Webhook system is operational (status: ${HEALTH_STATUS})${NC}"
else
    echo -e "${YELLOW}⚠ Webhook system status: ${HEALTH_STATUS}${NC}"
fi

echo ""

# ==========================================
# 2. Login to Stripe CLI
# ==========================================

echo -e "${YELLOW}2. Logging into Stripe CLI...${NC}"

# Check if already logged in
if stripe config --list &> /dev/null; then
    echo -e "${GREEN}✓ Already logged in to Stripe CLI${NC}"
else
    echo -e "${YELLOW}Please login to Stripe CLI...${NC}"
    stripe login
    echo -e "${GREEN}✓ Logged in to Stripe CLI${NC}"
fi

echo ""

# ==========================================
# 3. Start Webhook Forwarding
# ==========================================

echo -e "${YELLOW}3. Setting up webhook forwarding...${NC}"
echo -e "${BLUE}Forwarding webhooks to: ${WEBHOOK_ENDPOINT}${NC}"
echo -e "${YELLOW}Starting Stripe webhook listener in background...${NC}"

# Start listener in background
stripe listen --forward-to "${WEBHOOK_ENDPOINT}" > /tmp/stripe_webhook_listener.log 2>&1 &
LISTENER_PID=$!

# Wait for listener to start
sleep 3

# Check if listener started successfully
if ps -p $LISTENER_PID > /dev/null; then
    echo -e "${GREEN}✓ Webhook listener started (PID: ${LISTENER_PID})${NC}"

    # Extract webhook secret from log
    sleep 1
    if [ -f /tmp/stripe_webhook_listener.log ]; then
        WEBHOOK_SECRET=$(grep -o 'whsec_[a-zA-Z0-9]*' /tmp/stripe_webhook_listener.log | head -1)
        if [ -n "$WEBHOOK_SECRET" ]; then
            echo -e "${GREEN}✓ Webhook secret: ${WEBHOOK_SECRET}${NC}"
            echo -e "${YELLOW}Add this to your .env file:${NC}"
            echo -e "  STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}"
        fi
    fi
else
    echo -e "${RED}✗ Failed to start webhook listener${NC}"
    exit 1
fi

echo ""

# ==========================================
# 4. Test Webhook Events
# ==========================================

echo -e "${YELLOW}4. Testing webhook events...${NC}"
echo -e "${BLUE}This will trigger test events from Stripe${NC}\n"

# Function to test an event
test_event() {
    local event_type=$1
    echo -e "${YELLOW}Testing: ${event_type}...${NC}"

    if stripe trigger "${event_type}" > /dev/null 2>&1; then
        sleep 2  # Wait for processing
        echo -e "${GREEN}✓ ${event_type} triggered${NC}"
    else
        echo -e "${RED}✗ Failed to trigger ${event_type}${NC}"
    fi
}

# Test priority events first
echo -e "${BLUE}Testing priority events:${NC}"
test_event "customer.subscription.created"
test_event "customer.subscription.updated"
test_event "invoice.payment_succeeded"
test_event "invoice.payment_failed"

echo ""
echo -e "${BLUE}Testing customer events:${NC}"
test_event "customer.created"
test_event "customer.updated"

echo ""
echo -e "${BLUE}Testing payment method events:${NC}"
test_event "payment_method.attached"

echo ""

# ==========================================
# 5. Check Processing Results
# ==========================================

echo -e "${YELLOW}5. Checking webhook processing results...${NC}"
sleep 2  # Wait for async processing

# Get statistics (if admin key is set)
if [ "$ADMIN_API_KEY" != "your_admin_api_key_here" ]; then
    echo -e "${YELLOW}Fetching webhook statistics...${NC}"

    STATS_RESPONSE=$(curl -s -H "X-Admin-Key: ${ADMIN_API_KEY}" \
        "${API_URL}/api/v1/webhooks/statistics?days=1")

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Statistics retrieved${NC}"
        echo "$STATS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATS_RESPONSE"
    else
        echo -e "${YELLOW}⚠ Could not fetch statistics (check admin key)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ ADMIN_API_KEY not set - skipping statistics${NC}"
fi

echo ""

# ==========================================
# 6. View Recent Events
# ==========================================

echo -e "${YELLOW}6. Viewing recent webhook events...${NC}"

if [ "$ADMIN_API_KEY" != "your_admin_api_key_here" ]; then
    # Get list of failed events
    FAILED_RESPONSE=$(curl -s -H "X-Admin-Key: ${ADMIN_API_KEY}" \
        "${API_URL}/api/v1/webhooks/events/failed/list?limit=5")

    FAILED_COUNT=$(echo $FAILED_RESPONSE | grep -o '"count":[0-9]*' | cut -d':' -f2)

    if [ "$FAILED_COUNT" -gt 0 ]; then
        echo -e "${RED}✗ Found ${FAILED_COUNT} failed events${NC}"
        echo "$FAILED_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$FAILED_RESPONSE"
    else
        echo -e "${GREEN}✓ No failed events${NC}"
    fi
else
    echo -e "${YELLOW}⚠ ADMIN_API_KEY not set - skipping event list${NC}"
fi

echo ""

# ==========================================
# 7. Cleanup
# ==========================================

echo -e "${YELLOW}7. Cleaning up...${NC}"

# Stop webhook listener
if ps -p $LISTENER_PID > /dev/null; then
    kill $LISTENER_PID
    echo -e "${GREEN}✓ Stopped webhook listener${NC}"
fi

# Clean up log file
rm -f /tmp/stripe_webhook_listener.log
echo -e "${GREEN}✓ Cleaned up temporary files${NC}"

echo ""

# ==========================================
# Summary
# ==========================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Complete!${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}Next steps:${NC}"
echo "1. Check the webhook processing logs in your API"
echo "2. Verify database records were updated correctly"
echo "3. Check for any notification alerts sent"
echo ""
echo -e "${YELLOW}For continuous webhook listening:${NC}"
echo "  stripe listen --forward-to ${WEBHOOK_ENDPOINT}"
echo ""
echo -e "${YELLOW}For production webhook setup:${NC}"
echo "1. Configure webhook endpoint in Stripe Dashboard:"
echo "   https://dashboard.stripe.com/webhooks"
echo "2. Add production endpoint URL"
echo "3. Copy webhook signing secret to STRIPE_WEBHOOK_SECRET"
echo ""

echo -e "${GREEN}✅ Webhook testing complete!${NC}"
