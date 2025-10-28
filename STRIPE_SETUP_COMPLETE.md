# ✅ Stripe Setup Complete!

## Products & Prices Created

All KAMIYO subscription products have been successfully created in your Stripe account.

### Created Products

| Tier | Product ID | Price ID | Monthly Cost |
|------|------------|----------|--------------|
| **Pro** | `prod_TJZSPysECoqzkS` | `price_1SMwJfCvpzIkQ1SiSh54y4Qk` | $89/month |
| **Team** | `prod_TJZSlMRpzjXEav` | `price_1SMwJuCvpzIkQ1SiwrcpkbVG` | $199/month |
| **Enterprise** | `prod_TJZS1uopwU6Lkp` | `price_1SMwJvCvpzIkQ1SiEoXhP1Ao` | $499/month |

---

## Step 1: Update Your .env File

Add these price IDs to your `.env` file:

```bash
# Stripe Price IDs
STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao
```

---

## Step 2: Set Up Webhook Endpoint

Stripe needs to send events to your API for subscription updates.

### Instructions:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. Configure:
   - **Endpoint URL:** `https://api.kamiyo.ai/api/v1/webhooks/stripe`
   - **Description:** KAMIYO Payment Events
   - **API Version:** Latest (or `2023-10-16`)
4. Select these events:
   ```
   ✅ customer.subscription.created
   ✅ customer.subscription.updated
   ✅ customer.subscription.deleted
   ✅ customer.subscription.trial_will_end
   ✅ invoice.payment_succeeded
   ✅ invoice.payment_failed
   ✅ invoice.payment_action_required
   ✅ payment_intent.succeeded
   ✅ payment_intent.payment_failed
   ```
5. Click **"Add endpoint"**
6. Copy the **Webhook signing secret** (starts with `whsec_`)
7. Add to `.env`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### Test Webhooks Locally:

```bash
# Forward webhooks to localhost
stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe

# In another terminal, trigger test events
stripe trigger customer.subscription.created
```

---

## Step 3: Configure Customer Portal

The Customer Portal allows users to manage their subscriptions themselves.

### Instructions:

1. Go to: https://dashboard.stripe.com/settings/billing/portal
2. Click **"Activate customer portal"** (if not already activated)
3. Configure branding:
   - **Business name:** KAMIYO
   - **Support email:** support@kamiyo.ai
   - **Brand color:** `#6366f1` (Indigo)
   - **Logo:** Upload KAMIYO logo (512x512px PNG recommended)
4. Enable customer actions:
   - ✅ View invoices and payment history
   - ✅ Update payment method
   - ✅ Cancel subscription
   - ✅ Update subscription (allow upgrades/downgrades)
5. Cancellation policy:
   - ✅ **Cancel at period end** (recommended)
   - ⚪ Cancel immediately
6. Click **"Save"**
7. Copy the portal URL (format: `https://billing.stripe.com/p/login/test_xxxxx`)
8. Add to `.env`:
   ```bash
   STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_xxxxx
   ```

---

## Step 4: Test the Subscription Flow

### Test Cards:

```
✅ Success: 4242 4242 4242 4242
❌ Decline: 4000 0000 0000 0002
💳 Requires Auth: 4000 0027 6000 3184
```

### Test Workflow:

1. Go to your pricing page
2. Click "Subscribe" on Pro tier
3. Enter test card: `4242 4242 4242 4242`
4. Any future expiration date
5. Any 3-digit CVC
6. Verify subscription created in Dashboard

### Verify in Stripe Dashboard:

- **Products:** https://dashboard.stripe.com/products
- **Subscriptions:** https://dashboard.stripe.com/subscriptions
- **Webhooks:** https://dashboard.stripe.com/webhooks (check event logs)

---

## Step 5: Update Frontend (Optional)

Your frontend may need the price IDs for the pricing page buttons.

**File:** `pages/pricing.js` or similar

Update the price IDs in your subscription forms to match the ones above.

---

## Troubleshooting

### Issue: Webhook not receiving events

**Solution:**
1. Verify endpoint URL is correct and publicly accessible
2. Check webhook signing secret matches `.env`
3. Review webhook logs: https://dashboard.stripe.com/webhooks
4. Ensure HTTPS (Stripe requires HTTPS in production)

### Issue: Customer Portal not loading

**Solution:**
1. Verify portal is activated in Dashboard
2. Check portal URL in `.env` is correct
3. Ensure portal configured for correct mode (test/live)

### Issue: Subscription not created

**Solution:**
1. Check API logs for errors
2. Verify Stripe secret key is correct
3. Check price IDs match what's in `.env`
4. Review Stripe Dashboard error logs

---

## Security Checklist

Before going live:

- [ ] Webhook signing secret configured
- [ ] Test mode keys in development
- [ ] Live mode keys ONLY in production
- [ ] API keys not committed to git
- [ ] Customer Portal requires authentication
- [ ] Rate limiting enabled
- [ ] PCI compliance logging configured
- [ ] Subscription webhooks tested

---

## View Your Products in Stripe Dashboard

- **All Products:** https://dashboard.stripe.com/products
- **KAMIYO Pro:** https://dashboard.stripe.com/products/prod_TJZSPysECoqzkS
- **KAMIYO Team:** https://dashboard.stripe.com/products/prod_TJZSlMRpzjXEav
- **KAMIYO Enterprise:** https://dashboard.stripe.com/products/prod_TJZS1uopwU6Lkp

---

## Summary

✅ **3 products created**
✅ **3 monthly prices created**
✅ **IDs saved to `stripe_product_ids.txt`**

**Next:** Copy price IDs to `.env`, set up webhooks, configure Customer Portal, then test!

---

**Questions?** Check the [Stripe documentation](https://stripe.com/docs) or contact support@kamiyo.ai
