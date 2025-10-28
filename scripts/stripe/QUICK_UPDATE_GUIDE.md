# Quick Update Guide: MCP Stripe Products

**Time Required:** 5 minutes
**Risk Level:** Low (non-destructive, fully reversible)

## TL;DR

You already have 3 Stripe products. Run this script to update them for MCP:

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```

Then copy the price IDs to your `.env` file.

---

## What This Does

### Before (Current State)
- **KAMIYO Pro:** $89/month
- **KAMIYO Team:** $199/month
- **KAMIYO Enterprise:** $499/month

### After (MCP Update)
- **KAMIYO MCP Personal:** $19/month (NEW price) + $89/month (legacy price kept)
- **KAMIYO MCP Team:** $99/month (NEW price) + $199/month (legacy price kept)
- **KAMIYO MCP Enterprise:** $299/month (NEW price) + $499/month (legacy price kept)

**Key Point:** Nothing breaks. Old prices stay active. New prices are created.

---

## Step-by-Step Instructions

### Step 1: Verify Stripe CLI

```bash
# Check if installed
stripe --version

# If not installed (macOS):
brew install stripe/stripe-cli/stripe

# Login
stripe login
```

### Step 2: Run Update Script (Test Mode)

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```

**What happens:**
1. ✅ Verifies 3 products exist
2. ✅ Updates product names to include "MCP"
3. ✅ Adds metadata (rate limits, agent counts)
4. ✅ Creates 3 new prices ($19, $99, $299)
5. ✅ Saves IDs to `stripe_mcp_product_ids.txt`

### Step 3: Update .env File

Open `stripe_mcp_product_ids.txt` and copy the price IDs to your `.env`:

```bash
# MCP Prices (new subscriptions)
STRIPE_PRICE_MCP_PERSONAL=price_xxxxx
STRIPE_PRICE_MCP_TEAM=price_xxxxx
STRIPE_PRICE_MCP_ENTERPRISE=price_xxxxx

# Legacy Prices (existing subscriptions - keep these!)
STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao
```

### Step 4: Verify in Stripe Dashboard

Go to: https://dashboard.stripe.com/test/products

You should see:
- KAMIYO MCP Personal
- KAMIYO MCP Team
- KAMIYO MCP Enterprise

Each should have 2 active prices (legacy + MCP).

### Step 5: Test Checkout

Test creating a checkout session:

```bash
curl -X POST http://localhost:8000/api/billing/create-checkout-session \
  -H 'Content-Type: application/json' \
  -d '{
    "tier": "personal",
    "user_email": "test@example.com"
  }'
```

### Step 6: Deploy to Live (When Ready)

After testing thoroughly:

```bash
bash scripts/stripe/update_existing_products.sh --live
```

Then update production `.env` with the live price IDs.

---

## Important Notes

### ✅ Safe Operations
- Updates product metadata (safe)
- Creates new prices (safe)
- Keeps legacy prices active (safe)
- Existing subscriptions unaffected (safe)

### ⚠️ Important
- **DO NOT DELETE** legacy prices
- **Keep legacy price IDs** in .env
- **Test in test mode first**
- **Grandfather existing customers** on old pricing

### 🚫 Do NOT
- Delete old price IDs from .env
- Archive legacy prices (yet)
- Change existing subscription prices
- Skip testing phase

---

## Troubleshooting

### Problem: "Product not found"

**Solution:** Product IDs in script may be wrong. Check your `stripe_product_ids.txt`:

```bash
cat stripe_product_ids.txt
```

Update the product IDs in the script if needed.

### Problem: "Not authenticated"

**Solution:**
```bash
stripe login
```

### Problem: "Price already exists"

**Solution:** Script tried to create price that already exists. This is fine - use existing price ID.

### Problem: Script fails halfway

**Solution:** Safe to re-run. Script checks what exists before creating.

---

## Rollback

If you need to undo changes:

### 1. Restore .env
```bash
# Remove MCP price IDs, use only legacy
STRIPE_PRICE_ID_PRO=price_1SMwJfCvpzIkQ1SiSh54y4Qk
STRIPE_PRICE_ID_TEAM=price_1SMwJuCvpzIkQ1SiwrcpkbVG
STRIPE_PRICE_ID_ENTERPRISE=price_1SMwJvCvpzIkQ1SiEoXhP1Ao
```

### 2. Archive new prices
Go to Stripe Dashboard → Prices → Archive the 3 new MCP prices

### 3. Revert product names (optional)
```bash
stripe products update prod_TJZSPysECoqzkS --name="KAMIYO Pro"
stripe products update prod_TJZSlMRpzjXEav --name="KAMIYO Team"
stripe products update prod_TJZS1uopwU6Lkp --name="KAMIYO Enterprise"
```

---

## What Gets Created

### New Metadata (on all 3 products)
```json
{
  "tier": "personal|team|enterprise",
  "mcp_enabled": "true",
  "max_agents": "1|5|unlimited",
  "rate_limit_rpm": "30|100|500",
  "rate_limit_daily": "1000|10000|100000",
  "legacy_tier": "pro|team|enterprise"
}
```

### New Prices
- Personal: $19/month (`price_xxx`)
- Team: $99/month (`price_xxx`)
- Enterprise: $299/month (`price_xxx`)

### Product Names Updated
- "KAMIYO Pro" → "KAMIYO MCP Personal"
- "KAMIYO Team" → "KAMIYO MCP Team"
- "KAMIYO Enterprise" → "KAMIYO MCP Enterprise"

---

## Expected Output

```
================================================================================
KAMIYO Stripe Product Update for MCP
================================================================================

This script will:
  • Check existing products and prices
  • Update product metadata for MCP tiers
  • Create new prices if needed for MCP pricing ($19, $99, $299)
  • Map existing products to MCP tiers

Mode: test

ℹ Checking prerequisites...

✓ Stripe CLI installed
✓ Stripe CLI authenticated

ℹ Updating products in TEST mode
Press Enter to continue (or Ctrl+C to cancel)...

================================================================================
Checking Existing Products
================================================================================

ℹ Verifying product: KAMIYO Pro (prod_TJZSPysECoqzkS)...
✓ Found: KAMIYO Pro
ℹ Verifying product: KAMIYO Team (prod_TJZSlMRpzjXEav)...
✓ Found: KAMIYO Team
ℹ Verifying product: KAMIYO Enterprise (prod_TJZS1uopwU6Lkp)...
✓ Found: KAMIYO Enterprise

================================================================================
Updating Products with MCP Metadata
================================================================================

ℹ Updating KAMIYO Pro → MCP Personal tier...
✓ Updated KAMIYO Pro → MCP Personal
ℹ Updating KAMIYO Team → MCP Team tier...
✓ Updated KAMIYO Team → MCP Team
ℹ Updating KAMIYO Enterprise → MCP Enterprise tier...
✓ Updated KAMIYO Enterprise → MCP Enterprise

================================================================================
Creating New MCP Prices
================================================================================

ℹ Creating MCP Personal price ($19/month)...
✓ Created MCP Personal price: price_xxxxx
ℹ Creating MCP Team price ($99/month)...
✓ Created MCP Team price: price_xxxxx
ℹ Creating MCP Enterprise price ($299/month)...
✓ Created MCP Enterprise price: price_xxxxx

================================================================================
Update Complete!
================================================================================

✓ All products updated with MCP metadata!

New MCP Price IDs (add these to your .env file):

  STRIPE_PRICE_MCP_PERSONAL=price_xxxxx
  STRIPE_PRICE_MCP_TEAM=price_xxxxx
  STRIPE_PRICE_MCP_ENTERPRISE=price_xxxxx

⚠ IMPORTANT: Legacy prices still exist and should NOT be deleted!
  • Keep legacy price IDs in .env for existing subscriptions
  • Existing customers will continue on old pricing
  • New customers will use MCP pricing
```

---

## Need Help?

### Resources
- **Full Documentation:** `/Users/dennisgoslar/Projekter/kamiyo/STRIPE_PRODUCTS_STATUS.md`
- **Script README:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/stripe/README.md`
- **Stripe Dashboard:** https://dashboard.stripe.com/test/products

### Quick Checks
```bash
# List all products
stripe products list

# List all prices
stripe prices list

# Get specific product details
stripe products retrieve prod_TJZSPysECoqzkS

# Test webhook forwarding
stripe listen --forward-to localhost:8000/api/webhooks/stripe
```

---

**Estimated Time:** 5 minutes
**Risk:** Low
**Reversible:** Yes
**Production Ready:** After testing

Ready to run? Execute:

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/stripe/update_existing_products.sh --test
```
