# Runbook: Stripe Webhook Failure

**Severity:** P1 (High)
**Impact:** Subscription updates not processing - revenue impact
**Response Time:** Within 15 minutes

## Prerequisites Check

Before starting, verify container names:

```bash
# List all running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Expected: 'kamiyo' container should be running
```

## Symptoms

- Stripe dashboard shows failed webhook attempts
- Subscription status not updating after payment
- Users report "Payment went through but still shows Free tier"
- Logs show: "Invalid signature" or "Webhook authentication failed"
- Stripe webhook endpoint returns 400/500 errors

## Diagnosis Steps

### Step 1: Check Stripe Webhook Status

```bash
# Check last 50 webhook logs
docker logs kamiyo --tail=50 | grep -i webhook

# Look for:
# - "stripe_signature" errors
# - "Webhook validation failed"
# - "Invalid signature"
```

### Step 2: Verify Webhook Secret

```bash
# Check if webhook secret is set
docker exec kamiyo env | grep STRIPE_WEBHOOK_SECRET

# Expected: STRIPE_WEBHOOK_SECRET=whsec_xxxxx
# If missing: See Recovery > Set Environment Variables
```

### Step 3: Test Webhook Endpoint

```bash
# Test endpoint is accessible
curl -X POST http://localhost:8000/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'

# Expected: 400 (missing signature) - means endpoint is working
# If 500/404: Service issue, see Recovery > Restart Service
```

### Step 4: Check Stripe Dashboard

1. Go to: https://dashboard.stripe.com/webhooks
2. Find webhook for your domain
3. Check recent attempts:
   - Green checkmarks = success
   - Red X = failures
4. Click failed attempt to see error message

### Step 5: Check Port Accessibility

```bash
# Test if port 8000 is reachable
netstat -tuln | grep 8000

# Expected: tcp ... 0.0.0.0:8000 ... LISTEN
```

## Recovery Steps

### Option 1: Restart Service (Most Common)

```bash
# Restart container
docker compose restart kamiyo

# Wait 30 seconds
sleep 30

# Test webhook endpoint
curl -X POST http://localhost:8000/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'

# Expected: 400 with "missing signature"
```

**Expected Result:** Webhook endpoint responds correctly

### Option 2: Update Webhook Secret

If secret is wrong or missing:

```bash
# Get webhook secret from Stripe Dashboard
# 1. Go to: https://dashboard.stripe.com/webhooks
# 2. Click on your webhook
# 3. Click "Reveal" under "Signing secret"
# 4. Copy the secret (starts with whsec_)

# Update environment variable
# Edit .env file:
echo 'STRIPE_WEBHOOK_SECRET=whsec_your_secret_here' >> .env

# Or update docker-compose.yml environment section

# Restart service
docker compose restart kamiyo

# Verify secret is set
docker exec kamiyo env | grep STRIPE_WEBHOOK_SECRET
```

### Option 3: Test with Stripe CLI

```bash
# Install Stripe CLI (if not installed)
# brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:8000/api/v1/payments/webhook

# In another terminal, trigger test event
stripe trigger payment_intent.succeeded

# Check logs
docker logs kamiyo | tail -20
```

### Option 4: Recreate Webhook in Stripe

If webhook configuration is broken:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click on existing webhook
3. Click "Delete webhook"
4. Create new webhook:
   - **URL:** `https://your-domain.com/api/v1/payments/webhook`
   - **Events to send:**
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
5. Copy new webhook secret
6. Update STRIPE_WEBHOOK_SECRET (see Option 2)
7. Restart service

### Option 5: Manual Subscription Sync

If webhooks are down and users need immediate access:

```bash
# Connect to database
docker exec kamiyo sqlite3 /app/data/kamiyo.db

# Check user subscription status
SELECT email, subscription_tier, subscription_status
FROM users
WHERE email = 'user@example.com';

# Manually update (ONLY as temporary fix)
UPDATE users
SET subscription_tier = 'pro',
    subscription_status = 'active'
WHERE email = 'user@example.com';

# Exit sqlite
.quit

# Note: This is temporary - webhook must be fixed!
```

## Verification

After recovery, verify the following:

```bash
# 1. Test webhook with Stripe CLI
stripe trigger payment_intent.succeeded

# Check logs for successful processing
docker logs kamiyo --tail=10 | grep webhook

# 2. Check Stripe Dashboard
# Go to: https://dashboard.stripe.com/webhooks
# Recent attempts should show green checkmarks

# 3. Test real flow (in test mode)
# Create test subscription in Stripe dashboard
# Verify subscription status updates in app

# 4. Check webhook endpoint health
curl -I http://localhost:8000/api/v1/payments/webhook
# Expected: 405 Method Not Allowed (POST required)
```

## Post-Incident

### Document Failed Webhooks

```bash
# Get failed webhook count from Stripe
# Go to: https://dashboard.stripe.com/webhooks
# Click your webhook > "Logs" tab
# Document:
# - How many webhooks failed?
# - Time range of failures?
# - Which event types failed?

# Export logs
docker logs kamiyo > /tmp/stripe_webhook_incident_$(date +%Y%m%d_%H%M%S).log
```

### Backfill Missing Updates

```bash
# For each affected user:
# 1. Check their Stripe subscription status
# 2. Manually trigger webhook replay in Stripe:
#    - Go to webhook logs
#    - Click failed event
#    - Click "Send test webhook"

# Or use API to sync all subscriptions:
docker exec kamiyo python -c "
from api.payments.stripe_client import sync_all_subscriptions
sync_all_subscriptions()
"
```

### Prevent Recurrence

- Set up monitoring for webhook success rate (alert if < 95%)
- Test webhooks during deployment with Stripe CLI
- Document webhook secret rotation process
- Add health check endpoint specifically for webhooks

## Escalation

If recovery steps don't work after 30 minutes:

1. **Level 2 - Senior Engineer:** Bring in Stripe integration expert
2. **Level 3 - Stripe Support:** Open support ticket at https://support.stripe.com
3. **Workaround:** Use manual subscription sync (Option 5) while fixing

### Emergency Contacts

See: `/Users/dennisgoslar/Projekter/kamiyo/website/docs/ON_CALL.md`

**Stripe Support:** https://support.stripe.com (account team available 24/7 for critical issues)

## Common Mistakes to Avoid

- **Don't** change webhook secret without restarting service
- **Don't** test webhooks in live mode during diagnosis
- **Don't** manually sync subscriptions without documenting it
- **Do** use Stripe CLI for local testing
- **Do** verify webhook signature validation is enabled
- **Do** check Stripe dashboard logs first

## Monitoring Checklist

Add these alerts if not already configured:

```yaml
# Prometheus/Grafana alerts
- alert: StripeWebhookFailureRate
  expr: webhook_failures / webhook_attempts > 0.05
  for: 5m
  annotations:
    summary: "Stripe webhooks failing at {{ $value }}% rate"

- alert: NoWebhooksReceived
  expr: increase(stripe_webhooks_received[10m]) == 0
  for: 30m
  annotations:
    summary: "No Stripe webhooks received in 30 minutes"
```

## Testing This Runbook

```bash
# Simulate webhook failure (ONLY IN DEV)
# Temporarily set wrong webhook secret
docker exec kamiyo sh -c 'export STRIPE_WEBHOOK_SECRET=whsec_wrong'

# Test with Stripe CLI
stripe trigger payment_intent.succeeded

# Should see signature validation error in logs
docker logs kamiyo --tail=5

# Follow recovery steps (Option 2)
# Verify fix with Stripe CLI
```

---

**Last Updated:** 2025-10-13
**Tested By:** DevOps Team
**Success Rate:** 90% (Option 1 or 2 works in most cases)
**Average Resolution Time:** 10 minutes
