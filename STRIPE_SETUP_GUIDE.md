# Stripe Integration Setup & Testing Guide

## Overview

The x402 Infrastructure SaaS uses Stripe for subscription billing with three tiers:
- **Starter**: $99/month - 50,000 verifications
- **Pro**: $299/month - 500,000 verifications
- **Enterprise**: $999/month - Unlimited verifications

## Pre-Deployment Checklist

### 1. Stripe Account Setup

1. Create Stripe account at https://dashboard.stripe.com/register
2. Switch to **Test Mode** (toggle in top right)
3. Get API keys from https://dashboard.stripe.com/test/apikeys

### 2. Create Stripe Products

Run the product creation script:

```bash
# Set Stripe test key
export STRIPE_SECRET_KEY=sk_test_your_test_key_here

# Create products
node scripts/create_x402_stripe_products.mjs
```

This creates three subscription products and outputs environment variables:

```bash
# Starter Tier - $99/month
X402_STRIPE_PRICE_STARTER=price_xxxxx
X402_STRIPE_PRODUCT_STARTER=prod_xxxxx

# Pro Tier - $299/month
X402_STRIPE_PRICE_PRO=price_xxxxx
X402_STRIPE_PRODUCT_PRO=prod_xxxxx

# Enterprise Tier - $999/month
X402_STRIPE_PRICE_ENTERPRISE=price_xxxxx
X402_STRIPE_PRODUCT_ENTERPRISE=prod_xxxxx
```

### 3. Configure Environment Variables

Add these to your `.env` file AND Render dashboard:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Product Price IDs (from step 2)
X402_STRIPE_PRICE_STARTER=price_xxxxx
X402_STRIPE_PRICE_PRO=price_xxxxx
X402_STRIPE_PRICE_ENTERPRISE=price_xxxxx

# Product IDs (optional, for reference)
X402_STRIPE_PRODUCT_STARTER=prod_xxxxx
X402_STRIPE_PRODUCT_PRO=prod_xxxxx
X402_STRIPE_PRODUCT_ENTERPRISE=prod_xxxxx
```

### 4. Set Up Webhook Endpoint

#### Option A: Local Testing with Stripe CLI

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Linux: See https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/v1/x402/webhooks/stripe

# Copy the webhook signing secret (starts with whsec_)
# Add to .env as STRIPE_WEBHOOK_SECRET
```

#### Option B: Production Webhook on Render

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. URL: `https://your-app.onrender.com/api/v1/x402/webhooks/stripe`
4. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook signing secret
6. Add to Render environment variables as `STRIPE_WEBHOOK_SECRET`

## Testing Checklist

### Test 1: Product Creation

**Expected**: 3 products created in Stripe dashboard

```bash
node scripts/create_x402_stripe_products.mjs
```

Verify in Stripe Dashboard > Products:
- ✅ x402 Infrastructure Starter ($99/month)
- ✅ x402 Infrastructure Pro ($299/month)
- ✅ x402 Infrastructure Enterprise ($999/month)

### Test 2: Checkout Flow (Free → Starter)

**Expected**: User can upgrade from free to paid tier

1. Sign in to dashboard at `/dashboard/x402`
2. Click "Upgrade to Starter"
3. Redirected to Stripe Checkout
4. Use test card: `4242 4242 4242 4242`
5. Any future date, any CVC
6. Complete checkout
7. Redirected back to dashboard
8. Verify tier changed to "Starter"
9. Verify quota increased to 50,000

**Database verification**:
```sql
SELECT tier, stripeCustomerId, stripeSubscriptionId, monthlyVerificationLimit
FROM X402Tenant
WHERE email = 'test@example.com';
```

### Test 3: Webhook Handling (Subscription Created)

**Expected**: Subscription data saved to database

1. Complete checkout (Test 2)
2. Check webhook logs in Stripe Dashboard > Webhooks
3. Verify events received:
   - `checkout.session.completed`
   - `customer.subscription.created`
4. Check database for subscription ID

**Test webhook locally**:
```bash
# Terminal 1: Start app
npm run dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:3000/api/v1/x402/webhooks/stripe

# Terminal 3: Trigger test event
stripe trigger checkout.session.completed
```

### Test 4: Billing Portal Access

**Expected**: User can manage subscription

1. Sign in to dashboard (paid tier)
2. Click "Open Billing Portal"
3. Redirected to Stripe Customer Portal
4. Verify can:
   - Update payment method
   - View invoices
   - Cancel subscription

### Test 5: Subscription Upgrade (Starter → Pro)

**Expected**: User can upgrade mid-cycle with prorated billing

1. Start with Starter subscription
2. Click "Upgrade to Pro"
3. Complete checkout
4. Verify:
   - New price: $299/month
   - Quota updated to 500,000
   - Old subscription cancelled
   - New subscription active

**Database verification**:
```sql
SELECT tier, stripeSubscriptionId, monthlyVerificationLimit
FROM X402Tenant
WHERE email = 'test@example.com';
```

### Test 6: Subscription Downgrade (Pro → Starter)

**Expected**: Downgrade applied at end of billing period

1. Start with Pro subscription
2. Use Billing Portal to change plan to Starter
3. Verify:
   - Tier remains "Pro" until period ends
   - Scheduled downgrade shown in portal
   - After period ends: tier = Starter, quota = 50,000

### Test 7: Subscription Cancellation

**Expected**: Access continues until period end, then reverts to free

1. Start with any paid subscription
2. Use Billing Portal to cancel subscription
3. Verify:
   - Subscription active until period end
   - After period ends: tier = free, quota = 1,000
   - `stripeSubscriptionId` = null

### Test 8: Failed Payment

**Expected**: Subscription enters past_due state, retries payment

1. Update payment method to failing card: `4000 0000 0000 0341`
2. Wait for next billing cycle
3. Verify webhook: `invoice.payment_failed`
4. Check database: subscription status = past_due
5. User should receive email notification (if configured)

### Test 9: Payment Recovery

**Expected**: Subscription reactivates after successful payment

1. Start with failed payment (Test 8)
2. Update to valid card in Billing Portal
3. Stripe retries payment
4. Webhook: `invoice.payment_succeeded`
5. Subscription status = active

### Test 10: Webhook Signature Verification

**Expected**: Invalid signatures rejected

```bash
# Test with invalid signature
curl -X POST https://your-app.onrender.com/api/v1/x402/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: invalid" \
  -d '{"type": "test"}'

# Expected: 400 Bad Request
```

## Test Credit Cards

Use these Stripe test cards: https://stripe.com/docs/testing

**Success**:
- `4242 4242 4242 4242` - Visa
- `5555 5555 5555 4444` - Mastercard

**Payment failures**:
- `4000 0000 0000 0002` - Card declined
- `4000 0000 0000 0341` - Attaching fails
- `4000 0000 0000 9995` - Insufficient funds

**3D Secure**:
- `4000 0025 0000 3155` - Requires 3DS

All cards:
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

## Monitoring & Debugging

### View Webhook Logs

```bash
# Stripe Dashboard
https://dashboard.stripe.com/test/webhooks/we_xxxxx

# Application logs
# Check Render logs or local console for webhook processing
```

### Check Database State

```sql
-- View tenant subscription status
SELECT
  email,
  tier,
  stripeCustomerId,
  stripeSubscriptionId,
  monthlyVerificationLimit,
  monthlyVerificationsUsed
FROM X402Tenant
WHERE tier != 'free';

-- View billing events
SELECT *
FROM X402BillingEvent
ORDER BY createdAt DESC
LIMIT 10;
```

### Common Issues

**Issue**: Webhook signature verification fails

**Solution**:
1. Verify `STRIPE_WEBHOOK_SECRET` matches webhook endpoint secret
2. Check webhook URL matches exactly (no trailing slash)
3. Ensure raw body parsing disabled (`bodyParser: false`)

**Issue**: Subscription created but tier not updated

**Solution**:
1. Check webhook logs for errors
2. Verify `BillingService.handleWebhookEvent()` processed event
3. Check database transaction didn't roll back

**Issue**: Checkout redirects but no subscription

**Solution**:
1. Check Stripe Dashboard > Payments for payment status
2. Verify webhook endpoint receiving events
3. Check for errors in webhook processing logs

## Production Deployment

### Pre-Flight Checklist

- [ ] All test scenarios pass
- [ ] Webhook endpoint configured in Stripe
- [ ] `STRIPE_WEBHOOK_SECRET` set in production
- [ ] Test mode keys replaced with live keys
- [ ] Products created in live mode
- [ ] Email notifications configured (optional)
- [ ] Error monitoring active (Sentry)

### Go-Live Steps

1. Create products in **live mode**:
   ```bash
   export STRIPE_SECRET_KEY=sk_live_your_live_key
   node scripts/create_x402_stripe_products.mjs
   ```

2. Update production environment variables:
   - Switch from `sk_test_` to `sk_live_`
   - Switch from `pk_test_` to `pk_live_`
   - Update price IDs to live mode prices

3. Configure live webhook:
   - URL: `https://kamiyo.ai/api/v1/x402/webhooks/stripe`
   - Copy new webhook secret to production env

4. Test with real card (use your own or $1 starter plan)

5. Monitor first 24 hours:
   - Check Stripe Dashboard for successful payments
   - Monitor webhook delivery success rate
   - Review error logs

## Rollback Procedure

If Stripe integration fails in production:

1. Disable upgrade UI temporarily:
   ```javascript
   // pages/dashboard/x402.js
   const STRIPE_ENABLED = false;
   ```

2. Process pending subscriptions manually:
   - Check Stripe Dashboard for successful payments
   - Update database manually if needed

3. Fix issue and redeploy

4. Re-enable upgrade UI

## Support Resources

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs
- Stripe API Reference: https://stripe.com/docs/api
- Stripe Webhook Testing: https://stripe.com/docs/webhooks/test
- Stripe CLI: https://stripe.com/docs/stripe-cli

## Next Steps

After successful Stripe integration:

1. ✅ Test all scenarios above
2. ✅ Set up monitoring (Task 4)
3. ✅ Deploy to production (Task 5)
4. → Configure customer email notifications
5. → Set up quota warning emails
6. → Enable SCA/3DS for European customers
7. → Configure tax collection (if applicable)

---

**Last Updated**: November 9, 2025
**Status**: Ready for testing
