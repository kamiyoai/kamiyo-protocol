# Stripe Webhook Configuration Complete

**Date**: 2025-10-27
**Status**: ✅ CONFIGURED

---

## Configuration Summary

### Webhook Endpoint
- **URL**: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
- **Destination ID**: `we_1QuuybCvpzIkQ1Siz1v5qH5i`
- **API Version**: `2025-01-27.acacia`
- **Signing Secret**: `whsec_15jUGk5mIEV2TdG7DTT5HkC1qsNFOIsf` ✅

### Monitored Events (7 Selected)

#### Checkout Events
- ✅ `checkout.session.completed` - Occurs when a Checkout Session has been successfully completed

#### Customer Events
- ✅ `customer.subscription.created` - Occurs whenever a customer is signed up for a new plan
- ✅ `customer.subscription.deleted` - Occurs whenever a customer's subscription ends
- ✅ `customer.subscription.updated` - Occurs whenever a subscription changes (e.g., switching plans, status changes from trial to active)

#### Invoice Events
- ✅ `invoice.payment_failed` - Occurs whenever an invoice payment attempt fails (declined payment or no stored payment method)
- ✅ `invoice.payment_succeeded` - Occurs whenever an invoice payment attempt succeeds
- ✅ `invoice.marked_uncollectible` - Occurs whenever an invoice is marked uncollectible

---

## Environment Variables Updated

The following variables have been configured in `.env`:

```bash
# Stripe webhook configuration
STRIPE_WEBHOOK_SECRET=whsec_15jUGk5mIEV2TdG7DTT5HkC1qsNFOIsf
STRIPE_WEBHOOK_ENDPOINT=https://api.kamiyo.ai/api/v1/webhooks/stripe

# Stripe product price IDs (created 2025-10-27)
STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk      # $89/month
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG     # $199/month
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao  # $499/month
```

---

## API Endpoint Details

### Main Webhook Endpoint
**POST** `/api/v1/webhooks/stripe`
- Rate limit: 10 requests/second
- Automatically verifies webhook signature
- Stores events for idempotent processing
- Routes to appropriate event processors
- Returns 200 OK on success

### Health Check
**GET** `/api/v1/webhooks/health`
- Returns webhook system health status
- Shows 24-hour event statistics
- Monitors failure rates

### Admin Endpoints (Require X-Admin-Key header)
- **GET** `/api/v1/webhooks/events/{event_id}` - Get event details
- **POST** `/api/v1/webhooks/events/{event_id}/retry` - Retry failed event
- **GET** `/api/v1/webhooks/events/failed/list` - List failed events
- **GET** `/api/v1/webhooks/statistics` - Get processing statistics
- **POST** `/api/v1/webhooks/cleanup` - Clean up old events

---

## Webhook Processing Flow

1. **Stripe sends webhook** → `https://api.kamiyo.ai/api/v1/webhooks/stripe`

2. **Signature verification** → Uses `STRIPE_WEBHOOK_SECRET` to verify authenticity

3. **Event storage** → Stores event in database for idempotent processing

4. **Event routing** → Routes to specific processor based on event type:
   - `checkout.session.completed` → Creates/activates subscription
   - `customer.subscription.created` → Records new subscription
   - `customer.subscription.updated` → Updates subscription status/plan
   - `customer.subscription.deleted` → Cancels subscription, revokes access
   - `invoice.payment_succeeded` → Records successful payment
   - `invoice.payment_failed` → Handles failed payment (retry logic, notifications)
   - `invoice.marked_uncollectible` → Handles uncollectible invoices

5. **Response** → Returns 200 OK to Stripe (prevents retries)

---

## Event Processors

Each webhook event type is handled by a dedicated processor in `/api/webhooks/processors.py`:

### Subscription Created
- Creates subscription record in database
- Activates user's plan features
- Sends welcome email
- Records in analytics

### Subscription Updated
- Detects plan changes (upgrade/downgrade)
- Updates feature access
- Records change in audit log
- Sends notification email

### Subscription Deleted
- Revokes API access
- Disables premium features
- Sends cancellation confirmation
- Marks subscription as cancelled

### Payment Succeeded
- Records successful payment
- Extends subscription period
- Sends receipt email
- Updates payment history

### Payment Failed
- Logs failed payment attempt
- Sends payment failure notification
- Triggers retry logic (if configured)
- Updates subscription status if needed

### Checkout Completed
- Converts checkout session to active subscription
- Provisions user account with purchased plan
- Sends onboarding email
- Records conversion in analytics

---

## Testing the Webhook

### Test Event from Stripe Dashboard
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click on destination `we_1QuuybCvpzIkQ1Siz1v5qH5i`
3. Click "Send test webhook"
4. Select event type (e.g., `customer.subscription.created`)
5. Click "Send test webhook"
6. Verify 200 OK response

### Test with Stripe CLI
```bash
# Forward webhooks to local development
stripe listen --forward-to https://api.kamiyo.ai/api/v1/webhooks/stripe

# Trigger test event
stripe trigger customer.subscription.created
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

### Verify Event Processing
```bash
# Check webhook logs
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://api.kamiyo.ai/api/v1/webhooks/statistics

# View specific event
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://api.kamiyo.ai/api/v1/webhooks/events/evt_XXXXX

# List failed events
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://api.kamiyo.ai/api/v1/webhooks/events/failed/list
```

---

## Security Features

### Signature Verification
- **CRITICAL**: All webhook events are verified using Stripe's webhook signature
- Uses `STRIPE_WEBHOOK_SECRET` to verify authenticity
- Rejects events with invalid signatures (prevents replay attacks)
- Implementation in `/api/webhooks/stripe_handler.py`

### Idempotent Processing
- Each event is stored with unique `event_id` from Stripe
- Duplicate events are automatically detected and ignored
- Prevents double-processing if Stripe retries webhook

### Rate Limiting
- Main webhook endpoint limited to 10 requests/second
- Prevents abuse and DoS attacks
- Configurable per-endpoint

### Admin Authentication
- Admin endpoints require `X-Admin-Key` header
- Key validated against `ADMIN_API_KEY` environment variable
- Only authorized users can view event details and statistics

---

## Monitoring & Observability

### Prometheus Metrics
- `api_requests_total{endpoint="/webhooks/stripe"}` - Total webhook requests
- `api_requests_in_progress{endpoint="/webhooks/stripe"}` - Active webhooks being processed
- Event-specific metrics in webhook processors

### Health Checks
- `/api/v1/webhooks/health` endpoint monitors system health
- Tracks 24-hour event statistics
- Calculates failure rates
- Returns `degraded` if failure rate > 10%
- Returns `unhealthy` if failure rate > 20%

### Event Store
- All webhook events stored in database
- Includes: event_id, type, status, created_at, processed_at, error_message
- Enables debugging and audit trail
- Automatic cleanup of old events (30+ days)

---

## Retry Logic

### Failed Events
- Failed events are automatically marked as `failed` in database
- Error message and stack trace stored for debugging
- Admin can manually retry failed events:
  ```bash
  curl -X POST \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    https://api.kamiyo.ai/api/v1/webhooks/events/evt_XXXXX/retry
  ```

### Stripe Retries
- Stripe automatically retries failed webhooks (with exponential backoff)
- First retry: 5 minutes
- Second retry: 30 minutes
- Third retry: 2 hours
- Continues for up to 3 days
- Our idempotent processing prevents double-processing on retries

---

## Still Needed

### Production Configuration
- [ ] Add actual Stripe API keys to `.env` (currently using placeholders):
  - `STRIPE_SECRET_KEY` - Get from https://dashboard.stripe.com/test/apikeys
  - `STRIPE_PUBLISHABLE_KEY` - Get from https://dashboard.stripe.com/test/apikeys
- [ ] Switch to live mode keys before production deployment
- [ ] Configure Customer Portal in Stripe Dashboard
- [ ] Test full subscription flow end-to-end

### Optional Enhancements
- [ ] Set up Slack/Discord notifications for failed webhooks
- [ ] Configure email notifications for critical events
- [ ] Set up Grafana dashboard for webhook metrics
- [ ] Enable automatic retry for specific event types

---

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook endpoint is accessible from public internet
2. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
3. Check server logs for signature verification errors
4. Ensure API server is running and healthy

### Signature Verification Failing
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Check Stripe API version matches (2025-01-27.acacia)
3. Ensure raw request body is used for signature verification
4. Check system clock is synchronized (signature includes timestamp)

### Events Stuck in Pending
1. Check application logs for errors
2. Verify database connectivity
3. Check event processor code for exceptions
4. Manually retry event from admin API

### High Failure Rate
1. Check `/api/v1/webhooks/statistics` for patterns
2. Review failed events: `/api/v1/webhooks/events/failed/list`
3. Check application logs for stack traces
4. Verify database and external service connectivity

---

## Next Steps

1. **Add Stripe API Keys** - Update `.env` with real Stripe keys from dashboard
2. **Test Webhook Flow** - Create test subscription and verify events are processed
3. **Configure Customer Portal** - Allow customers to manage subscriptions
4. **Production Testing** - Test complete subscription lifecycle
5. **Monitoring Setup** - Configure alerts for webhook failures
6. **Documentation** - Update API docs with webhook integration guide

---

## Files Modified

### Configuration
- `.env` - Added webhook secret and endpoint URL

### Code (Already Implemented)
- `api/webhooks/routes.py` - Webhook API endpoints
- `api/webhooks/stripe_handler.py` - Event verification and routing
- `api/webhooks/processors.py` - Event-specific processors
- `api/webhooks/event_store.py` - Event persistence and retry
- `api/main.py` - Webhook router registration

---

**Status**: ✅ **WEBHOOK CONFIGURED AND READY**

The Stripe webhook system is now fully configured and ready to receive events. Once you add your Stripe API keys, the system will automatically process subscription events and manage user access.

Test the webhook by sending a test event from the Stripe Dashboard!

---

*Generated: 2025-10-27*
*Webhook Secret: whsec_15jUGk5mIEV2TdG7DTT5HkC1qsNFOIsf*
*Destination ID: we_1QuuybCvpzIkQ1Siz1v5qH5i*
