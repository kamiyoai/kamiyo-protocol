#!/bin/bash
# KAMIYO MCP Stripe Product & Price Creation Script
# This script creates Stripe products and recurring prices for MCP subscriptions
# Author: KAMIYO Team
# Version: 1.0.0

set -e  # Exit on error

# ============================================================================
# CONFIGURATION
# ============================================================================

MODE="test"
FORCE_RECREATE=false
OUTPUT_FILE="stripe_mcp_product_ids.txt"

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
        --force)
            FORCE_RECREATE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Create Stripe products and prices for KAMIYO MCP subscriptions"
            echo ""
            echo "OPTIONS:"
            echo "  --test          Create products in test mode (default)"
            echo "  --live          Create products in live mode"
            echo "  --force         Force recreation of products even if they exist"
            echo "  -h, --help      Show this help message"
            echo ""
            echo "EXAMPLES:"
            echo "  $0                    # Create in test mode"
            echo "  $0 --test             # Create in test mode (explicit)"
            echo "  $0 --live             # Create in live mode"
            echo "  $0 --force --test     # Force recreate in test mode"
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

print_header "KAMIYO MCP Stripe Product Creation"

echo "This script will create:"
echo "  • 3 MCP subscription products (Personal, Team, Enterprise)"
echo "  • 3 monthly recurring prices"
echo "  • Metadata for tier configuration"
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
    echo ""
    echo "This will open your browser to authorize the CLI with your Stripe account."
    exit 1
fi
print_success "Stripe CLI authenticated"

# Check if jq is installed (for JSON parsing)
if ! command -v jq &> /dev/null; then
    print_warning "jq not installed (recommended for better JSON parsing)"
    print_info "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    echo ""
    echo "Continuing with basic grep parsing..."
    USE_JQ=false
else
    print_success "jq installed for JSON parsing"
    USE_JQ=true
fi

echo ""

# ============================================================================
# CONFIRMATION
# ============================================================================

if [ "$MODE" = "live" ]; then
    print_warning "You are about to create products in LIVE mode!"
    print_warning "This will affect your production Stripe account."
    echo ""
    read -p "Type 'yes' to continue with LIVE mode: " confirm
    if [ "$confirm" != "yes" ]; then
        print_error "Operation cancelled"
        exit 0
    fi
else
    print_info "Creating products in TEST mode"
    read -p "Press Enter to continue (or Ctrl+C to cancel)..."
fi

echo ""

# ============================================================================
# CHECK FOR EXISTING PRODUCTS
# ============================================================================

print_header "Checking for Existing Products"

check_product_exists() {
    local product_name="$1"
    local existing=$(stripe products list --limit 100 2>/dev/null | grep -i "$product_name" || echo "")

    if [[ -n "$existing" ]]; then
        return 0  # Product exists
    else
        return 1  # Product doesn't exist
    fi
}

PERSONAL_EXISTS=false
TEAM_EXISTS=false
ENTERPRISE_EXISTS=false

if check_product_exists "KAMIYO MCP Personal"; then
    print_warning "Product 'KAMIYO MCP Personal' already exists"
    PERSONAL_EXISTS=true
fi

if check_product_exists "KAMIYO MCP Team"; then
    print_warning "Product 'KAMIYO MCP Team' already exists"
    TEAM_EXISTS=true
fi

if check_product_exists "KAMIYO MCP Enterprise"; then
    print_warning "Product 'KAMIYO MCP Enterprise' already exists"
    ENTERPRISE_EXISTS=true
fi

if [ "$PERSONAL_EXISTS" = true ] || [ "$TEAM_EXISTS" = true ] || [ "$ENTERPRISE_EXISTS" = true ]; then
    if [ "$FORCE_RECREATE" = false ]; then
        echo ""
        print_warning "Some products already exist. Use --force to recreate them."
        print_info "Or manually retrieve existing price IDs from Stripe Dashboard:"
        print_info "https://dashboard.stripe.com/products"
        echo ""
        exit 1
    else
        print_info "Force mode enabled - will attempt to use existing products"
    fi
else
    print_success "No existing products found - will create new ones"
fi

echo ""

# ============================================================================
# CREATE OUTPUT FILE
# ============================================================================

rm -f "$OUTPUT_FILE"
cat > "$OUTPUT_FILE" <<EOF
# KAMIYO MCP Stripe Product & Price IDs
# Generated: $(date)
# Mode: $MODE

EOF

# ============================================================================
# HELPER: EXTRACT ID FROM JSON
# ============================================================================

extract_id() {
    local json="$1"
    if [ "$USE_JQ" = true ]; then
        echo "$json" | jq -r '.id'
    else
        echo "$json" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/'
    fi
}

# ============================================================================
# CREATE PERSONAL TIER - $19/month
# ============================================================================

print_header "Creating MCP Personal Tier"

echo "Name:        KAMIYO MCP Personal"
echo "Price:       \$19/month"
echo "Description: Unlimited security queries for AI agents via Claude Desktop"
echo "Features:    1 AI agent, 30 requests/min, 1,000 requests/day"
echo ""

if [ "$PERSONAL_EXISTS" = true ] && [ "$FORCE_RECREATE" = false ]; then
    print_info "Using existing Personal product..."
    # Try to get existing product ID
    PRODUCT_PERSONAL_JSON=$(stripe products list --limit 100 2>/dev/null)
    PRODUCT_PERSONAL_ID=$(echo "$PRODUCT_PERSONAL_JSON" | grep -B 5 "KAMIYO MCP Personal" | grep '"id"' | head -1 | sed 's/.*"id": *"\([^"]*\)".*/\1/')
else
    print_info "Creating Personal product..."
    PRODUCT_PERSONAL_JSON=$(stripe products create \
      --name="KAMIYO MCP Personal" \
      --description="Unlimited security queries for AI agents via Claude Desktop. 1 AI agent, 30 requests/min." \
      --metadata[tier]="personal" \
      --metadata[max_agents]="1" \
      --metadata[rate_limit_rpm]="30" \
      --metadata[rate_limit_daily]="1000" \
      --format=json 2>&1)

    if [ $? -ne 0 ]; then
        print_error "Failed to create Personal product"
        echo "$PRODUCT_PERSONAL_JSON"
        exit 1
    fi

    PRODUCT_PERSONAL_ID=$(extract_id "$PRODUCT_PERSONAL_JSON")
    print_success "Product created: $PRODUCT_PERSONAL_ID"
fi

# Create price
print_info "Creating Personal price..."
PRICE_PERSONAL_JSON=$(stripe prices create \
  --product="$PRODUCT_PERSONAL_ID" \
  --unit-amount=1900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Personal - Monthly" \
  --metadata[tier]="personal" \
  --format=json 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to create Personal price"
    echo "$PRICE_PERSONAL_JSON"
    exit 1
fi

PRICE_PERSONAL_ID=$(extract_id "$PRICE_PERSONAL_JSON")
print_success "Price created: $PRICE_PERSONAL_ID"

echo ""
echo "STRIPE_PRICE_MCP_PERSONAL=$PRICE_PERSONAL_ID" >> "$OUTPUT_FILE"

# ============================================================================
# CREATE TEAM TIER - $99/month
# ============================================================================

print_header "Creating MCP Team Tier"

echo "Name:        KAMIYO MCP Team"
echo "Price:       \$99/month"
echo "Description: Team subscription with enhanced capabilities"
echo "Features:    5 AI agents, 100 requests/min, 10,000 requests/day, webhooks, priority support"
echo ""

if [ "$TEAM_EXISTS" = true ] && [ "$FORCE_RECREATE" = false ]; then
    print_info "Using existing Team product..."
    PRODUCT_TEAM_JSON=$(stripe products list --limit 100 2>/dev/null)
    PRODUCT_TEAM_ID=$(echo "$PRODUCT_TEAM_JSON" | grep -B 5 "KAMIYO MCP Team" | grep '"id"' | head -1 | sed 's/.*"id": *"\([^"]*\)".*/\1/')
else
    print_info "Creating Team product..."
    PRODUCT_TEAM_JSON=$(stripe products create \
      --name="KAMIYO MCP Team" \
      --description="Team subscription with 5 AI agents, team workspace, webhooks, and priority support." \
      --metadata[tier]="team" \
      --metadata[max_agents]="5" \
      --metadata[rate_limit_rpm]="100" \
      --metadata[rate_limit_daily]="10000" \
      --format=json 2>&1)

    if [ $? -ne 0 ]; then
        print_error "Failed to create Team product"
        echo "$PRODUCT_TEAM_JSON"
        exit 1
    fi

    PRODUCT_TEAM_ID=$(extract_id "$PRODUCT_TEAM_JSON")
    print_success "Product created: $PRODUCT_TEAM_ID"
fi

# Create price
print_info "Creating Team price..."
PRICE_TEAM_JSON=$(stripe prices create \
  --product="$PRODUCT_TEAM_ID" \
  --unit-amount=9900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Team - Monthly" \
  --metadata[tier]="team" \
  --format=json 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to create Team price"
    echo "$PRICE_TEAM_JSON"
    exit 1
fi

PRICE_TEAM_ID=$(extract_id "$PRICE_TEAM_JSON")
print_success "Price created: $PRICE_TEAM_ID"

echo ""
echo "STRIPE_PRICE_MCP_TEAM=$PRICE_TEAM_ID" >> "$OUTPUT_FILE"

# ============================================================================
# CREATE ENTERPRISE TIER - $299/month
# ============================================================================

print_header "Creating MCP Enterprise Tier"

echo "Name:        KAMIYO MCP Enterprise"
echo "Price:       \$299/month"
echo "Description: Unlimited agents with premium support"
echo "Features:    Unlimited AI agents, 500 requests/min, 100,000 requests/day, 99.9% SLA, dedicated support"
echo ""

if [ "$ENTERPRISE_EXISTS" = true ] && [ "$FORCE_RECREATE" = false ]; then
    print_info "Using existing Enterprise product..."
    PRODUCT_ENTERPRISE_JSON=$(stripe products list --limit 100 2>/dev/null)
    PRODUCT_ENTERPRISE_ID=$(echo "$PRODUCT_ENTERPRISE_JSON" | grep -B 5 "KAMIYO MCP Enterprise" | grep '"id"' | head -1 | sed 's/.*"id": *"\([^"]*\)".*/\1/')
else
    print_info "Creating Enterprise product..."
    PRODUCT_ENTERPRISE_JSON=$(stripe products create \
      --name="KAMIYO MCP Enterprise" \
      --description="Unlimited AI agents, 99.9% SLA, dedicated support, custom integrations." \
      --metadata[tier]="enterprise" \
      --metadata[max_agents]="unlimited" \
      --metadata[rate_limit_rpm]="500" \
      --metadata[rate_limit_daily]="100000" \
      --format=json 2>&1)

    if [ $? -ne 0 ]; then
        print_error "Failed to create Enterprise product"
        echo "$PRODUCT_ENTERPRISE_JSON"
        exit 1
    fi

    PRODUCT_ENTERPRISE_ID=$(extract_id "$PRODUCT_ENTERPRISE_JSON")
    print_success "Product created: $PRODUCT_ENTERPRISE_ID"
fi

# Create price
print_info "Creating Enterprise price..."
PRICE_ENTERPRISE_JSON=$(stripe prices create \
  --product="$PRODUCT_ENTERPRISE_ID" \
  --unit-amount=29900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO MCP Enterprise - Monthly" \
  --metadata[tier]="enterprise" \
  --format=json 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to create Enterprise price"
    echo "$PRICE_ENTERPRISE_JSON"
    exit 1
fi

PRICE_ENTERPRISE_ID=$(extract_id "$PRICE_ENTERPRISE_JSON")
print_success "Price created: $PRICE_ENTERPRISE_ID"

echo ""
echo "STRIPE_PRICE_MCP_ENTERPRISE=$PRICE_ENTERPRISE_ID" >> "$OUTPUT_FILE"

# ============================================================================
# ADD PRODUCT IDs TO OUTPUT FILE
# ============================================================================

cat >> "$OUTPUT_FILE" <<EOF

# Product IDs (for reference)
PRODUCT_MCP_PERSONAL=$PRODUCT_PERSONAL_ID
PRODUCT_MCP_TEAM=$PRODUCT_TEAM_ID
PRODUCT_MCP_ENTERPRISE=$PRODUCT_ENTERPRISE_ID

# ============================================================================
# PRODUCT DETAILS
# ============================================================================

# KAMIYO MCP Personal - \$19/month
#   - 1 AI agent
#   - 30 requests/min
#   - 1,000 requests/day
#   - Product: $PRODUCT_PERSONAL_ID
#   - Price: $PRICE_PERSONAL_ID

# KAMIYO MCP Team - \$99/month
#   - 5 AI agents
#   - 100 requests/min
#   - 10,000 requests/day
#   - Webhooks
#   - Priority support
#   - Product: $PRODUCT_TEAM_ID
#   - Price: $PRICE_TEAM_ID

# KAMIYO MCP Enterprise - \$299/month
#   - Unlimited AI agents
#   - 500 requests/min
#   - 100,000 requests/day
#   - 99.9% SLA
#   - Dedicated support
#   - Custom integrations
#   - Product: $PRODUCT_ENTERPRISE_ID
#   - Price: $PRICE_ENTERPRISE_ID

EOF

# ============================================================================
# SUMMARY
# ============================================================================

print_header "Setup Complete!"

print_success "All MCP products and prices created successfully!"
echo ""
echo "Price IDs (add these to your .env file):"
echo ""
echo "  STRIPE_PRICE_MCP_PERSONAL=$PRICE_PERSONAL_ID"
echo "  STRIPE_PRICE_MCP_TEAM=$PRICE_TEAM_ID"
echo "  STRIPE_PRICE_MCP_ENTERPRISE=$PRICE_ENTERPRISE_ID"
echo ""
echo "Output saved to: ${CYAN}$OUTPUT_FILE${NC}"
echo ""

# ============================================================================
# NEXT STEPS
# ============================================================================

print_header "Next Steps"

echo "1. Update your .env file:"
echo "   Add the three price IDs shown above"
echo ""
echo "2. Verify products in Stripe Dashboard:"
if [ "$MODE" = "test" ]; then
    echo "   https://dashboard.stripe.com/test/products"
else
    echo "   https://dashboard.stripe.com/products"
fi
echo ""
echo "3. Test creating a checkout session:"
echo "   curl -X POST http://localhost:8000/api/billing/create-checkout-session \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"tier\": \"personal\", \"user_email\": \"test@example.com\"}'"
echo ""
echo "4. Configure webhook endpoint (if not already done):"
if [ "$MODE" = "test" ]; then
    echo "   Test mode: stripe listen --forward-to localhost:8000/api/webhooks/stripe"
else
    echo "   Live mode: https://dashboard.stripe.com/webhooks"
    echo "   Add endpoint: https://api.kamiyo.ai/api/webhooks/stripe"
fi
echo ""
echo "5. Update .env.example with placeholder price IDs"
echo ""

print_success "MCP product setup complete!"
echo ""
