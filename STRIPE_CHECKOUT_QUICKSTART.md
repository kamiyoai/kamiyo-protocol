# KAMIYO Stripe Checkout - Quick Start Testing Guide

**Quick Reference for Testing the Backend Implementation**

---

## Prerequisites

```bash
# 1. Install Stripe CLI
brew install stripe/stripe-cli/stripe

# 2. Login to Stripe
stripe login

# 3. Ensure environment variables are set
cat .env | grep STRIPE
```

---

## Step 1: Start Local Server

```bash
# Terminal 1: Start FastAPI server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# Verify server is running
curl http://localhost:8000/health
```

---

## Step 2: Setup Webhook Forwarding

```bash
# Terminal 2: Forward Stripe webhooks to local server
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe

# Copy the webhook signing secret from output (looks like: whsec_...)
# Add to .env:
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> .env

# Restart API server to pick up new secret
```

---

## Step 3: Test Checkout Creation

```bash
# Create a checkout session
curl -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "personal",
    "user_email": "test@example.com",
    "success_url": "http://localhost:3000/dashboard/success?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "http://localhost:3000/pricing"
  }'

# Expected output:
# {
#   "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
#   "session_id": "cs_test_...",
#   "expires_at": 1730123456
# }

# Save the session_id for next step
```

---

## Step 4: Test Webhook Event

```bash
# Trigger a test checkout completion event
stripe trigger checkout.session.completed

# Watch the logs in Terminal 1 for:
# - "Processing checkout.session.completed"
# - "Checkout completed - Email: ..."
# - "MCP token created for user..."
# - Token logged (first 20 chars)
```

---

## Step 5: Verify Database

```bash
# Check if customer was created
sqlite3 data/kamiyo.db "SELECT * FROM customers WHERE email LIKE '%stripe%';"

# Check if MCP token was stored
sqlite3 data/kamiyo.db "SELECT user_id, tier, expires_at, is_active FROM mcp_tokens LIMIT 5;"

# Check if subscription was created
sqlite3 data/kamiyo.db "SELECT stripe_subscription_id, tier, status FROM subscriptions LIMIT 5;"
```

---

## Step 6: Test Session Retrieval

```bash
# Use the session_id from Step 3
SESSION_ID="cs_test_..."

curl http://localhost:8000/api/billing/checkout-session/$SESSION_ID

# Expected output:
# {
#   "session_id": "cs_test_...",
#   "status": "complete",
#   "customer_email": "test@example.com",
#   "tier": "personal",
#   "amount_total": 1900,
#   "currency": "usd"
# }
```

---

## Step 7: Test Health Check

```bash
curl http://localhost:8000/api/billing/checkout-health

# Expected output:
# {
#   "status": "healthy",
#   "service": "checkout",
#   "configured_tiers": ["personal", "team", "enterprise"]
# }
```

---

## Common Test Scenarios

### Test 1: Complete Checkout Flow (End-to-End)

```bash
# 1. Create checkout session
RESPONSE=$(curl -s -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "team",
    "user_email": "team@test.com",
    "success_url": "http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "http://localhost:3000/pricing"
  }')

SESSION_ID=$(echo $RESPONSE | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

# 2. Trigger webhook (simulates payment completion)
stripe trigger checkout.session.completed

# 3. Verify session
curl http://localhost:8000/api/billing/checkout-session/$SESSION_ID

# 4. Check database
sqlite3 data/kamiyo.db "SELECT * FROM mcp_tokens ORDER BY created_at DESC LIMIT 1;"
```

### Test 2: Invalid Tier

```bash
curl -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "invalid",
    "success_url": "http://localhost:3000/success",
    "cancel_url": "http://localhost:3000/pricing"
  }'

# Expected: 400 Bad Request
```

### Test 3: Missing Configuration

```bash
# Temporarily remove Stripe key
unset STRIPE_SECRET_KEY

# Try to create checkout
curl -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "personal",
    "success_url": "http://localhost:3000/success",
    "cancel_url": "http://localhost:3000/pricing"
  }'

# Expected: 500 Internal Server Error
# Restore key and restart server
```

### Test 4: Webhook Signature Verification

```bash
# Try to send webhook without valid signature
curl -X POST http://localhost:8000/api/v1/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type": "checkout.session.completed"}'

# Expected: 400 Bad Request (missing signature)
```

---

## Debugging Commands

### View Real-time Logs

```bash
# In a new terminal
tail -f logs/api.log | grep -E "checkout|mcp_token|webhook"
```

### Check Stripe Events

```bash
# List recent events
stripe events list --limit 10

# Get specific event
stripe events retrieve evt_...

# Resend event to webhook
stripe events resend evt_...
```

### Database Inspection

```bash
# Count MCP tokens
sqlite3 data/kamiyo.db "SELECT COUNT(*) FROM mcp_tokens;"

# Show active tokens by tier
sqlite3 data/kamiyo.db "
  SELECT tier, COUNT(*) as count
  FROM mcp_tokens
  WHERE is_active = TRUE
  GROUP BY tier;
"

# Show recent subscriptions
sqlite3 data/kamiyo.db "
  SELECT
    s.stripe_subscription_id,
    s.tier,
    s.status,
    c.email
  FROM subscriptions s
  JOIN customers c ON s.customer_id = c.id
  ORDER BY s.last_webhook_updated_at DESC
  LIMIT 10;
"
```

---

## Environment Setup Checklist

Before testing, ensure these are configured:

```bash
# Required Environment Variables
✅ STRIPE_SECRET_KEY=sk_test_...
✅ STRIPE_PUBLISHABLE_KEY=pk_test_...
✅ STRIPE_WEBHOOK_SECRET=whsec_...
✅ STRIPE_PRICE_MCP_PERSONAL=price_...
✅ STRIPE_PRICE_MCP_TEAM=price_...
✅ STRIPE_PRICE_MCP_ENTERPRISE=price_...
✅ MCP_JWT_SECRET=<32+ char secret>
✅ MCP_JWT_ALGORITHM=HS256
✅ MCP_TOKEN_EXPIRY_DAYS=365

# Verify all set
env | grep -E "STRIPE|MCP_JWT|MCP_TOKEN"
```

---

## Expected Log Output (Success)

```
INFO:     Processing checkout.session.completed: cs_test_abc123
INFO:     Checkout completed - Email: test@example.com, Tier: personal, Subscription: sub_test_xyz
INFO:     Creating customer record for cus_test_123 (test@example.com)
INFO:     Created customer record with user_id: 550e8400-e29b-41d4-a716-446655440000
INFO:     Subscription sub_test_xyz exists - generating MCP token
INFO:     MCP token created for user 550e8400-e29b-41d4-a716-446655440000, tier personal, subscription sub_test_xyz
WARNING:  TODO: Send MCP welcome email to test@example.com with token
INFO:     MCP Token (STORE SECURELY - not logged in production): eyJhbGciOiJIUzI1NiIs...
INFO:     Successfully processed checkout.session.completed for cs_test_abc123
```

---

## Troubleshooting

### Issue: "Webhook signature verification failed"

**Solution:**
```bash
# Get new webhook secret
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe

# Copy the whsec_... secret
# Update .env
# Restart API server
```

### Issue: "Price ID not configured for tier"

**Solution:**
```bash
# Check if price IDs are set
env | grep STRIPE_PRICE_MCP

# If missing, create products in Stripe:
stripe products create --name "KAMIYO MCP Personal"
stripe prices create --product prod_... --unit-amount 1900 --currency usd --recurring interval=month

# Add price ID to .env
echo "STRIPE_PRICE_MCP_PERSONAL=price_..." >> .env
```

### Issue: "Database error: table mcp_tokens does not exist"

**Solution:**
```bash
# Run database migrations
python3 database/migrations/002_x402_payments_sqlite.sql

# Or create table manually:
sqlite3 data/kamiyo.db < database/schema/mcp_tokens.sql
```

### Issue: "MCP JWT secret not configured"

**Solution:**
```bash
# Generate secure secret
openssl rand -hex 32

# Add to .env
echo "MCP_JWT_SECRET=<generated_secret>" >> .env
```

---

## Quick Validation Script

```bash
#!/bin/bash
# validate_checkout.sh - Quick validation of checkout implementation

echo "=== KAMIYO Checkout Validation ==="

# 1. Check environment
echo -n "1. Stripe Secret Key... "
if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "❌ NOT SET"
else
  echo "✅ SET"
fi

echo -n "2. Webhook Secret... "
if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
  echo "❌ NOT SET"
else
  echo "✅ SET"
fi

echo -n "3. MCP JWT Secret... "
if [ -z "$MCP_JWT_SECRET" ]; then
  echo "❌ NOT SET"
else
  echo "✅ SET"
fi

# 2. Test endpoints
echo -n "4. API Health... "
if curl -s http://localhost:8000/health > /dev/null; then
  echo "✅ HEALTHY"
else
  echo "❌ FAILED"
fi

echo -n "5. Checkout Health... "
if curl -s http://localhost:8000/api/billing/checkout-health | grep -q "healthy"; then
  echo "✅ HEALTHY"
else
  echo "❌ FAILED"
fi

# 3. Test checkout creation
echo -n "6. Create Checkout... "
RESPONSE=$(curl -s -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "personal",
    "success_url": "http://localhost:3000/success",
    "cancel_url": "http://localhost:3000/pricing"
  }')

if echo "$RESPONSE" | grep -q "checkout_url"; then
  echo "✅ SUCCESS"
else
  echo "❌ FAILED"
  echo "$RESPONSE"
fi

echo ""
echo "=== Validation Complete ==="
```

Run validation:
```bash
chmod +x validate_checkout.sh
./validate_checkout.sh
```

---

## Next Steps After Testing

1. ✅ All tests pass → Ready for frontend integration
2. ⚠️ Implement email service
3. ⚠️ Create Stripe products in test mode
4. ⚠️ Test with real Stripe checkout
5. ⚠️ Deploy to staging environment
6. ⚠️ Production deployment

---

**For detailed documentation, see:** `STRIPE_CHECKOUT_BACKEND_IMPLEMENTATION_COMPLETE.md`
