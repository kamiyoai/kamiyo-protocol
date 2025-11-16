# KAMIYO Stripe Setup Guide

## Overview

This guide walks you through setting up Stripe products, subscriptions, and webhooks for the KAMIYO platform.

---

## Prerequisites

### 1. Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Other platforms: https://stripe.com/docs/stripe-cli
```

### 2. Authenticate

```bash
stripe login
```

This will open your browser to authenticate with your Stripe account.

### 3. Verify Authentication

```bash
stripe config --list
```

You should see your account details and API keys.

---

## Creating KAMIYO as a Subsidiary

**Note:** Stripe doesn't support creating business profiles via CLI. You must do this in the Dashboard.

### Steps:

1. Go to: https://dashboard.stripe.com/settings/business
2. Look for "Business profiles" section
3. Click "Add business profile" or "Create new profile"
4. Fill in details:
   - **Business name:** KAMIYO
   - **Business type:** Technology / SaaS
   - **Website:** https://kamiyo.ai
   - **Description:** Blockchain exploit intelligence API with x402 payment facilitator
   - **Support email:** support@kamiyo.ai
5. Save the profile

**Benefit:** This creates a separate business entity in Stripe, allowing:
- Separate branding for KAMIYO products
- Distinct customer portal appearance
- Isolated reporting and analytics
- Different tax/compliance settings if needed

---

## Automated Setup Script

### Run the Setup Script

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
./scripts/setup_stripe_products.sh
```

### What It Creates:

1. **3 Products:**
   - KAMIYO Pro ($89/month)
   - KAMIYO Team ($199/month)
   - KAMIYO Enterprise ($499/month)

2. **3 Recurring Prices:**
   - Monthly billing for each tier
   - USD currency
   - Proper metadata for tier identification

3. **Product Metadata:**
   - Tier name (pro/team/enterprise)
   - Daily API limits
   - Rate limits per minute
   - Feature flags
   - Webhook limits

### Script Output:

The script generates `stripe_product_ids.txt` with:
```bash
STRIPE_PRICE_ID_PRO=price_xxxxxxxxxxxxx
STRIPE_PRICE_ID_TEAM=price_xxxxxxxxxxxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxxxxxxxxxx
```

**Copy these to your `.env` file!**

---

## Manual Webhook Setup

**Why Manual?** Stripe CLI can create webhooks, but Dashboard provides better configuration options.

### Steps:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Configure:
   - **Endpoint URL:** `https://api.kamiyo.ai/api/v1/webhooks/stripe`
   - **Description:** KAMIYO Payment Events
   - **API Version:** Latest (or match your STRIPE_API_VERSION)
4. Select events to listen for:
   ```
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   customer.subscription.trial_will_end
   invoice.payment_succeeded
   invoice.payment_failed
   invoice.payment_action_required
   payment_intent.succeeded
   payment_intent.payment_failed
   payment_method.attached
   payment_method.detached
   ```
5. Click "Add endpoint"
6. Copy the **Webhook signing secret** (starts with `whsec_`)
7. Add to `.env`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### Testing Webhooks Locally:

```bash
# Forward webhook events to local development server
stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

---

## Customer Portal Setup

The Customer Portal allows users to self-service their subscriptions.

### Steps:

1. Go to: https://dashboard.stripe.com/settings/billing/portal
2. Click "Activate customer portal"
3. Configure branding:
   - **Business name:** KAMIYO
   - **Support email:** support@kamiyo.ai
   - **Brand color:** #6366f1 (Indigo)
   - **Logo:** Upload KAMIYO logo (PNG, 512x512px recommended)
4. Enable customer actions:
   - ✅ View invoices and payment history
   - ✅ Update payment method
   - ✅ Cancel subscription
   - ✅ Update subscription (allow tier upgrades/downgrades)
5. Configure cancellation policy:
   - Allow immediate cancellation
   - OR Cancel at period end (recommended for KAMIYO)
6. Save configuration
7. Copy the portal URL (format: `https://billing.stripe.com/p/login/test_xxxxx`)
8. Add to `.env`:
   ```bash
   STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_xxxxx
   ```

---

## Product Configuration Best Practices

### Metadata Usage

Each product has metadata for backend logic:

```json
{
  "tier": "pro",                    // Tier identifier
  "daily_limit": "50000",           // API calls per day
  "rate_limit_per_min": "35",       // Requests per minute
  "webhook_limit": "2",             // Max webhooks (Team+)
  "features": "real_time,webhooks"  // Comma-separated features
}
```

### Pricing Strategy

**Current Setup:**
- Pro: $89/month (50K calls/day = $0.0018 per call)
- Team: $199/month (100K calls/day = $0.0020 per call)
- Enterprise: $499/month (unlimited calls)

**Compared to x402:**
- x402: $0.001 per call (pay-as-you-go)
- Break-even for Pro: ~50,000 calls/month
- Break-even for Team: ~100,000 calls/month

**Strategy:** x402 for occasional users, subscriptions for heavy users.

---

## Testing Subscription Flow

### Test Card Numbers

```
Success: 4242 4242 4242 4242 (any future exp, any CVC)
Decline: 4000 0000 0000 0002
Insufficient Funds: 4000 0000 0000 9995
Requires Auth: 4000 0027 6000 3184
```

### End-to-End Test:

1. **Sign up for account:**
   ```
   curl -X POST https://api.kamiyo.ai/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}'
   ```

2. **Create subscription:**
   ```
   curl -X POST https://api.kamiyo.ai/api/v1/subscriptions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"price_id":"price_xxxxx","payment_method":"pm_card_visa"}'
   ```

3. **Verify subscription:**
   ```
   curl https://api.kamiyo.ai/api/v1/subscriptions/me \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

4. **Check Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com/subscriptions
   - Verify subscription appears with correct tier

5. **Test webhook delivery:**
   - Check logs: https://dashboard.stripe.com/webhooks
   - Verify `subscription.created` event delivered

---

## Troubleshooting

### Issue: "Authentication required"

**Solution:** Run `stripe login` and authenticate.

### Issue: "Invalid API key"

**Solution:**
1. Check your Stripe account
2. Verify you're in test mode (or live mode if intended)
3. Run: `stripe config --list`

### Issue: Products created in wrong account

**Solution:**
1. Delete products: `stripe products delete prod_xxxxx`
2. Switch account: `stripe login --project-name=correct-account`
3. Re-run setup script

### Issue: Webhook not receiving events

**Solution:**
1. Check webhook URL is publicly accessible
2. Verify HTTPS (Stripe requires HTTPS in production)
3. Check webhook signing secret matches `.env`
4. Review webhook logs in Dashboard

### Issue: Customer Portal not loading

**Solution:**
1. Verify portal is activated in Dashboard
2. Check portal URL in `.env` is correct
3. Ensure portal configured for correct mode (test/live)

---

## Security Checklist

- [ ] Webhook signing secret configured
- [ ] API keys stored in `.env` (not committed to git)
- [ ] Test mode keys used for development
- [ ] Live mode keys used only in production
- [ ] Customer Portal requires authentication
- [ ] Webhook endpoint validates signatures
- [ ] Rate limiting enabled on API
- [ ] PCI compliance logging configured

---

## Environment Variables Summary

After setup, your `.env` should have:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_API_VERSION=2023-10-16

# Stripe Webhook
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Price IDs (from setup script)
STRIPE_PRICE_ID_PRO=price_xxxxxxxxxxxxx
STRIPE_PRICE_ID_TEAM=price_xxxxxxxxxxxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxxxxxxxxxx

# Stripe Customer Portal
STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_xxxxx
```

---

## Next Steps

1. ✅ Run `./scripts/setup_stripe_products.sh`
2. ✅ Copy price IDs to `.env`
3. ✅ Create webhook endpoint
4. ✅ Configure Customer Portal
5. ✅ Test subscription flow with test card
6. ✅ Verify webhook delivery
7. ✅ Update frontend with correct price IDs
8. 🚀 Deploy to production

---

## Resources

- **Stripe Dashboard:** https://dashboard.stripe.com
- **Stripe CLI Docs:** https://stripe.com/docs/stripe-cli
- **Stripe API Docs:** https://stripe.com/docs/api
- **Webhook Guide:** https://stripe.com/docs/webhooks
- **Customer Portal:** https://stripe.com/docs/billing/subscriptions/integrating-customer-portal
- **Testing:** https://stripe.com/docs/testing

---

**Questions?** Contact support@kamiyo.ai or check the API documentation.
