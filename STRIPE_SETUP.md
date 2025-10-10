# Stripe Setup - Live Mode

## Live API Keys Configured

✅ **Stripe Secret Key**: `sk_live_51Qpc4LCvpzIkQ1Si...` (configured)
✅ **Stripe Publishable Key**: `pk_live_51Qpc4LCvpzIkQ1Si...` (configured)
✅ **Webhook Secret**: `whsec_15jUGk5mIEV2TdG7DTT5HkC1qsNFOIsf` (configured)
✅ **Webhook Endpoint**: `https://kamiyo.ai/api/payment/webhook` (configured)

## Next Steps Required

### 1. Configure Webhook Endpoint

You need to set up a webhook endpoint in the Stripe Dashboard to receive payment events:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Set the endpoint URL to: `https://your-domain.com/api/payment/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook signing secret (starts with `whsec_`)
6. Update `.env` with:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### 2. Test Payment Flow

Before going live, test the payment flow:

1. Create a test product in Stripe Dashboard
2. Test checkout flow on `/pricing` page
3. Verify webhook events are received correctly
4. Confirm subscription status updates in database

### 3. Security Checklist

- ✅ Live API keys are configured (not test keys)
- ✅ Webhook secret configured
- ✅ Webhook endpoint configured: `https://kamiyo.ai/api/payment/webhook`
- ✅ Keys are stored in `.env` (not committed to git)
- ✅ `.env` is in `.gitignore`

## Important Notes

- **Live Mode**: These are LIVE keys that will process real payments
- **Security**: Never commit `.env` to version control
- **Webhook Secret**: Required for secure webhook verification
- **Testing**: Use Stripe test mode for development testing

