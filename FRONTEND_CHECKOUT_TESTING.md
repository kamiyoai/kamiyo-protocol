# Frontend Checkout Testing Guide

**Version:** 1.0
**Last Updated:** 2025-10-28
**Testing Environment:** Development/Staging

---

## Overview

This guide provides step-by-step instructions for manually testing the KAMIYO checkout flow from the user's perspective. Complete these tests before deploying to production.

---

## 🎯 Testing Objectives

1. Verify all pricing tiers work correctly
2. Ensure Stripe integration functions properly
3. Validate success and error handling
4. Test mobile responsiveness
5. Confirm user journey is intuitive

---

## 🛠️ Prerequisites

### Setup

1. **Backend Running**
   ```bash
   cd /Users/dennisgoslar/Projekter/kamiyo
   uvicorn api.main:app --reload --port 8000
   ```
   Verify at: http://localhost:8000/api/billing/checkout-health

2. **Frontend Running**
   ```bash
   npm run dev
   ```
   Verify at: http://localhost:3000

3. **Environment Variables Set**
   - `STRIPE_SECRET_KEY` (test mode: `sk_test_*`)
   - `STRIPE_PRICE_MCP_PERSONAL`
   - `STRIPE_PRICE_MCP_TEAM`
   - `STRIPE_PRICE_MCP_ENTERPRISE`

4. **Stripe Test Cards Ready**
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Requires authentication: `4000 0025 0000 3155`

---

## 📋 Test Scenarios

### Test 1: Personal Tier Checkout

**Objective:** Verify personal tier ($19/month) checkout flow

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Locate the **Personal** pricing card
   - Verify price shows: **$19** /month
   - Verify features list is complete:
     - [ ] "Unlimited security queries" displayed
     - [ ] "1 AI agent" displayed
     - [ ] "Real-time data from 20+ sources" displayed
     - [ ] Other features visible

3. Click the **"Subscribe - $19/mo"** button
   - [ ] Button text changes to "Processing..."
   - [ ] Button is disabled during processing
   - [ ] No errors in browser console

4. **Redirected to Stripe Checkout**
   - [ ] URL changes to `checkout.stripe.com`
   - [ ] Stripe Checkout page loads
   - [ ] Product name: "KAMIYO MCP Personal" (or similar)
   - [ ] Price shown: $19.00
   - [ ] Email field present

5. **Complete Checkout (Test Mode)**
   - Enter email: `test+personal@example.com`
   - Card number: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
   - Click **"Subscribe"**

6. **Verify Success Page**
   - [ ] Redirected to `/dashboard/success?session_id=cs_test_...`
   - [ ] Success checkmark icon displayed
   - [ ] Message: "Subscription Successful!"
   - [ ] Tier shown: "KAMIYO MCP personal"
   - [ ] Email shown: `test+personal@example.com`
   - [ ] Next steps listed:
     1. Check your email
     2. Add KAMIYO to Claude Desktop
     3. Start using security intelligence
   - [ ] Two buttons visible:
     - "Go to Dashboard"
     - "View Setup Guide"

7. **Verify Session Details API**
   - Open browser DevTools → Network tab
   - Find request to `/api/billing/checkout-session/{session_id}`
   - Verify response:
     - Status: 200 OK
     - JSON contains:
       - `session_id`
       - `status: "complete"`
       - `customer_email`
       - `tier: "personal"`
       - `amount_total: 1900` (cents)
       - `currency: "usd"`
       - `subscription_id`

8. **Test Navigation**
   - Click **"Go to Dashboard"** → Should redirect to dashboard
   - Go back to success page
   - Click **"View Setup Guide"** → Should redirect to setup guide

**Expected Result:** ✅ Personal tier checkout completes successfully

---

### Test 2: Team Tier Checkout

**Objective:** Verify team tier ($99/month) checkout flow

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Locate the **Team** pricing card
   - [ ] Card has "Most Popular" badge
   - [ ] Card is highlighted (different border color)
   - [ ] Price shows: **$99** /month
   - [ ] Features show: "5 AI agents", "Team workspace", etc.

3. Click the **"Subscribe - $99/mo"** button

4. **Redirected to Stripe Checkout**
   - [ ] Price shown: $99.00
   - [ ] Product: "KAMIYO MCP Team" (or similar)

5. **Complete Checkout**
   - Email: `test+team@example.com`
   - Card: `4242 4242 4242 4242`
   - Complete payment

6. **Verify Success Page**
   - [ ] Tier shown: "KAMIYO MCP team"
   - [ ] Email shown: `test+team@example.com`

**Expected Result:** ✅ Team tier checkout completes successfully

---

### Test 3: Enterprise Tier (Contact Sales)

**Objective:** Verify enterprise tier redirects to inquiries

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Locate the **Enterprise** pricing card
   - [ ] Price shows: **$299** /month
   - [ ] Features show: "Unlimited agents", "SLA guarantees", etc.

3. Click the **"Contact Sales"** button

4. **Verify Redirect**
   - [ ] Redirected to `/inquiries` page
   - [ ] No Stripe checkout shown
   - [ ] Inquiry/contact form displayed

**Expected Result:** ✅ Enterprise tier redirects to contact form (no checkout)

---

### Test 4: x402 API (Documentation Link)

**Objective:** Verify x402 tier redirects to API documentation

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Scroll to **x402 API** section (below MCP subscriptions)
   - [ ] Section title: "x402 API"
   - [ ] Price: **$0.01** per query
   - [ ] Features list includes:
     - No account required
     - Pay with USDC
     - Same real-time data

3. Click **"View API Documentation"** button

4. **Verify Redirect**
   - [ ] Redirected to `/api-docs` page
   - [ ] API documentation displayed

**Expected Result:** ✅ x402 redirects to API docs (no checkout)

---

### Test 5: Checkout Cancellation

**Objective:** Verify cancel URL returns to pricing page

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Click **"Subscribe - $19/mo"** (Personal tier)

3. **On Stripe Checkout Page**
   - Click browser **back button** OR
   - Click Stripe's **"← Back"** link (if present)

4. **Verify Return**
   - [ ] Returned to pricing page
   - [ ] No error messages shown
   - [ ] Can restart checkout flow

**Expected Result:** ✅ Cancel returns to pricing page without errors

---

### Test 6: Payment Declined

**Objective:** Test error handling for declined payments

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Click **"Subscribe - $19/mo"**

3. **On Stripe Checkout**
   - Email: `test+declined@example.com`
   - Card number: `4000 0000 0000 0002` (decline card)
   - Complete other fields
   - Click **"Subscribe"**

4. **Verify Error Handling**
   - [ ] Stripe shows error: "Your card was declined"
   - [ ] User stays on checkout page
   - [ ] Can try different card

5. **Retry with Valid Card**
   - Change card to: `4242 4242 4242 4242`
   - Click **"Subscribe"** again
   - [ ] Payment succeeds
   - [ ] Redirected to success page

**Expected Result:** ✅ Declined payment shows error, allows retry

---

### Test 7: Card Requiring Authentication

**Objective:** Test 3D Secure authentication flow

**Steps:**

1. Navigate to http://localhost:3000/pricing

2. Click **"Subscribe - $19/mo"**

3. **On Stripe Checkout**
   - Email: `test+3ds@example.com`
   - Card number: `4000 0025 0000 3155` (requires authentication)
   - Complete other fields
   - Click **"Subscribe"**

4. **Verify 3D Secure Modal**
   - [ ] 3D Secure challenge modal appears
   - [ ] Modal says "Complete authentication"
   - Click **"Complete"** or **"Authorize"**

5. **Verify Success**
   - [ ] Authentication completes
   - [ ] Payment processes
   - [ ] Redirected to success page

**Expected Result:** ✅ 3D Secure authentication works correctly

---

### Test 8: Invalid Session ID

**Objective:** Test error handling for invalid session IDs

**Steps:**

1. Navigate directly to:
   ```
   http://localhost:3000/dashboard/success?session_id=cs_test_invalid
   ```

2. **Verify Error Handling**
   - [ ] Loading state shown briefly
   - [ ] Error message displayed:
     - "Error Loading Order"
     - Error details shown
   - [ ] "Go to Dashboard" button available
   - [ ] No crash or blank page

3. **Click "Go to Dashboard"**
   - [ ] Redirects to dashboard

**Expected Result:** ✅ Invalid session shows error gracefully

---

### Test 9: Missing Session ID

**Objective:** Test success page without session ID

**Steps:**

1. Navigate directly to:
   ```
   http://localhost:3000/dashboard/success
   ```
   (No `session_id` parameter)

2. **Verify Behavior**
   - [ ] Loading state shown OR
   - [ ] Error message shown OR
   - [ ] Page indicates session ID missing

**Expected Result:** ✅ Missing session ID handled appropriately

---

## 📱 Mobile Responsiveness Tests

### Test 10: Mobile Pricing Page

**Objective:** Verify mobile layout and usability

**Steps:**

1. Open browser DevTools
2. Enable device emulation (iPhone 12 Pro, 390x844)
3. Navigate to http://localhost:3000/pricing

**Verify:**

- [ ] Pricing cards stack vertically (not horizontal)
- [ ] Card content is readable (no text cutoff)
- [ ] Buttons are full-width or centered
- [ ] Buttons are easily tappable (min 44x44px)
- [ ] "Most Popular" badge visible on Team card
- [ ] No horizontal scrolling required
- [ ] Feature lists are readable
- [ ] x402 section displays correctly

**Test Devices:**
- [ ] iPhone SE (375x667)
- [ ] iPhone 12 Pro (390x844)
- [ ] iPad (768x1024)
- [ ] Samsung Galaxy S21 (360x800)

---

### Test 11: Mobile Checkout Flow

**Objective:** Complete checkout on mobile device

**Steps:**

1. Enable mobile emulation (iPhone 12 Pro)
2. Navigate to http://localhost:3000/pricing
3. Click **"Subscribe - $19/mo"**
4. Complete Stripe Checkout (use test card)
5. Verify success page

**Verify:**

- [ ] Stripe Checkout is mobile-optimized
- [ ] Form fields are easy to tap
- [ ] Keyboard doesn't obscure inputs
- [ ] Success page is readable on mobile
- [ ] Buttons are tappable
- [ ] Next steps are clearly visible

---

## 🌐 Browser Compatibility Tests

### Test 12: Cross-Browser Testing

**Objective:** Ensure checkout works in all major browsers

**Browsers to Test:**

1. **Chrome/Edge (Chromium)**
   - Version: Latest
   - [ ] Pricing page loads
   - [ ] Checkout redirects work
   - [ ] Success page displays correctly

2. **Firefox**
   - Version: Latest
   - [ ] Pricing page loads
   - [ ] Checkout redirects work
   - [ ] Success page displays correctly

3. **Safari** (macOS/iOS)
   - Version: Latest
   - [ ] Pricing page loads
   - [ ] Checkout redirects work
   - [ ] Success page displays correctly
   - [ ] No CORS issues

4. **Mobile Safari** (iOS)
   - [ ] Checkout flow completes
   - [ ] No redirect issues

---

## 🎨 UI/UX Validation

### Test 13: Visual Design

**Objective:** Verify UI matches design specifications

**Verify:**

- [ ] Pricing cards have consistent spacing
- [ ] "Most Popular" badge is visible (Team tier)
- [ ] Gradient text renders correctly
- [ ] Card hover effects work (slight translate up)
- [ ] Button colors match brand (cyan)
- [ ] Success checkmark icon is green
- [ ] Loading state is clear (not confusing)

---

### Test 14: Accessibility

**Objective:** Ensure checkout is accessible

**Tools:**
- Chrome Lighthouse
- axe DevTools

**Verify:**

- [ ] All buttons have descriptive text
- [ ] Images have alt text
- [ ] Semantic HTML used (`<article>`, `<section>`, `<h1>`, etc.)
- [ ] ARIA labels present where needed
- [ ] Keyboard navigation works:
  - Tab through pricing cards
  - Enter key activates buttons
  - Focus indicators visible
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Screen reader can read all content

**Lighthouse Score Targets:**
- Accessibility: 100
- Best Practices: 90+
- SEO: 90+

---

## 🔧 Error Scenarios

### Test 15: Network Error Handling

**Objective:** Test behavior when API is unavailable

**Steps:**

1. Stop backend server:
   ```bash
   # Kill uvicorn process
   ```

2. Navigate to http://localhost:3000/pricing

3. Click **"Subscribe - $19/mo"**

**Verify:**

- [ ] Error alert appears: "Unable to start checkout"
- [ ] Button returns to normal state (not stuck on "Processing...")
- [ ] User can retry
- [ ] No infinite loading state

4. Restart backend server

5. Click **"Subscribe - $19/mo"** again

**Verify:**

- [ ] Checkout works after backend recovers

---

### Test 16: Slow Network Simulation

**Objective:** Test loading states with slow connection

**Steps:**

1. Open browser DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Navigate to http://localhost:3000/pricing
4. Click **"Subscribe - $19/mo"**

**Verify:**

- [ ] Loading indicator shown during API call
- [ ] Button disabled during processing
- [ ] User can't double-click button
- [ ] Checkout eventually completes
- [ ] No timeout errors (or timeout is reasonable)

---

## ✅ Test Results Template

Use this template to record your test results:

```markdown
## Test Results

**Tester:** [Your Name]
**Date:** [Date]
**Environment:** Development/Staging
**Browser:** [Browser + Version]

| Test # | Test Name                    | Status | Notes           |
|--------|------------------------------|--------|-----------------|
| 1      | Personal Tier Checkout       | ✅ Pass | -               |
| 2      | Team Tier Checkout           | ✅ Pass | -               |
| 3      | Enterprise Tier              | ✅ Pass | -               |
| 4      | x402 API Link                | ✅ Pass | -               |
| 5      | Checkout Cancellation        | ✅ Pass | -               |
| 6      | Payment Declined             | ✅ Pass | -               |
| 7      | Card Auth (3DS)              | ✅ Pass | -               |
| 8      | Invalid Session ID           | ✅ Pass | -               |
| 9      | Missing Session ID           | ✅ Pass | -               |
| 10     | Mobile Pricing Page          | ✅ Pass | -               |
| 11     | Mobile Checkout Flow         | ✅ Pass | -               |
| 12     | Cross-Browser                | ✅ Pass | -               |
| 13     | Visual Design                | ✅ Pass | -               |
| 14     | Accessibility                | ✅ Pass | -               |
| 15     | Network Error                | ✅ Pass | -               |
| 16     | Slow Network                 | ✅ Pass | -               |

**Overall Status:** PASS / FAIL

**Issues Found:**
1. [Issue description]
2. [Issue description]

**Recommendations:**
- [Recommendation 1]
- [Recommendation 2]
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "Payment system not configured" error

**Cause:** Missing Stripe environment variables

**Solution:**
```bash
# Check .env file
grep STRIPE .env

# Ensure these are set:
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MCP_PERSONAL=price_...
STRIPE_PRICE_MCP_TEAM=price_...
STRIPE_PRICE_MCP_ENTERPRISE=price_...
```

---

### Issue 2: CORS error when calling API

**Cause:** Frontend domain not in ALLOWED_ORIGINS

**Solution:**
```python
# api/main.py - add localhost to CORS origins
ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001"])
```

---

### Issue 3: Success page shows "Error Loading Order"

**Cause:** Invalid session ID or API endpoint issue

**Solution:**
1. Check API is running: `curl http://localhost:8000/api/billing/checkout-health`
2. Verify session ID in URL is valid (starts with `cs_test_`)
3. Check browser console for error details

---

### Issue 4: Button stuck on "Processing..."

**Cause:** JavaScript error or network timeout

**Solution:**
1. Check browser console for errors
2. Verify API endpoint is correct
3. Check network tab for failed requests
4. Ensure error handling resets button state

---

## 📚 Additional Resources

- **Stripe Testing Cards:** https://stripe.com/docs/testing
- **Next.js Routing:** https://nextjs.org/docs/routing/introduction
- **Browser DevTools Guide:** https://developer.chrome.com/docs/devtools/

---

## 🎯 Sign-Off

Once all tests pass, sign off below:

**Tester:** _______________________
**Date:** _______________________
**Status:** ✅ PASS / ❌ FAIL

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

---

**Version History:**
- v1.0 (2025-10-28): Initial testing guide created
