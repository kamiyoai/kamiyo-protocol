# Stripe LIVE Mode Price IDs

**Created:** 2025-10-29
**Status:** Ready to deploy to Render.com

---

## ✅ Products Created in Stripe LIVE Mode

All three subscription products have been successfully created in your Stripe account's LIVE mode:

| Tier | Price | Price ID |
|------|-------|----------|
| **Personal** | $19/month | `price_1SNWHLCvpzIkQ1Si1WWLL2il` |
| **Team** | $99/month | `price_1SNWICCvpzIkQ1SiqNV6f5t5` |
| **Enterprise** | $299/month | `price_1SNWIqCvpzIkQ1SiAgaho08G` |

---

## 🔧 Update Render.com Environment Variables

1. Go to your **Next.js frontend service** on Render.com
2. Navigate to **Environment** tab
3. **Update** these three variables:

```bash
STRIPE_PRICE_MCP_PERSONAL=price_1SNWHLCvpzIkQ1Si1WWLL2il
STRIPE_PRICE_MCP_TEAM=price_1SNWICCvpzIkQ1SiqNV6f5t5
STRIPE_PRICE_MCP_ENTERPRISE=price_1SNWIqCvpzIkQ1SiAgaho08G
```

4. **Save** - Render.com will auto-redeploy (or click Manual Deploy)
5. Wait 2-5 minutes for deployment to complete

---

## ✅ Verification

After Render.com redeploys, run this command to verify:

```bash
/tmp/verify_billing.sh
```

**Expected output:**
```
✅ SUCCESS: All environment variables are loaded!

STRIPE_PRICE_MCP_PERSONAL:    true
STRIPE_PRICE_MCP_TEAM:        true
STRIPE_PRICE_MCP_ENTERPRISE:  true
```

---

## 🎉 Final Test

1. Visit https://kamiyo.ai/pricing
2. Click "Subscribe - $19/mo" on Personal tier
3. **Expected:** Redirect to Stripe checkout page (LIVE mode)
4. Complete test purchase to verify end-to-end flow

---

## 📝 Notes

- **Old Test Mode IDs** (replaced):
  - `price_1SNKvLCvpzIkQ1SiPz4PV1F3`
  - `price_1SNKvYCvpzIkQ1SivEyVtu2z`
  - `price_1SNKvbCvpzIkQ1Siq0A9D7Ry`

- **Stripe Keys** (already configured in Render.com):
  - STRIPE_SECRET_KEY=sk_live_... ✓
  - STRIPE_PUBLISHABLE_KEY=pk_live_... ✓

- **Local .env updated** to use LIVE keys (test keys commented out)

---

## 🔍 Troubleshooting

If billing still returns errors after updating:

1. **Check deployment completed:**
   ```bash
   curl -s https://kamiyo.ai/ | grep -o '_app-[a-f0-9]*\.js' | head -1
   ```
   Build hash should change after redeployment.

2. **Verify environment variables loaded:**
   ```bash
   /tmp/verify_billing.sh
   ```
   All three should show `true`.

3. **Check Stripe Dashboard:**
   - Go to https://dashboard.stripe.com/products
   - Switch to LIVE mode
   - Verify the three products exist

---

**Status:** Ready to deploy to production 🚀
