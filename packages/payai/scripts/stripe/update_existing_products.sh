#!/bin/bash
# KAMIYO Stripe Product Update Script
# Updates existing Stripe products with MCP tier metadata
# Author: KAMIYO Team
# Version: 1.0.0

set -e  # Exit on error

# ============================================================================
# CONFIGURATION
# ============================================================================

MODE="test"
OUTPUT_FILE="stripe_mcp_product_ids.txt"

# Existing Product IDs (from stripe_product_ids.txt)
PRODUCT_PRO_ID="prod_TJZSPysECoqzkS"
PRODUCT_TEAM_ID="prod_TJZSlMRpzjXEav"
PRODUCT_ENTERPRISE_ID="prod_TJZS1uopwU6Lkp"

# Existing Price IDs
PRICE_PRO_ID="price_1SMwJfCvpzIkQ1SiSh54y4Qk"
PRICE_TEAM_ID="price_1SMwJuCvpzIkQ1SiwrcpkbVG"
PRICE_ENTERPRISE_ID="price_1SMwJvCvpzIkQ1SiEoXhP1Ao"

# MCP Tier Specifications
# Personal: $19/month, 1 agent, 30 req/min, 1000 req/day
# Team: $99/month, 5 agents, 100 req/min, 10000 req/day
# Enterprise: $299/month, unlimited agents, 500 req/min, 100000 req/day

# ============================================================================
# COLOR CODES FOR OUTPUT
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_header() {
    echo ""
    echo "================================================================================"
    echo -e "${CYAN}$1${NC}"
    echo "================================================================================"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# PARSE COMMAND LINE ARGUMENTS
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --live)
            MODE="live"
            shift
            ;;
        --test)
            MODE="test"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Update existing Stripe products with MCP tier metadata"
            echo ""
            echo "OPTIONS:"
            echo "  --test          Update products in test mode (default)"
            echo "  --live          Update products in live mode"
            echo "  -h, --help      Show this help message"
            echo ""
            echo "EXAMPLES:"
            echo "  $0                    # Update in test mode"
            echo "  $0 --test             # Update in test mode (explicit)"
            echo "  $0 --live             # Update in live mode"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================================================
# BANNER
# ============================================================================

print_header "KAMIYO Stripe Product Update for MCP"

echo "This script will:"
echo "  • Check existing products and prices"
echo "  • Update product metadata for MCP tiers"
echo "  • Create new prices if needed for MCP pricing ($19, $99, $299)"
echo "  • Map existing products to MCP tiers"
echo ""
echo "Mode: ${CYAN}${MODE}${NC}"
echo ""

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

print_info "Checking prerequisites..."
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    print_error "Stripe CLI not found!"
    echo ""
    echo "Installation instructions:"
    echo "  macOS:   brew install stripe/stripe-cli/stripe"
    echo "  Linux:   See https://stripe.com/docs/stripe-cli#install"
    echo "  Windows: See https://stripe.com/docs/stripe-cli#install"
    echo ""
    echo "After installation, run: stripe login"
    exit 1
fi
print_success "Stripe CLI installed"

# Check if authenticated
if ! stripe config --list &> /dev/null; then
    print_error "Not authenticated to Stripe!"
    echo ""
    echo "Run: stripe login"
    exit 1
fi
print_success "Stripe CLI authenticated"

echo ""

# ============================================================================
# CONFIRMATION
# ============================================================================

if [ "$MODE" = "live" ]; then
    print_warning "You are about to update products in LIVE mode!"
    print_warning "This will affect your production Stripe account."
    echo ""
    read -p "Type 'yes' to continue with LIVE mode: " confirm
    if [ "$confirm" != "yes" ]; then
        print_error "Operation cancelled"
        exit 0
    fi
else
    print_info "Updating products in TEST mode"
    read -p "Press Enter to continue (or Ctrl+C to cancel)..."
fi

echo ""

# ============================================================================
# CHECK EXISTING PRODUCTS
# ============================================================================

print_header "Checking Existing Products"

# Verify products exist
print_info "Verifying product: KAMIYO Pro ($PRODUCT_PRO_ID)..."
PRO_EXISTS=$(stripe products retrieve "$PRODUCT_PRO_ID" 2>&1)
if [ $? -eq 0 ]; then
    print_success "Found: KAMIYO Pro"
else
    print_error "Product not found: $PRODUCT_PRO_ID"
    exit 1
fi

print_info "Verifying product: KAMIYO Team ($PRODUCT_TEAM_ID)..."
TEAM_EXISTS=$(stripe products retrieve "$PRODUCT_TEAM_ID" 2>&1)
if [ $? -eq 0 ]; then
    print_success "Found: KAMIYO Team"
else
    print_error "Product not found: $PRODUCT_TEAM_ID"
    exit 1
fi

print_info "Verifying product: KAMIYO Enterprise ($PRODUCT_ENTERPRISE_ID)..."
ENTERPRISE_EXISTS=$(stripe products retrieve "$PRODUCT_ENTERPRISE_ID" 2>&1)
if [ $? -eq 0 ]; then
    print_success "Found: KAMIYO Enterprise"
else
    print_error "Product not found: $PRODUCT_ENTERPRISE_ID"
    exit 1
fi

echo ""

# ============================================================================
# UPDATE PRODUCTS WITH MCP METADATA
# ============================================================================

print_header "Updating Products with MCP Metadata"

# ============================================================================
# UPDATE PRO → PERSONAL TIER
# ============================================================================

print_info "Updating KAMIYO Pro → MCP Personal tier..."

stripe products update "$PRODUCT_PRO_ID" \
  --name="KAMIYO MCP Personal" \
  --description="Unlimited security queries for AI agents via Claude Desktop. 1 AI agent, 30 requests/min, 1,000 requests/day." \
  --metadata[tier]="personal" \
  --metadata[mcp_enabled]="true" \
  --metadata[max_agents]="1" \
  --metadata[rate_limit_rpm]="30" \
  --metadata[rate_limit_daily]="1000" \
  --metadata[legacy_tier]="pro" \
  > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Updated KAMIYO Pro → MCP Personal"
else
    print_error "Failed to update Pro product"
fi

# ============================================================================
# UPDATE TEAM → TEAM TIER (same name, update metadata)
# ============================================================================

print_info "Updating KAMIYO Team → MCP Team tier..."

stripe products update "$PRODUCT_TEAM_ID" \
  --name="KAMIYO MCP Team" \
  --description="Team subscription with 5 AI agents, webhooks, team workspace, and priority support." \
  --metadata[tier]="team" \
  --metadata[mcp_enabled]="true" \
  --metadata[max_agents]="5" \
  --metadata[rate_limit_rpm]="100" \
  --metadata[rate_limit_daily]="10000" \
  --metadata[legacy_tier]="team" \
  > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Updated KAMIYO Team → MCP Team"
else
    print_error "Failed to update Team product"
fi

# ============================================================================
# UPDATE ENTERPRISE → ENTERPRISE TIER (same name, update metadata)
# ============================================================================

print_info "Updating KAMIYO Enterprise → MCP Enterprise tier..."

stripe products update "$PRODUCT_ENTERPRISE_ID" \
  --name="KAMIYO MCP Enterprise" \
  --description="Unlimited AI agents, 99.9% SLA, dedicated support, custom integrations." \
  --metadata[tier]="enterprise" \
  --metadata[mcp_enabled]="true" \
  --metadata[max_agents]="unlimited" \
  --metadata[rate_limit_rpm]="500" \
  --metadata[rate_limit_daily]="100000" \
  --metadata[legacy_tier]="enterprise" \
  > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Updated KAMIYO Enterprise → MCP Enterprise"
else
    print_error "Failed to update Enterprise product"
fi

echo ""

# ============================================================================
# CHECK EXISTING PRICES
# ============================================================================

print_header "Checking Existing Prices"

print_info "Current pricing:"
echo "  • KAMIYO Pro: $89/month (price_1SMwJfCvpzIkQ1SiSh54y4Qk)"
echo "  • KAMIYO Team: $199/month (price_1SMwJuCvpzIkQ1SiwrcpkbVG)"
echo "  • KAMIYO Enterprise: $499/month (price_1SMwJvCvpzIkQ1SiEoXhP1Ao)"
echo ""

print_info "Target MCP pricing:"
echo "  • MCP Personal: $19/month"
echo "  • MCP Team: $99/month"
echo "  • MCP Enterprise: $299/month"
echo ""

print_warning "NOTE: We will NOT modify existing prices (Stripe best practice)"
print_info "Instead, we'll create NEW prices for MCP tiers"
echo ""

read -p "Press Enter to create new MCP prices (or Ctrl+C to skip)..."

# ============================================================================
# CREATE NEW MCP PRICES
# ============================================================================

print_header "Creating New MCP Prices"

# ============================================================================
# CREATE PERSONAL PRICE ($19/month)
# ============================================================================

print_info "Creating MCP Personal price ($19/month)..."

PRICE_PERSONAL_JSON=$(stripe prices create \
  --product="$PRODUCT_PRO_ID" \
  --unit-amount=1900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Personal - Monthly" \
  --metadata[tier]="personal" \
  --metadata[mcp_price]="true" \
  2>&1)

if [ $? -eq 0 ]; then
    PRICE_PERSONAL_ID=$(echo "$PRICE_PERSONAL_JSON" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
    print_success "Created MCP Personal price: $PRICE_PERSONAL_ID"
else
    print_error "Failed to create Personal price"
    echo "$PRICE_PERSONAL_JSON"
fi

# ============================================================================
# CREATE TEAM PRICE ($99/month)
# ============================================================================

print_info "Creating MCP Team price ($99/month)..."

PRICE_TEAM_MCP_JSON=$(stripe prices create \
  --product="$PRODUCT_TEAM_ID" \
  --unit-amount=9900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Team - Monthly" \
  --metadata[tier]="team" \
  --metadata[mcp_price]="true" \
  2>&1)

if [ $? -eq 0 ]; then
    PRICE_TEAM_MCP_ID=$(echo "$PRICE_TEAM_MCP_JSON" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
    print_success "Created MCP Team price: $PRICE_TEAM_MCP_ID"
else
    print_error "Failed to create Team price"
    echo "$PRICE_TEAM_MCP_JSON"
fi

# ============================================================================
# CREATE ENTERPRISE PRICE ($299/month)
# ============================================================================

print_info "Creating MCP Enterprise price ($299/month)..."

PRICE_ENTERPRISE_MCP_JSON=$(stripe prices create \
  --product="$PRODUCT_ENTERPRISE_ID" \
  --unit-amount=29900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Enterprise - Monthly" \
  --metadata[tier]="enterprise" \
  --metadata[mcp_price]="true" \
  2>&1)

if [ $? -eq 0 ]; then
    PRICE_ENTERPRISE_MCP_ID=$(echo "$PRICE_ENTERPRISE_MCP_JSON" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
    print_success "Created MCP Enterprise price: $PRICE_ENTERPRISE_MCP_ID"
else
    print_error "Failed to create Enterprise price"
    echo "$PRICE_ENTERPRISE_MCP_JSON"
fi

echo ""

# ============================================================================
# SAVE UPDATED PRICE IDs TO FILE
# ============================================================================

print_header "Saving Updated Configuration"

cat > "$OUTPUT_FILE" <<EOF
# KAMIYO MCP Stripe Product & Price IDs
# Generated: $(date)
# Mode: $MODE

# ============================================================================
# MCP PRICE IDs (Use these in your .env file for MCP subscriptions)
# ============================================================================

STRIPE_PRICE_MCP_PERSONAL=$PRICE_PERSONAL_ID
STRIPE_PRICE_MCP_TEAM=$PRICE_TEAM_MCP_ID
STRIPE_PRICE_MCP_ENTERPRISE=$PRICE_ENTERPRISE_MCP_ID

# ============================================================================
# LEGACY PRICE IDs (Keep for existing subscriptions - DO NOT DELETE)
# ============================================================================

STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID
STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID
STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID

# ============================================================================
# PRODUCT IDs (Updated for MCP)
# ============================================================================

PRODUCT_MCP_PERSONAL=$PRODUCT_PRO_ID        # Previously "KAMIYO Pro"
PRODUCT_MCP_TEAM=$PRODUCT_TEAM_ID          # Previously "KAMIYO Team"
PRODUCT_MCP_ENTERPRISE=$PRODUCT_ENTERPRISE_ID  # Previously "KAMIYO Enterprise"

# ============================================================================
# PRICING SUMMARY
# ============================================================================

# MCP Personal - \$19/month (was \$89/month)
#   Product: $PRODUCT_PRO_ID (renamed from "KAMIYO Pro")
#   New Price: $PRICE_PERSONAL_ID
#   Legacy Price: $PRICE_PRO_ID (\$89/month - keep for existing subscriptions)
#   Features:
#     - 1 AI agent
#     - 30 requests/min
#     - 1,000 requests/day
#     - MCP integration via Claude Desktop

# MCP Team - \$99/month (was \$199/month)
#   Product: $PRODUCT_TEAM_ID
#   New Price: $PRICE_TEAM_MCP_ID
#   Legacy Price: $PRICE_TEAM_ID (\$199/month - keep for existing subscriptions)
#   Features:
#     - 5 AI agents
#     - 100 requests/min
#     - 10,000 requests/day
#     - Webhooks
#     - Team workspace
#     - Priority support

# MCP Enterprise - \$299/month (was \$499/month)
#   Product: $PRODUCT_ENTERPRISE_ID
#   New Price: $PRICE_ENTERPRISE_MCP_ID
#   Legacy Price: $PRICE_ENTERPRISE_ID (\$499/month - keep for existing subscriptions)
#   Features:
#     - Unlimited AI agents
#     - 500 requests/min
#     - 100,000 requests/day
#     - 99.9% SLA
#     - Dedicated support
#     - Custom integrations

EOF

print_success "Configuration saved to: $OUTPUT_FILE"
echo ""

# ============================================================================
# SUMMARY
# ============================================================================

print_header "Update Complete!"

print_success "All products updated with MCP metadata!"
echo ""

echo "What was updated:"
echo "  ✓ KAMIYO Pro → KAMIYO MCP Personal"
echo "  ✓ KAMIYO Team → KAMIYO MCP Team"
echo "  ✓ KAMIYO Enterprise → KAMIYO MCP Enterprise"
echo ""

echo "New MCP Price IDs (add these to your .env file):"
echo ""
echo "  STRIPE_PRICE_MCP_PERSONAL=$PRICE_PERSONAL_ID"
echo "  STRIPE_PRICE_MCP_TEAM=$PRICE_TEAM_MCP_ID"
echo "  STRIPE_PRICE_MCP_ENTERPRISE=$PRICE_ENTERPRISE_MCP_ID"
echo ""

print_warning "IMPORTANT: Legacy prices still exist and should NOT be deleted!"
echo "  • Keep legacy price IDs in .env for existing subscriptions"
echo "  • Existing customers will continue on old pricing"
echo "  • New customers will use MCP pricing"
echo ""

# ============================================================================
# NEXT STEPS
# ============================================================================

print_header "Next Steps"

echo "1. Update your .env file:"
echo "   Add these MCP price IDs (keep legacy prices too):"
echo ""
echo "   # MCP Prices (new subscriptions)"
echo "   STRIPE_PRICE_MCP_PERSONAL=$PRICE_PERSONAL_ID"
echo "   STRIPE_PRICE_MCP_TEAM=$PRICE_TEAM_MCP_ID"
echo "   STRIPE_PRICE_MCP_ENTERPRISE=$PRICE_ENTERPRISE_MCP_ID"
echo ""
echo "   # Legacy Prices (existing subscriptions - DO NOT DELETE)"
echo "   STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID"
echo "   STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID"
echo "   STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID"
echo ""

echo "2. Update backend billing logic:"
echo "   - Use MCP price IDs for new checkouts"
echo "   - Keep legacy price IDs for existing subscriptions"
echo "   - Read tier metadata from product.metadata.tier"
echo ""

echo "3. Verify products in Stripe Dashboard:"
if [ "$MODE" = "test" ]; then
    echo "   https://dashboard.stripe.com/test/products"
else
    echo "   https://dashboard.stripe.com/products"
fi
echo ""

echo "4. Test creating a checkout session:"
echo "   curl -X POST http://localhost:8000/api/billing/create-checkout-session \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"tier\": \"personal\", \"user_email\": \"test@example.com\"}'"
echo ""

echo "5. Archive old prices in Stripe Dashboard (AFTER migrating all subscriptions):"
if [ "$MODE" = "test" ]; then
    echo "   https://dashboard.stripe.com/test/prices"
else
    echo "   https://dashboard.stripe.com/prices"
fi
echo "   - Find prices: $PRICE_PRO_ID, $PRICE_TEAM_ID, $PRICE_ENTERPRISE_ID"
echo "   - Click 'Archive' to hide from new checkouts"
echo "   - Existing subscriptions will continue to work"
echo ""

print_success "MCP product update complete!"
echo ""
