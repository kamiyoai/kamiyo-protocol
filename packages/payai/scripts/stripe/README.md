# KAMIYO MCP Stripe Products Setup

This directory contains scripts for creating and managing Stripe products and prices for KAMIYO MCP (Model Context Protocol) subscriptions.

## Quick Start: Update Existing Products

**If you already have Stripe products (KAMIYO Pro, Team, Enterprise), use this script to update them for MCP:**

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```

This will:
- Update product names and metadata for MCP
- Create new MCP prices ($19, $99, $299)
- Keep legacy prices active for existing subscriptions
- Save all price IDs to `stripe_mcp_product_ids.txt`

**See:** [QUICK_UPDATE_GUIDE.md](./QUICK_UPDATE_GUIDE.md) for detailed instructions.

## Overview

KAMIYO offers three MCP subscription tiers that enable AI agents (like Claude) to access security exploit intelligence:

- **Personal** ($19/month): 1 AI agent, 30 requests/min, 1,000 requests/day
- **Team** ($99/month): 5 AI agents, 100 requests/min, 10,000 requests/day, webhooks, priority support
- **Enterprise** ($299/month): Unlimited agents, 500 requests/min, 100,000 requests/day, 99.9% SLA, dedicated support

## Prerequisites

### 1. Install Stripe CLI

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# Debian/Ubuntu
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe

# Other Linux distributions
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_amd64.tar.gz
tar -xvf stripe_linux_amd64.tar.gz
sudo mv stripe /usr/local/bin/
```

**Windows:**
```powershell
# Using Scoop
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Or download from https://github.com/stripe/stripe-cli/releases
```

**Verify installation:**
```bash
stripe --version
```

### 2. Authenticate with Stripe

```bash
stripe login
```

This will open your browser to authorize the CLI with your Stripe account. Choose the correct account if you have multiple.

### 3. Verify Authentication

```bash
stripe config --list
```

You should see your account details and API keys.

### 4. Optional: Install jq for Better JSON Parsing

**macOS:**
```bash
brew install jq
```

**Linux:**
```bash
sudo apt-get install jq  # Debian/Ubuntu
sudo yum install jq      # CentOS/RHEL
```

## Available Scripts

### 1. Update Existing Products (Recommended if you have products)

```bash
bash scripts/stripe/update_existing_products.sh --test
```

**Use this if:**
- You already have KAMIYO products in Stripe
- You want to update them for MCP without creating duplicates
- You want to keep existing subscriptions working

**See:** [QUICK_UPDATE_GUIDE.md](./QUICK_UPDATE_GUIDE.md)

### 2. Create New Products (Only if starting fresh)

```bash
bash scripts/stripe/create_mcp_products.sh --test
```

**Use this if:**
- You're starting from scratch (no existing products)
- You want to create completely new products

## Usage

### Basic Usage (Test Mode)

Update existing products in Stripe test mode (recommended):

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```

Or create new products from scratch:

```bash
bash scripts/stripe/create_mcp_products.sh --test
```

### Live Mode (Production)

**⚠️ WARNING:** This creates products in your live Stripe account and may affect production billing.

```bash
bash scripts/stripe/create_mcp_products.sh --live
```

You will be prompted to confirm before proceeding.

### Force Recreate Products

If products already exist and you want to recreate them:

```bash
bash scripts/stripe/create_mcp_products.sh --force
```

This will use existing products if found, or create new ones if they don't exist.

### Help

```bash
bash scripts/stripe/create_mcp_products.sh --help
```

## Output

The script will create:

1. **Three Stripe Products:**
   - KAMIYO MCP Personal
   - KAMIYO MCP Team
   - KAMIYO MCP Enterprise

2. **Three Monthly Recurring Prices:**
   - $19/month for Personal
   - $99/month for Team
   - $299/month for Enterprise

3. **Output File:**
   - `stripe_mcp_product_ids.txt` - Contains all product and price IDs

### Example Output

```
STRIPE_PRICE_MCP_PERSONAL=price_1ABC123...
STRIPE_PRICE_MCP_TEAM=price_1DEF456...
STRIPE_PRICE_MCP_ENTERPRISE=price_1GHI789...
```

## Configuration

### Step 1: Update .env File

After running the script, copy the price IDs to your `.env` file:

```bash
# Copy from stripe_mcp_product_ids.txt
STRIPE_PRICE_MCP_PERSONAL=price_1ABC123...
STRIPE_PRICE_MCP_TEAM=price_1DEF456...
STRIPE_PRICE_MCP_ENTERPRISE=price_1GHI789...
```

### Step 2: Verify Products in Stripe Dashboard

**Test Mode:**
- https://dashboard.stripe.com/test/products

**Live Mode:**
- https://dashboard.stripe.com/products

You should see three products:
- KAMIYO MCP Personal ($19/month)
- KAMIYO MCP Team ($99/month)
- KAMIYO MCP Enterprise ($299/month)

### Step 3: Configure Webhooks

#### For Development (Test Mode)

Use Stripe CLI to forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:8000/api/webhooks/stripe
```

Copy the webhook signing secret from the output:

```
> Ready! Your webhook signing secret is whsec_1234567890abcdef...
```

Add to your `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef...
```

#### For Production (Live Mode)

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://api.kamiyo.ai/api/webhooks/stripe`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the webhook signing secret
7. Add to your `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_live_1234567890abcdef...
```

## Testing

### Test Checkout Session Creation

```bash
curl -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H 'Content-Type: application/json' \
  -d '{
    "tier": "personal",
    "user_email": "test@example.com",
    "success_url": "http://localhost:3000/dashboard/success?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "http://localhost:3000/pricing"
  }'
```

Expected response:

```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "session_id": "cs_test_..."
}
```

### Test with Stripe Test Cards

When checking out in test mode, use these test cards:

**Successful payment:**
```
Card number: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

**Require authentication (3D Secure):**
```
Card number: 4000 0025 0000 3155
```

**Declined payment:**
```
Card number: 4000 0000 0000 0002
```

More test cards: https://stripe.com/docs/testing

### Verify Webhook Delivery

In test mode with `stripe listen` running:

1. Complete a test checkout
2. Check the terminal running `stripe listen`
3. You should see webhook events being forwarded
4. Check your API logs for webhook processing

In live mode:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click on your webhook endpoint
3. View the "Recent events" tab
4. Check for successful deliveries (200 status)

## Product Metadata

Each product includes metadata that your backend can use for authorization and rate limiting:

### Personal Tier
```json
{
  "tier": "personal",
  "max_agents": "1",
  "rate_limit_rpm": "30",
  "rate_limit_daily": "1000"
}
```

### Team Tier
```json
{
  "tier": "team",
  "max_agents": "5",
  "rate_limit_rpm": "100",
  "rate_limit_daily": "10000"
}
```

### Enterprise Tier
```json
{
  "tier": "enterprise",
  "max_agents": "unlimited",
  "rate_limit_rpm": "500",
  "rate_limit_daily": "100000"
}
```

## Troubleshooting

### Problem: "Stripe CLI not found"

**Solution:**
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux - see Prerequisites section above
```

### Problem: "Not authenticated to Stripe"

**Solution:**
```bash
stripe login
```

Follow the browser prompts to authenticate.

### Problem: "Products already exist"

**Solution 1:** Use existing products
- Go to https://dashboard.stripe.com/products
- Find the existing products
- Click on each to view the price IDs
- Manually add to your `.env` file

**Solution 2:** Use --force flag
```bash
bash scripts/stripe/create_mcp_products.sh --force
```

**Solution 3:** Archive old products
- Go to https://dashboard.stripe.com/products
- Click on the existing products
- Click "Archive" to remove them
- Run the script again

### Problem: "Wrong Stripe account"

**Solution:**
```bash
# Check current account
stripe config --list

# Login to different account
stripe login
```

### Problem: "Webhook events not received"

**Test Mode:**
- Ensure `stripe listen` is running
- Check that the forward-to URL is correct
- Verify your API server is running on the correct port

**Live Mode:**
- Check webhook endpoint URL is correct and accessible
- Verify webhook signing secret in `.env`
- Check Stripe Dashboard webhook logs for errors
- Ensure your server's firewall allows Stripe IPs

### Problem: "Price IDs not showing in output"

**Solution:**
- Install `jq` for better JSON parsing (see Prerequisites)
- Check Stripe CLI version: `stripe --version`
- Update Stripe CLI: `brew upgrade stripe/stripe-cli/stripe`

### Problem: "Can't create checkout session"

**Checklist:**
- ✅ Price IDs added to `.env`
- ✅ STRIPE_SECRET_KEY set in `.env`
- ✅ Backend server restarted after `.env` changes
- ✅ Using correct tier name (`personal`, `team`, or `enterprise`)
- ✅ Price IDs match the mode (test vs live)

## Best Practices

### Development Workflow

1. **Always start with test mode:**
   ```bash
   bash scripts/stripe/create_mcp_products.sh --test
   ```

2. **Test thoroughly before going live:**
   - Test all three tier checkouts
   - Test subscription webhooks
   - Test cancellation flows
   - Test payment failures

3. **Keep test and live configurations separate:**
   ```bash
   # .env.development
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_MCP_PERSONAL=price_test_...

   # .env.production
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_MCP_PERSONAL=price_live_...
   ```

### Production Deployment

1. **Create live products:**
   ```bash
   bash scripts/stripe/create_mcp_products.sh --live
   ```

2. **Update production .env:**
   - Add live price IDs
   - Add live webhook secret
   - Verify all Stripe keys are live mode

3. **Test on staging first:**
   - Deploy to staging environment
   - Test with live mode test cards
   - Verify webhook delivery

4. **Monitor after deployment:**
   - Stripe Dashboard: https://dashboard.stripe.com
   - Watch for failed payments
   - Monitor webhook success rate
   - Check error logs

### Security

- ✅ Never commit `.env` files to version control
- ✅ Use different API keys for test and live
- ✅ Rotate webhook secrets periodically
- ✅ Restrict API key permissions in Stripe Dashboard
- ✅ Enable webhook signature verification
- ✅ Use HTTPS for all production webhooks

## Maintenance

### Updating Prices

To change subscription prices:

1. **Don't modify existing prices** (Stripe best practice)
2. **Create new prices:**
   ```bash
   stripe prices create \
     --product=prod_xxx \
     --unit-amount=2900 \
     --currency=usd \
     --recurring[interval]=month
   ```
3. **Update `.env` with new price IDs**
4. **Archive old prices in Stripe Dashboard**

### Adding New Tiers

To add a new subscription tier:

1. Create the product manually or modify the script
2. Create a recurring price
3. Add the price ID to `.env`
4. Update backend checkout logic
5. Update frontend pricing page

### Monitoring

Regularly check:

- **Subscription health:** https://dashboard.stripe.com/subscriptions
- **Failed payments:** https://dashboard.stripe.com/payments?status=failed
- **Webhook logs:** https://dashboard.stripe.com/webhooks
- **Customer portal:** https://dashboard.stripe.com/settings/billing/portal

## Related Documentation

- **Stripe Checkout Implementation Plan:** `/STRIPE_CHECKOUT_IMPLEMENTATION_PLAN.md`
- **Stripe API Documentation:** https://stripe.com/docs/api
- **Stripe CLI Documentation:** https://stripe.com/docs/stripe-cli
- **MCP Documentation:** `/docs/mcp/`

## Support

For issues or questions:

1. Check this README first
2. Review Stripe documentation: https://stripe.com/docs
3. Check Stripe Dashboard logs: https://dashboard.stripe.com
4. Contact KAMIYO support: support@kamiyo.ai

## License

Copyright © 2025 KAMIYO. All rights reserved.
