#!/bin/bash
# KAMIYO Stripe Product & Subscription Setup Script
# This script creates all necessary Stripe products, prices, and webhook configurations
# for the KAMIYO x402 payment facilitator platform

set -e  # Exit on error

echo "================================================================================"
echo "KAMIYO Stripe Setup Script"
echo "================================================================================"
echo ""
echo "This script will create:"
echo "  - 3 subscription products (Pro, Team, Enterprise)"
echo "  - 3 monthly recurring prices"
echo "  - 1 webhook endpoint for payment events"
echo ""
echo "Prerequisites:"
echo "  1. Stripe CLI installed: brew install stripe/stripe-cli/stripe"
echo "  2. Authenticated to Stripe: stripe login"
echo "  3. Correct Stripe account selected (check: stripe config --list)"
echo ""
echo "================================================================================"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ ERROR: Stripe CLI not found!"
    echo ""
    echo "Install with: brew install stripe/stripe-cli/stripe"
    echo "Then run: stripe login"
    exit 1
fi

# Check if authenticated
echo "🔐 Checking Stripe authentication..."
if ! stripe config --list &> /dev/null; then
    echo "❌ ERROR: Not authenticated to Stripe!"
    echo ""
    echo "Run: stripe login"
    exit 1
fi

echo "✅ Stripe CLI authenticated"
echo ""

# Ask for confirmation
read -p "⚠️  This will create products in your LIVE Stripe account. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Setup cancelled"
    exit 0
fi

echo ""
echo "================================================================================"
echo "CREATING KAMIYO PRODUCTS & PRICES"
echo "================================================================================"
echo ""

# Note: Stripe CLI doesn't support creating business profiles (subsidiaries)
# This must be done manually in the Dashboard at:
# https://dashboard.stripe.com/settings/business
echo "ℹ️  NOTE: To create a KAMIYO subsidiary/business profile:"
echo "   1. Go to: https://dashboard.stripe.com/settings/business"
echo "   2. Click 'Add business profile' or 'Create new profile'"
echo "   3. Enter business name: KAMIYO"
echo "   4. Fill in business details"
echo "   5. Save and use this profile for the products below"
echo ""
echo "⏸️  Press Enter once you've created the KAMIYO business profile (or skip if not needed)..."
read -p ""

# Create output file for generated IDs
OUTPUT_FILE="./stripe_product_ids.txt"
rm -f "$OUTPUT_FILE"
echo "# KAMIYO Stripe Product & Price IDs" > "$OUTPUT_FILE"
echo "# Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# ============================================================================
# PRO TIER - $89/month
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating PRO tier ($89/month)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PRODUCT_PRO=$(stripe products create \
  --name="KAMIYO Pro" \
  --description="Professional API access with 50,000 calls/day, real-time data, WebSocket streaming, and email support" \
  --metadata[tier]="pro" \
  --metadata[daily_limit]="50000" \
  --metadata[rate_limit_per_min]="35" \
  --metadata[features]="real_time_data,websocket,api_keys,email_support,90_days_history" \
  --format=json)

PRODUCT_PRO_ID=$(echo "$PRODUCT_PRO" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Product created: $PRODUCT_PRO_ID"

PRICE_PRO=$(stripe prices create \
  --product="$PRODUCT_PRO_ID" \
  --unit-amount=8900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO Pro - Monthly" \
  --metadata[tier]="pro" \
  --format=json)

PRICE_PRO_ID=$(echo "$PRICE_PRO" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Price created: $PRICE_PRO_ID"
echo ""
echo "STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID" >> "$OUTPUT_FILE"

# ============================================================================
# TEAM TIER - $199/month
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating TEAM tier ($199/month)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PRODUCT_TEAM=$(stripe products create \
  --name="KAMIYO Team" \
  --description="Team API access with 100,000 calls/day, 5 webhooks, team collaboration, fork detection, and priority support" \
  --metadata[tier]="team" \
  --metadata[daily_limit]="100000" \
  --metadata[rate_limit_per_min]="70" \
  --metadata[webhook_limit]="5" \
  --metadata[features]="real_time_data,webhooks,analytics,slack,fork_detection,pattern_clustering,1_year_history,priority_support" \
  --format=json)

PRODUCT_TEAM_ID=$(echo "$PRODUCT_TEAM" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Product created: $PRODUCT_TEAM_ID"

PRICE_TEAM=$(stripe prices create \
  --product="$PRODUCT_TEAM_ID" \
  --unit-amount=19900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO Team - Monthly" \
  --metadata[tier]="team" \
  --format=json)

PRICE_TEAM_ID=$(echo "$PRICE_TEAM" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Price created: $PRICE_TEAM_ID"
echo ""
echo "STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID" >> "$OUTPUT_FILE"

# ============================================================================
# ENTERPRISE TIER - $499/month
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating ENTERPRISE tier ($499/month)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PRODUCT_ENTERPRISE=$(stripe products create \
  --name="KAMIYO Enterprise" \
  --description="Unlimited API calls, 50 webhooks, custom integrations, protocol watchlists, fork graph visualization, SLA guarantees, and dedicated support" \
  --metadata[tier]="enterprise" \
  --metadata[daily_limit]="unlimited" \
  --metadata[rate_limit_per_min]="1000" \
  --metadata[webhook_limit]="50" \
  --metadata[features]="unlimited_calls,webhooks,custom_integrations,sla,watchlists,fork_graphs,unlimited_history,dedicated_support,custom_sla,quarterly_reviews" \
  --format=json)

PRODUCT_ENTERPRISE_ID=$(echo "$PRODUCT_ENTERPRISE" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Product created: $PRODUCT_ENTERPRISE_ID"

PRICE_ENTERPRISE=$(stripe prices create \
  --product="$PRODUCT_ENTERPRISE_ID" \
  --unit-amount=49900 \
  --currency=usd \
  --recurring[interval]=month \
  --recurring[usage_type]=licensed \
  --nickname="KAMIYO Enterprise - Monthly" \
  --metadata[tier]="enterprise" \
  --format=json)

PRICE_ENTERPRISE_ID=$(echo "$PRICE_ENTERPRISE" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Price created: $PRICE_ENTERPRISE_ID"
echo ""
echo "STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID" >> "$OUTPUT_FILE"

# ============================================================================
# WEBHOOK ENDPOINT SETUP
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setting up webhook endpoint..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ℹ️  Webhook endpoint must be created in Stripe Dashboard:"
echo "   1. Go to: https://dashboard.stripe.com/webhooks"
echo "   2. Click 'Add endpoint'"
echo "   3. Endpoint URL: https://api.kamiyo.ai/api/v1/webhooks/stripe"
echo "   4. Description: KAMIYO Payment Events"
echo "   5. Select events to listen for:"
echo "      - customer.subscription.created"
echo "      - customer.subscription.updated"
echo "      - customer.subscription.deleted"
echo "      - customer.subscription.trial_will_end"
echo "      - invoice.payment_succeeded"
echo "      - invoice.payment_failed"
echo "      - payment_intent.succeeded"
echo "      - payment_intent.payment_failed"
echo "   6. Click 'Add endpoint'"
echo "   7. Copy the webhook signing secret (whsec_...)"
echo ""
echo "⏸️  Press Enter once webhook is created..."
read -p ""

# ============================================================================
# CUSTOMER PORTAL SETUP
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setting up Customer Portal..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ℹ️  Customer Portal must be configured in Stripe Dashboard:"
echo "   1. Go to: https://dashboard.stripe.com/settings/billing/portal"
echo "   2. Click 'Activate customer portal'"
echo "   3. Configure settings:"
echo "      - Business name: KAMIYO"
echo "      - Customer support email: support@kamiyo.ai"
echo "      - Brand color: #6366f1 (or your brand color)"
echo "      - Logo: Upload KAMIYO logo"
echo "   4. Enable features:"
echo "      ✅ View invoices"
echo "      ✅ Update payment method"
echo "      ✅ Cancel subscription"
echo "      ✅ Update subscription (allow tier changes)"
echo "   5. Save configuration"
echo ""

# ============================================================================
# SUMMARY & NEXT STEPS
# ============================================================================
echo ""
echo "================================================================================"
echo "✅ STRIPE SETUP COMPLETE!"
echo "================================================================================"
echo ""
echo "Product IDs created:"
echo "  Pro:        $PRODUCT_PRO_ID"
echo "  Team:       $PRODUCT_TEAM_ID"
echo "  Enterprise: $PRODUCT_ENTERPRISE_ID"
echo ""
echo "Price IDs created:"
echo "  Pro ($89/mo):        $PRICE_PRO_ID"
echo "  Team ($199/mo):      $PRICE_TEAM_ID"
echo "  Enterprise ($499/mo): $PRICE_ENTERPRISE_ID"
echo ""
echo "📄 All IDs saved to: $OUTPUT_FILE"
echo ""
echo "================================================================================"
echo "NEXT STEPS"
echo "================================================================================"
echo ""
echo "1. Update your .env file with the price IDs:"
echo ""
echo "   STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID"
echo "   STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID"
echo "   STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID"
echo ""
echo "2. Create webhook endpoint (see instructions above)"
echo "   Then add to .env:"
echo "   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret"
echo ""
echo "3. Configure Customer Portal (see instructions above)"
echo "   Then add portal URL to .env:"
echo "   STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/..."
echo ""
echo "4. Test subscription flow:"
echo "   - Go to: https://kamiyo.ai/pricing"
echo "   - Click 'Start Free Trial' on Pro tier"
echo "   - Use Stripe test card: 4242 4242 4242 4242"
echo "   - Verify subscription created in Stripe Dashboard"
echo ""
echo "5. Verify webhook delivery:"
echo "   - Go to: https://dashboard.stripe.com/webhooks"
echo "   - Check webhook logs for successful deliveries"
echo ""
echo "================================================================================"
echo "📚 DOCUMENTATION"
echo "================================================================================"
echo ""
echo "Stripe Dashboard: https://dashboard.stripe.com"
echo "Products:         https://dashboard.stripe.com/products"
echo "Subscriptions:    https://dashboard.stripe.com/subscriptions"
echo "Webhooks:         https://dashboard.stripe.com/webhooks"
echo "Customer Portal:  https://dashboard.stripe.com/settings/billing/portal"
echo "API Keys:         https://dashboard.stripe.com/apikeys"
echo ""
echo "KAMIYO API Docs:  https://kamiyo.ai/api-docs"
echo ""
echo "================================================================================"
echo ""
echo "✅ Setup complete! Copy the price IDs to your .env file and configure webhooks."
echo ""
