#!/bin/bash
# KAMIYO Stripe Products - Manual Creation
# Run each command one at a time to avoid issues

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating KAMIYO Pro Product..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

stripe products create \
  --name="KAMIYO Pro" \
  --description="50K API calls/day, real-time data, WebSocket, email support" \
  --metadata[tier]="pro" \
  --metadata[daily_limit]="50000"

echo ""
echo "Copy the product ID above (prod_xxxxx) and run:"
echo ""
echo "stripe prices create --product=prod_PASTE_ID_HERE --unit-amount=8900 --currency=usd --recurring[interval]=month --nickname='KAMIYO Pro Monthly'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
