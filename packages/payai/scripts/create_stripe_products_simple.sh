#!/bin/bash
# Simple Stripe Product Creation Script - No Prompts
# Creates KAMIYO subscription products and prices

set -e

echo "Creating KAMIYO Pro product..."
PRODUCT_PRO=$(stripe products create \
  --name="KAMIYO Pro" \
  --description="Professional API access with 50,000 calls/day, real-time data, WebSocket streaming, and email support" \
  --metadata[tier]="pro" \
  --metadata[daily_limit]="50000" \
  --metadata[rate_limit_per_min]="35" \
  --format=json)

PRODUCT_PRO_ID=$(echo "$PRODUCT_PRO" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Pro Product: $PRODUCT_PRO_ID"

echo "Creating KAMIYO Pro price ($89/month)..."
PRICE_PRO=$(stripe prices create \
  --product="$PRODUCT_PRO_ID" \
  --unit-amount=8900 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="KAMIYO Pro - Monthly" \
  --format=json)

PRICE_PRO_ID=$(echo "$PRICE_PRO" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Pro Price: $PRICE_PRO_ID"
echo ""

echo "Creating KAMIYO Team product..."
PRODUCT_TEAM=$(stripe products create \
  --name="KAMIYO Team" \
  --description="Team API access with 100,000 calls/day, 5 webhooks, team collaboration, fork detection, and priority support" \
  --metadata[tier]="team" \
  --metadata[daily_limit]="100000" \
  --metadata[rate_limit_per_min]="70" \
  --metadata[webhook_limit]="5" \
  --format=json)

PRODUCT_TEAM_ID=$(echo "$PRODUCT_TEAM" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Team Product: $PRODUCT_TEAM_ID"

echo "Creating KAMIYO Team price ($199/month)..."
PRICE_TEAM=$(stripe prices create \
  --product="$PRODUCT_TEAM_ID" \
  --unit-amount=19900 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="KAMIYO Team - Monthly" \
  --format=json)

PRICE_TEAM_ID=$(echo "$PRICE_TEAM" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Team Price: $PRICE_TEAM_ID"
echo ""

echo "Creating KAMIYO Enterprise product..."
PRODUCT_ENTERPRISE=$(stripe products create \
  --name="KAMIYO Enterprise" \
  --description="Unlimited API calls, 50 webhooks, custom integrations, protocol watchlists, fork graph visualization, SLA guarantees, and dedicated support" \
  --metadata[tier]="enterprise" \
  --metadata[daily_limit]="unlimited" \
  --metadata[rate_limit_per_min]="1000" \
  --metadata[webhook_limit]="50" \
  --format=json)

PRODUCT_ENTERPRISE_ID=$(echo "$PRODUCT_ENTERPRISE" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Enterprise Product: $PRODUCT_ENTERPRISE_ID"

echo "Creating KAMIYO Enterprise price ($499/month)..."
PRICE_ENTERPRISE=$(stripe prices create \
  --product="$PRODUCT_ENTERPRISE_ID" \
  --unit-amount=49900 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="KAMIYO Enterprise - Monthly" \
  --format=json)

PRICE_ENTERPRISE_ID=$(echo "$PRICE_ENTERPRISE" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/"id": *"\([^"]*\)"/\1/')
echo "✅ Enterprise Price: $PRICE_ENTERPRISE_ID"
echo ""

# Save IDs to file
cat > stripe_product_ids.txt << EOF
# KAMIYO Stripe Product & Price IDs
# Generated: $(date)

STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID
STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID
STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID

# Product IDs (for reference)
PRODUCT_ID_PRO=$PRODUCT_PRO_ID
PRODUCT_ID_TEAM=$PRODUCT_TEAM_ID
PRODUCT_ID_ENTERPRISE=$PRODUCT_ENTERPRISE_ID
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL PRODUCTS CREATED SUCCESSFULLY!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Price IDs (copy to .env):"
echo ""
echo "STRIPE_PRICE_ID_PRO=$PRICE_PRO_ID"
echo "STRIPE_PRICE_ID_TEAM=$PRICE_TEAM_ID"
echo "STRIPE_PRICE_ID_ENTERPRISE=$PRICE_ENTERPRISE_ID"
echo ""
echo "📄 Saved to: stripe_product_ids.txt"
echo ""
echo "Next steps:"
echo "1. Copy the price IDs above to your .env file"
echo "2. Create webhook: https://dashboard.stripe.com/webhooks"
echo "3. Configure Customer Portal: https://dashboard.stripe.com/settings/billing/portal"
echo ""
