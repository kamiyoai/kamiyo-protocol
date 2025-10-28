#!/bin/bash
#
# KAMIYO MCP Stripe Products Creation Script
# Creates MCP subscription products and prices in Stripe
#
# Usage:
#   ./scripts/create_mcp_stripe_products.sh [test|live]
#
# Prerequisites:
#   - Stripe CLI installed: https://stripe.com/docs/stripe-cli
#   - Stripe CLI authenticated: stripe login
#
# This script:
#   1. Creates 3 MCP subscription products (Personal, Team, Enterprise)
#   2. Creates monthly recurring prices for each product
#   3. Outputs product and price IDs to save in .env file
#   4. Checks for existing products to avoid duplicates

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${CYAN}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    print_error "Stripe CLI not found"
    echo "Install from: https://stripe.com/docs/stripe-cli"
    exit 1
fi

print_success "Stripe CLI found"

# Determine mode (test or live)
MODE="${1:-test}"
if [[ "$MODE" != "test" && "$MODE" != "live" ]]; then
    print_error "Invalid mode: $MODE"
    echo "Usage: $0 [test|live]"
    exit 1
fi

if [[ "$MODE" == "live" ]]; then
    print_warning "Creating products in LIVE mode"
    read -p "Are you sure? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        print_info "Aborted"
        exit 0
    fi
    MODE_FLAG="--live"
else
    print_info "Creating products in TEST mode"
    MODE_FLAG=""
fi

echo ""
print_info "================================================"
print_info "Creating KAMIYO MCP Subscription Products"
print_info "================================================"
echo ""

# Output file for environment variables
OUTPUT_FILE="stripe_mcp_product_ids.env"
rm -f "$OUTPUT_FILE"

# Function to create product and price
create_product_and_price() {
    local PRODUCT_NAME="$1"
    local PRODUCT_DESCRIPTION="$2"
    local PRICE_AMOUNT="$3"
    local TIER="$4"
    local MAX_AGENTS="$5"
    local RATE_LIMIT_RPM="$6"
    local ENV_VAR_NAME="$7"

    print_info "Creating product: $PRODUCT_NAME ($PRICE_AMOUNT USD/month)"

    # Check if product already exists
    EXISTING_PRODUCT=$(stripe products list $MODE_FLAG --limit 100 2>/dev/null | \
        grep -A 5 "\"name\": \"$PRODUCT_NAME\"" | \
        grep "\"id\":" | \
        head -1 | \
        sed 's/.*"id": "\([^"]*\)".*/\1/' || echo "")

    if [[ -n "$EXISTING_PRODUCT" ]]; then
        print_warning "Product already exists: $EXISTING_PRODUCT"
        PRODUCT_ID="$EXISTING_PRODUCT"
    else
        # Create product
        PRODUCT_OUTPUT=$(stripe products create $MODE_FLAG \
            --name "$PRODUCT_NAME" \
            --description "$PRODUCT_DESCRIPTION" \
            --metadata[tier]="$TIER" \
            --metadata[max_agents]="$MAX_AGENTS" \
            --metadata[rate_limit_rpm]="$RATE_LIMIT_RPM" \
            2>&1)

        if [ $? -ne 0 ]; then
            print_error "Failed to create product: $PRODUCT_NAME"
            echo "$PRODUCT_OUTPUT"
            return 1
        fi

        PRODUCT_ID=$(echo "$PRODUCT_OUTPUT" | grep "^id" | awk '{print $2}')
        print_success "Product created: $PRODUCT_ID"
    fi

    # Check if price already exists for this product
    EXISTING_PRICE=$(stripe prices list $MODE_FLAG --product "$PRODUCT_ID" --limit 100 2>/dev/null | \
        grep "\"id\":" | \
        head -1 | \
        sed 's/.*"id": "\([^"]*\)".*/\1/' || echo "")

    if [[ -n "$EXISTING_PRICE" ]]; then
        print_warning "Price already exists: $EXISTING_PRICE"
        PRICE_ID="$EXISTING_PRICE"
    else
        # Create monthly recurring price
        PRICE_OUTPUT=$(stripe prices create $MODE_FLAG \
            --product "$PRODUCT_ID" \
            --currency usd \
            --unit-amount "$((PRICE_AMOUNT * 100))" \
            --recurring[interval]=month \
            --metadata[tier]="$TIER" \
            2>&1)

        if [ $? -ne 0 ]; then
            print_error "Failed to create price for: $PRODUCT_NAME"
            echo "$PRICE_OUTPUT"
            return 1
        fi

        PRICE_ID=$(echo "$PRICE_OUTPUT" | grep "^id" | awk '{print $2}')
        print_success "Price created: $PRICE_ID"
    fi

    # Output to env file
    echo "$ENV_VAR_NAME=$PRICE_ID" >> "$OUTPUT_FILE"
    echo ""
}

# Create MCP Personal Product
create_product_and_price \
    "KAMIYO MCP Personal" \
    "Unlimited security queries for AI agents. Claude Desktop integration with 1 agent." \
    19 \
    "personal" \
    "1" \
    "30" \
    "STRIPE_PRICE_MCP_PERSONAL"

# Create MCP Team Product
create_product_and_price \
    "KAMIYO MCP Team" \
    "Team subscription with 5 AI agents, webhooks, and priority support." \
    99 \
    "team" \
    "5" \
    "100" \
    "STRIPE_PRICE_MCP_TEAM"

# Create MCP Enterprise Product
create_product_and_price \
    "KAMIYO MCP Enterprise" \
    "Unlimited AI agents, 99.9% SLA, dedicated support, and custom integrations." \
    299 \
    "enterprise" \
    "unlimited" \
    "500" \
    "STRIPE_PRICE_MCP_ENTERPRISE"

echo ""
print_info "================================================"
print_success "All products and prices created successfully!"
print_info "================================================"
echo ""

print_info "Environment variables saved to: $OUTPUT_FILE"
echo ""
cat "$OUTPUT_FILE"
echo ""

print_warning "IMPORTANT: Add these to your .env file:"
echo ""
echo "# Stripe MCP Subscription Price IDs ($MODE mode)"
cat "$OUTPUT_FILE"
echo ""

print_info "Next steps:"
echo "1. Copy the price IDs above to your .env file"
echo "2. Restart your API server to load new environment variables"
echo "3. Test checkout flow: curl http://localhost:8000/api/v1/billing/create-checkout-session"
echo "4. Configure webhook endpoint: stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe"
echo ""

if [[ "$MODE" == "test" ]]; then
    print_info "To create products in LIVE mode, run:"
    echo "./scripts/create_mcp_stripe_products.sh live"
    echo ""
fi

print_success "Done!"
