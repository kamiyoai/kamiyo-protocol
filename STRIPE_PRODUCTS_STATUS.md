# KAMIYO Stripe Products Status Report

**Generated:** October 28, 2025
**Status:** Existing Products Found - Update Script Created
**Mode:** Test Mode

## Executive Summary

KAMIYO already has 3 active Stripe products in test mode. Rather than creating duplicates, I've created a script to **update existing products** with MCP tier specifications.

### Current Status

- ✅ **3 Active Products Found**
- ✅ **3 Active Prices Found**
- ✅ **Update Script Created**
- ⚠️ **Action Required:** Run update script to enable MCP tiers

---

## Existing Products Overview

### Product 1: KAMIYO Pro
- **Product ID:** `prod_TJZSPysECoqzkS`
- **Current Price:** $89/month (`price_1SMwJfCvpzIkQ1SiSh54y4Qk`)
- **Current Metadata:**
  - `tier: "pro"`
  - `daily_limit: "50000"`
- **Target:** → MCP Personal ($19/month)

### Product 2: KAMIYO Team
- **Product ID:** `prod_TJZSlMRpzjXEav`
- **Current Price:** $199/month (`price_1SMwJuCvpzIkQ1SiwrcpkbVG`)
- **Current Metadata:**
  - `tier: "team"`
  - `daily_limit: "100000"`
  - `webhook_limit: "5"`
- **Target:** → MCP Team ($99/month)

### Product 3: KAMIYO Enterprise
- **Product ID:** `prod_TJZS1uopwU6Lkp`
- **Current Price:** $499/month (`price_1SMwJvCvpzIkQ1SiEoXhP1Ao`)
- **Current Metadata:**
  - `tier: "enterprise"`
  - `daily_limit: "unlimited"`
  - `webhook_limit: "50"`
- **Target:** → MCP Enterprise ($299/month)

---

## Other Products in Account

The following additional products exist in your Stripe account (may be old/test products):

1. **Kamiyo Team** (`prod_TEKUNgUOHQ1ylE`) - Old duplicate?
2. **Ephemeral** (`prod_RrK38TPIpBBEnU`) - Test product?
3. **Test subscription** (`prod_RpzA3X9uYFnJDE`) - Test product
4. **Creator Subscription** (`prod_RpcxQ3RrycQfgd`) - Old tier?
5. **Architect Subscription** (`prod_RpcuRuIe99EP1k`) - Old tier?
6. **Guide Subscription** (`prod_RpckVIHsMkCitC`) - Old tier?
7. **Summon a Kami** (`prod_Rou17ETXtid1qo`) - Inactive
8. **myproduct** (`prod_Roi8Uxn0mIhg3z`, `prod_Roi6wp9eJCJn1e`) - Test products

**Recommendation:** Archive or delete old/test products to clean up your Stripe Dashboard.

---

## MCP Tier Specifications

The update script will configure products to match these MCP requirements:

### MCP Personal - $19/month
- **Max Agents:** 1
- **Rate Limit:** 30 requests/min
- **Daily Limit:** 1,000 requests/day
- **Features:** MCP integration via Claude Desktop

### MCP Team - $99/month
- **Max Agents:** 5
- **Rate Limit:** 100 requests/min
- **Daily Limit:** 10,000 requests/day
- **Features:** Webhooks, team workspace, priority support

### MCP Enterprise - $299/month
- **Max Agents:** Unlimited
- **Rate Limit:** 500 requests/min
- **Daily Limit:** 100,000 requests/day
- **Features:** 99.9% SLA, dedicated support, custom integrations

---

## What the Update Script Does

The script (`/Users/dennisgoslar/Projekter/kamiyo/scripts/stripe/update_existing_products.sh`) will:

### 1. Update Product Metadata
- Add MCP-specific metadata (`mcp_enabled: true`)
- Add rate limiting metadata (`max_agents`, `rate_limit_rpm`, `rate_limit_daily`)
- Add legacy tier tracking (`legacy_tier`)
- Rename products to include "MCP" in the name

### 2. Create New MCP Prices
- **Personal:** $19/month (new price for MCP)
- **Team:** $99/month (new price for MCP)
- **Enterprise:** $299/month (new price for MCP)

### 3. Preserve Legacy Prices
- **IMPORTANT:** Existing prices will NOT be deleted
- Current subscriptions will continue on legacy pricing
- New subscriptions will use MCP pricing

### 4. Save Configuration
- Outputs all price IDs to `stripe_mcp_product_ids.txt`
- Includes both MCP and legacy price IDs
- Ready to copy into `.env` file

---

## Running the Update Script

### Prerequisites

1. Stripe CLI installed and authenticated:
   ```bash
   stripe login
   ```

2. Verify you're in test mode:
   ```bash
   stripe config --list
   ```

### Execute the Script

**Test Mode (Recommended First):**
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```

**Live Mode (After Testing):**
```bash
bash scripts/stripe/update_existing_products.sh --live
```

### Expected Output

The script will:
1. ✅ Verify all 3 products exist
2. ✅ Update product names and metadata
3. ✅ Create 3 new price points
4. ✅ Save all IDs to `stripe_mcp_product_ids.txt`
5. ✅ Display configuration for `.env` file

---

## Migration Strategy

### Immediate Actions (Test Mode)

1. **Run the update script:**
   ```bash
   bash scripts/stripe/update_existing_products.sh --test
   ```

2. **Update `.env` file:**
   ```env
   # MCP Prices (new subscriptions)
   STRIPE_PRICE_MCP_PERSONAL=price_xxx
   STRIPE_PRICE_MCP_TEAM=price_xxx
   STRIPE_PRICE_MCP_ENTERPRISE=price_xxx

   # Legacy Prices (existing subscriptions - DO NOT DELETE)
   STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk
   STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG
   STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao
   ```

3. **Update backend billing logic:**
   - New checkouts: Use `STRIPE_PRICE_MCP_*` variables
   - Existing subscriptions: Continue using legacy price IDs
   - Read tier limits from `product.metadata`

4. **Test thoroughly:**
   - Create test checkout sessions for each tier
   - Verify metadata is correctly applied
   - Test webhook handling

### Production Deployment

1. **Backup database** (contains subscription records)

2. **Run in live mode:**
   ```bash
   bash scripts/stripe/update_existing_products.sh --live
   ```

3. **Update production `.env`** with new price IDs

4. **Deploy backend changes** (billing logic updates)

5. **Update frontend pricing page** (new pricing, MCP features)

6. **Monitor for 48 hours:**
   - Check Stripe Dashboard for new subscriptions
   - Verify existing subscriptions still work
   - Monitor webhook delivery success rate

### Handling Existing Customers

**Option A: Grandfather Existing Customers (Recommended)**
- Keep them on current pricing ($89, $199, $499)
- No code changes needed
- Existing subscriptions continue to work
- New customers get MCP pricing ($19, $99, $299)

**Option B: Migrate All Customers**
- Requires subscription price updates via Stripe API
- Risk of billing issues
- Customer communication required
- NOT RECOMMENDED without careful planning

**Recommendation:** Use Option A. Grandfather existing customers on legacy pricing.

---

## Environment Configuration

After running the script, update your `.env` file:

```bash
# ============================================================================
# STRIPE CONFIGURATION
# ============================================================================

# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ============================================================================
# MCP SUBSCRIPTION PRICES (New Subscriptions)
# ============================================================================

STRIPE_PRICE_MCP_PERSONAL=price_xxxxx  # $19/month - will be generated by script
STRIPE_PRICE_MCP_TEAM=price_xxxxx      # $99/month - will be generated by script
STRIPE_PRICE_MCP_ENTERPRISE=price_xxxxx # $299/month - will be generated by script

# ============================================================================
# LEGACY PRICES (Existing Subscriptions - DO NOT DELETE)
# ============================================================================

STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk         # $89/month
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG       # $199/month
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao # $499/month

# ============================================================================
# PRODUCT IDS (For Reference)
# ============================================================================

PRODUCT_MCP_PERSONAL=prod_TJZSPysECoqzkS      # Formerly "KAMIYO Pro"
PRODUCT_MCP_TEAM=prod_TJZSlMRpzjXEav          # Formerly "KAMIYO Team"
PRODUCT_MCP_ENTERPRISE=prod_TJZS1uopwU6Lkp    # Formerly "KAMIYO Enterprise"
```

---

## Backend Integration

### Reading Tier Metadata

After the update, read subscription tier limits from Stripe metadata:

```python
# Example: Get subscription tier limits
subscription = stripe.Subscription.retrieve(subscription_id)
product = stripe.Product.retrieve(subscription.plan.product)

# Read MCP metadata
tier = product.metadata.get('tier')  # "personal", "team", or "enterprise"
max_agents = product.metadata.get('max_agents')  # "1", "5", or "unlimited"
rate_limit_rpm = int(product.metadata.get('rate_limit_rpm'))  # 30, 100, or 500
rate_limit_daily = int(product.metadata.get('rate_limit_daily'))  # 1000, 10000, or 100000
mcp_enabled = product.metadata.get('mcp_enabled') == 'true'

# Apply rate limits
if tier == 'personal':
    # Enforce 1 agent, 30 req/min, 1000 req/day
    pass
elif tier == 'team':
    # Enforce 5 agents, 100 req/min, 10000 req/day
    pass
elif tier == 'enterprise':
    # Enforce unlimited agents, 500 req/min, 100000 req/day
    pass
```

### Creating Checkout Sessions

```python
# Use MCP prices for new subscriptions
tier_to_price_id = {
    'personal': os.getenv('STRIPE_PRICE_MCP_PERSONAL'),
    'team': os.getenv('STRIPE_PRICE_MCP_TEAM'),
    'enterprise': os.getenv('STRIPE_PRICE_MCP_ENTERPRISE'),
}

checkout_session = stripe.checkout.Session.create(
    mode='subscription',
    line_items=[{
        'price': tier_to_price_id[tier],
        'quantity': 1,
    }],
    success_url='https://your-site.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url='https://your-site.com/pricing',
    customer_email=user_email,
)
```

---

## Verification Checklist

After running the update script, verify:

### Stripe Dashboard Checks

- [ ] Go to [Products](https://dashboard.stripe.com/test/products)
- [ ] Verify 3 products are named "KAMIYO MCP Personal/Team/Enterprise"
- [ ] Click each product and check metadata includes:
  - `mcp_enabled: true`
  - `tier: personal/team/enterprise`
  - `max_agents`, `rate_limit_rpm`, `rate_limit_daily`
- [ ] Verify each product has 2 prices:
  - Legacy price (active, higher cost)
  - MCP price (active, lower cost)

### Configuration Checks

- [ ] `stripe_mcp_product_ids.txt` file created
- [ ] Contains both MCP and legacy price IDs
- [ ] `.env` file updated with new price IDs
- [ ] Backend code reads from new environment variables

### Functional Testing

- [ ] Create test checkout for Personal tier
- [ ] Create test checkout for Team tier
- [ ] Create test checkout for Enterprise tier
- [ ] Complete test payment with card `4242 4242 4242 4242`
- [ ] Verify webhook receives `checkout.session.completed`
- [ ] Verify subscription metadata in webhook payload

---

## Rollback Plan

If you need to rollback after running the script:

### 1. Restore Legacy Price IDs in .env
```bash
# Remove MCP price IDs, keep only legacy
STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao
```

### 2. Archive New MCP Prices in Stripe Dashboard
- Go to: https://dashboard.stripe.com/test/prices
- Find the new MCP prices (created by script)
- Click "Archive" on each

### 3. Revert Product Names (Optional)
```bash
stripe products update prod_TJZSPysECoqzkS --name="KAMIYO Pro"
stripe products update prod_TJZSlMRpzjXEav --name="KAMIYO Team"
stripe products update prod_TJZS1uopwU6Lkp --name="KAMIYO Enterprise"
```

### 4. Deploy Previous Backend Code

---

## Cost Impact Analysis

### Current Pricing (Legacy)
- **Pro:** $89/month → 50K API calls/day
- **Team:** $199/month → 100K API calls/day
- **Enterprise:** $499/month → Unlimited

### New MCP Pricing
- **Personal:** $19/month → 1K requests/day (lower volume, much lower price)
- **Team:** $99/month → 10K requests/day (lower volume, lower price)
- **Enterprise:** $299/month → 100K requests/day (high volume, lower price)

### Revenue Impact
- ⚠️ **Significant price reduction** across all tiers
- Legacy customers remain on higher pricing (good for revenue)
- New customers get lower pricing (good for acquisition)
- MCP positions KAMIYO as agent-focused (strategic)

### Recommendations
1. **Grandfather legacy customers** (maintain revenue)
2. **Market MCP tiers to new customers** (drive adoption)
3. **Monitor customer churn** (legacy customers may downgrade)
4. **Consider volume-based pricing** for enterprise (protect high usage revenue)

---

## Cleanup Recommendations

### Old Products to Archive

The following products appear to be old/test and can be archived:

1. **Kamiyo Team** (`prod_TEKUNgUOHQ1ylE`) - Duplicate of main Team product
2. **Ephemeral** (`prod_RrK38TPIpBBEnU`) - Test product
3. **Test subscription** (`prod_RpzA3X9uYFnJDE`) - Test product
4. **Creator Subscription** (`prod_RpcxQ3RrycQfgd`) - Old naming scheme
5. **Architect Subscription** (`prod_RpcuRuIe99EP1k`) - Old naming scheme
6. **Guide Subscription** (`prod_RpckVIHsMkCitC`) - Old naming scheme
7. **Summon a Kami** (`prod_Rou17ETXtid1qo`) - Already inactive
8. **myproduct** (x2) - Test products from CLI

### How to Archive

```bash
# Check if product has active subscriptions first
stripe subscriptions list --price=price_xxx --limit=1

# If no active subscriptions, archive the product
stripe products update prod_xxx --active=false
```

Or via Dashboard:
1. Go to https://dashboard.stripe.com/test/products
2. Click on product
3. Click "Archive"

---

## Support Resources

### Documentation
- **Stripe Products API:** https://stripe.com/docs/api/products
- **Stripe Prices API:** https://stripe.com/docs/api/prices
- **Stripe Subscriptions:** https://stripe.com/docs/billing/subscriptions/overview
- **MCP Specification:** (Add your MCP docs link)

### Stripe Dashboard Links
- **Test Products:** https://dashboard.stripe.com/test/products
- **Test Prices:** https://dashboard.stripe.com/test/prices
- **Test Subscriptions:** https://dashboard.stripe.com/test/subscriptions
- **Webhooks:** https://dashboard.stripe.com/test/webhooks

### Scripts Created
- **Update Script:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/stripe/update_existing_products.sh`
- **Create Script:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/stripe/create_mcp_products.sh`

---

## Next Steps

### Immediate (Today)
1. ✅ Review this status report
2. ⏭️ Run update script in test mode: `bash scripts/stripe/update_existing_products.sh --test`
3. ⏭️ Update `.env` with new MCP price IDs
4. ⏭️ Test checkout flow for all 3 tiers

### Short Term (This Week)
1. ⏭️ Update backend billing logic to use MCP prices
2. ⏭️ Update frontend pricing page with MCP tiers
3. ⏭️ Test webhook handling with new metadata
4. ⏭️ Archive old/test products to clean up Stripe Dashboard

### Production (When Ready)
1. ⏭️ Run update script in live mode: `bash scripts/stripe/update_existing_products.sh --live`
2. ⏭️ Deploy backend changes to production
3. ⏭️ Update production `.env`
4. ⏭️ Monitor for 48 hours

---

## Questions?

**Q: Will this break existing subscriptions?**
A: No. Legacy prices remain active, existing subscriptions continue unchanged.

**Q: Can I undo this?**
A: Yes. See "Rollback Plan" section above.

**Q: Should I delete old prices?**
A: NO. Keep legacy prices active for existing subscriptions. You can archive them later.

**Q: What if a customer wants to switch from legacy to MCP pricing?**
A: You'll need to update their subscription via Stripe API or Dashboard to use the new price ID.

**Q: When should I archive legacy prices?**
A: Only after ALL customers have migrated off them (could be months/years).

---

**Status:** Ready to execute update script
**Risk Level:** Low (no breaking changes, fully reversible)
**Recommended Action:** Run in test mode first, verify thoroughly, then deploy to live

---

*Generated by Claude Code Agent - October 28, 2025*
