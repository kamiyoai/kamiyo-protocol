# KAMIYO Checkout - Quick Start Guide

**Purpose:** Get the checkout system running in 5 minutes
**Audience:** Developers
**Last Updated:** 2025-10-28

---

## ⚡ TL;DR

```bash
# 1. Fix dependency
pip install 'pydantic[email]'

# 2. Configure Stripe
cp .env.example .env
# Edit .env and add your Stripe credentials

# 3. Test
./scripts/test_checkout_flow.sh

# 4. Run
uvicorn api.main:app --reload --port 8000  # Terminal 1
npm run dev                                 # Terminal 2

# 5. Test checkout
# Visit: http://localhost:3000/pricing
# Click: "Subscribe - $19/mo"
```

---

## 📋 Prerequisites

- [x] Python 3.8+
- [x] Node.js 14+
- [x] Stripe account (test mode)
- [x] `pip` and `npm` installed

---

## 🚀 Setup (5 Minutes)

### Step 1: Install Dependencies (1 min)

```bash
# Python
pip install 'pydantic[email]' stripe fastapi

# Node.js (if needed)
npm install
```

### Step 2: Configure Stripe (2 min)

1. **Get Stripe Test Keys**
   - Go to: https://dashboard.stripe.com/test/apikeys
   - Copy: Secret key (`sk_test_...`)

2. **Create Products**
   - Go to: https://dashboard.stripe.com/test/products
   - Create three products:
     - **KAMIYO MCP Personal** - $19/month
     - **KAMIYO MCP Team** - $99/month
     - **KAMIYO MCP Enterprise** - $299/month
   - Copy price IDs (`price_...`)

3. **Update .env**
   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
   STRIPE_PRICE_MCP_PERSONAL=price_YOUR_PERSONAL_PRICE_ID
   STRIPE_PRICE_MCP_TEAM=price_YOUR_TEAM_PRICE_ID
   STRIPE_PRICE_MCP_ENTERPRISE=price_YOUR_ENTERPRISE_PRICE_ID
   ```

### Step 3: Test (1 min)

```bash
./scripts/test_checkout_flow.sh
```

Expected output:
```
✓ 32/33 tests passed
⚠ 0 warnings
✗ 0 failures (after fixing email-validator)
```

### Step 4: Start Servers (1 min)

```bash
# Terminal 1: Backend
uvicorn api.main:app --reload --port 8000

# Terminal 2: Frontend
npm run dev
```

Verify:
- Backend: http://localhost:8000/api/billing/checkout-health
- Frontend: http://localhost:3000/pricing

---

## 🧪 Quick Test

### Test Checkout Flow (2 minutes)

1. **Open pricing page**
   ```
   http://localhost:3000/pricing
   ```

2. **Click "Subscribe - $19/mo"**
   - Should redirect to Stripe Checkout

3. **Complete checkout (test mode)**
   - Email: `test@example.com`
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`

4. **Verify success page**
   - Should redirect to: `/dashboard/success?session_id=cs_test_...`
   - Should show: "Subscription Successful!"
   - Should display: Customer email and tier

### Test Other Tiers

- **Team ($99):** Same flow, different price
- **Enterprise ($299):** Should redirect to `/inquiries`
- **x402 API:** Should redirect to `/api-docs`

---

## 🔧 Troubleshooting

### Issue: "email-validator not installed"

**Solution:**
```bash
pip install 'pydantic[email]'
```

### Issue: "Payment system not configured"

**Solution:** Check `.env` file has:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MCP_PERSONAL=price_...
STRIPE_PRICE_MCP_TEAM=price_...
STRIPE_PRICE_MCP_ENTERPRISE=price_...
```

### Issue: CORS error in browser

**Solution:** Ensure `api/main.py` has:
```python
ALLOWED_ORIGINS.extend(["http://localhost:3000"])
```

### Issue: Success page shows "Error Loading Order"

**Possible causes:**
1. Backend not running → Start backend
2. Invalid session ID → Use test card to complete checkout
3. API endpoint wrong → Check `/api/billing/checkout-session/`

**Debug:**
```bash
# Check backend is running
curl http://localhost:8000/api/billing/checkout-health

# Check session endpoint (replace SESSION_ID)
curl http://localhost:8000/api/billing/checkout-session/SESSION_ID
```

### Issue: Button stuck on "Processing..."

**Solution:**
1. Open browser DevTools → Console
2. Look for JavaScript errors
3. Check Network tab for failed requests

Common cause: API endpoint unreachable

---

## 📚 Documentation

- **Production Checklist:** `CHECKOUT_PRODUCTION_READINESS.md`
- **Manual Testing:** `FRONTEND_CHECKOUT_TESTING.md`
- **Test Results:** `CHECKOUT_TEST_RESULTS.md`
- **Auto-fix Script:** `scripts/fix_checkout_issues.sh`

---

## 🎯 What's Implemented

### Backend ✅
- [x] POST `/api/billing/create-checkout-session`
- [x] GET `/api/billing/checkout-session/{session_id}`
- [x] GET `/api/billing/checkout-health`
- [x] Request validation (Pydantic)
- [x] Error handling
- [x] Stripe integration
- [x] Environment configuration
- [x] Security (no hardcoded secrets)

### Frontend ✅
- [x] Pricing page with three tiers
- [x] PricingCard component
- [x] Stripe checkout integration
- [x] Success page with order details
- [x] Error handling
- [x] Loading states
- [x] Responsive design
- [x] SEO optimization

### Testing ✅
- [x] Automated test script
- [x] Manual testing guide
- [x] Production readiness checklist
- [x] Fix automation script

---

## 🚀 Deploy to Production

### Before Deployment

1. **Switch to Live Keys**
   ```bash
   # .env (production)
   STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY
   STRIPE_PRICE_MCP_PERSONAL=price_LIVE_PERSONAL_ID
   STRIPE_PRICE_MCP_TEAM=price_LIVE_TEAM_ID
   STRIPE_PRICE_MCP_ENTERPRISE=price_LIVE_ENTERPRISE_ID
   ```

2. **Set Up Webhook**
   - Go to: https://dashboard.stripe.com/webhooks
   - Add endpoint: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy webhook secret to `.env`:
     ```bash
     STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
     ```

3. **Complete Checklist**
   - [ ] All tests pass
   - [ ] Manual testing complete
   - [ ] Security audit done
   - [ ] Documentation updated

### Deployment

```bash
# Backend
git push production main

# Frontend
npm run build
npm start
```

### Post-Deployment

1. **Smoke Test**
   - Visit: https://kamiyo.ai/pricing
   - Test checkout (small amount)
   - Verify email delivery

2. **Monitor**
   - Check logs for errors
   - Verify webhook delivery in Stripe Dashboard
   - Monitor Sentry/error tracking

---

## 📞 Support

- **Issues:** Create ticket with `[CHECKOUT]` prefix
- **Urgent:** Contact on-call engineer
- **Stripe:** https://support.stripe.com

---

## ✅ Success Criteria

You know it's working when:

1. ✅ All tests pass (`./scripts/test_checkout_flow.sh`)
2. ✅ Can complete checkout with test card
3. ✅ Success page shows order details
4. ✅ Webhook receives events (check Stripe Dashboard)
5. ✅ MCP token email sent (if webhook handler configured)

---

## 🎉 You're Done!

The checkout system is now running. For production deployment, follow the full checklist in `CHECKOUT_PRODUCTION_READINESS.md`.

**Questions?** Check the troubleshooting section above or read the comprehensive documentation.

---

**Last Updated:** 2025-10-28
**Version:** 1.0
