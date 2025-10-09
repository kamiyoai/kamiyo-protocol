# Webhook Integration Guide

Quick reference for integrating Day 8 webhook handlers into the main API.

---

## 1. Run Database Migration

```bash
# Connect to PostgreSQL
psql postgresql://kamiyo:password@localhost:5432/kamiyo_prod

# Run migration
\i ~/project/Projekter/exploit-intel-platform/database/migrations/004_webhook_tables.sql

# Verify tables created
\dt webhook*

# Check views
\dv webhook*
```

---

## 2. Update Main API (api/main.py)

Add webhook routes to your FastAPI application:

```python
# Import webhook router
from api.webhooks.routes import router as webhook_router

# Include in app
app.include_router(webhook_router)
```

Full example:

```python
from fastapi import FastAPI
from api.webhooks.routes import router as webhook_router

app = FastAPI(title="Kamiyo API")

# Include webhook routes
app.include_router(webhook_router)

# Your other routes...
```

---

## 3. Environment Variables

Add to your `.env` file:

```bash
# Stripe Webhook Secret (CRITICAL!)
# Get this from Stripe Dashboard or Stripe CLI
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin API Key (for webhook management endpoints)
ADMIN_API_KEY=your_secure_admin_key_here

# Already set from Day 6
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...
```

---

## 4. Configure Stripe Dashboard

### For Production:
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter URL: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
4. Select events to send (or send all)
5. Copy the webhook signing secret
6. Set `STRIPE_WEBHOOK_SECRET` environment variable

### For Development/Testing:
Use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe

# Copy the webhook secret from output (whsec_...)
# Set STRIPE_WEBHOOK_SECRET in your .env file
```

---

## 5. Test the Integration

### Quick Health Check:
```bash
curl http://localhost:8000/api/v1/webhooks/health
```

Expected response:
```json
{
  "status": "healthy",
  "webhook_system": "operational",
  "events_last_24h": 0,
  "failed_events_last_24h": 0,
  "supported_event_types": 10
}
```

### Run Full Test Suite:
```bash
./scripts/test_webhooks.sh
```

### Trigger Test Event:
```bash
# With Stripe CLI running
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

---

## 6. Monitor Webhook Processing

### Check Statistics:
```bash
curl -H "X-Admin-Key: your_key" \
  http://localhost:8000/api/v1/webhooks/statistics
```

### List Failed Events:
```bash
curl -H "X-Admin-Key: your_key" \
  http://localhost:8000/api/v1/webhooks/events/failed/list
```

### View Database Stats:
```sql
-- Overall statistics
SELECT * FROM webhook_statistics;

-- Health check
SELECT * FROM webhook_health_check;

-- Recent events
SELECT event_id, event_type, status, created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

---

## 7. Common Issues & Solutions

### Issue: "Missing Stripe signature header"
**Solution**: Make sure Stripe CLI is forwarding to the correct endpoint, or check Stripe Dashboard webhook configuration.

### Issue: "Invalid signature"
**Solution**: Verify `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard/CLI.

### Issue: "Event already processed"
**Solution**: This is expected behavior (idempotency). The duplicate event is safely ignored.

### Issue: High failure rate
**Solution**: Check `webhook_failures` table for error messages:
```sql
SELECT event_id, error_message, retry_count
FROM webhook_failures
WHERE retry_count < 5
ORDER BY created_at DESC;
```

---

## 8. Production Checklist

- [ ] Database migration run successfully
- [ ] `STRIPE_WEBHOOK_SECRET` set correctly
- [ ] Webhook endpoint added in Stripe Dashboard
- [ ] Webhook endpoint is HTTPS (not HTTP)
- [ ] Health check returns "healthy"
- [ ] Test events processed successfully
- [ ] Prometheus metrics available at `/metrics`
- [ ] Alerts configured (Discord/Slack)
- [ ] Admin API key secured
- [ ] Logs monitored for errors

---

## 9. Supported Event Types

The webhook handler supports these Stripe events:

**Customer Events:**
- `customer.created`
- `customer.updated`
- `customer.deleted`

**Subscription Events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**Payment Events:**
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Payment Method Events:**
- `payment_method.attached`
- `payment_method.detached`

Check supported events:
```bash
curl http://localhost:8000/api/v1/webhooks/supported-events
```

---

## 10. Monitoring & Alerts

Webhook processing metrics are available in Prometheus:

```promql
# Total webhook events
webhook_events_total

# Processing duration
webhook_processing_duration_seconds

# Failed events
webhook_events_total{status="failed"}

# Success rate
sum(webhook_events_total{status="processed"}) / sum(webhook_events_total)
```

---

**Next Steps**: Day 9 - Customer Portal & Billing Dashboard

For more details, see `DAY_8_SUMMARY.md`
