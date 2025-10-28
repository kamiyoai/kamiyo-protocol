# KAMIYO Checkout Production Readiness Checklist

**Status:** Pre-Production Testing
**Last Updated:** 2025-10-28
**Version:** 1.0

---

## Overview

This checklist validates that the KAMIYO checkout implementation is ready for production deployment. Complete all items before deploying to production.

---

## 🔐 1. Stripe Configuration

### 1.1 API Keys

- [ ] **Stripe Secret Key Configured**
  - Environment variable: `STRIPE_SECRET_KEY`
  - Format validation: Must start with `sk_live_` (production) or `sk_test_` (development)
  - Location: `.env` or environment variables
  - **Verify:** Run `echo $STRIPE_SECRET_KEY | grep -E '^sk_(test|live)_'`

- [ ] **Stripe Publishable Key Configured**
  - Environment variable: `STRIPE_PUBLISHABLE_KEY`
  - Format: Must start with `pk_live_` or `pk_test_`
  - Used by: Frontend components (not yet implemented, future use)

- [ ] **API Keys Match Environment**
  - [ ] Development: Uses `sk_test_*` keys
  - [ ] Production: Uses `sk_live_*` keys
  - [ ] No mixing of test and live keys

### 1.2 Price IDs

- [ ] **Personal Tier Price ID** (`$19/month`)
  - Environment variable: `STRIPE_PRICE_MCP_PERSONAL`
  - Format: `price_xxxxx`
  - Validated in Stripe Dashboard
  - **Verify:** Check at https://dashboard.stripe.com/products

- [ ] **Team Tier Price ID** (`$99/month`)
  - Environment variable: `STRIPE_PRICE_MCP_TEAM`
  - Format: `price_xxxxx`
  - Validated in Stripe Dashboard

- [ ] **Enterprise Tier Price ID** (`$299/month`)
  - Environment variable: `STRIPE_PRICE_MCP_ENTERPRISE`
  - Format: `price_xxxxx`
  - Validated in Stripe Dashboard

- [ ] **Pricing Matches Marketing Materials**
  - [ ] Stripe prices match pricing page
  - [ ] Currency is USD
  - [ ] Billing period is monthly

### 1.3 Webhooks

- [ ] **Webhook Endpoint Created**
  - URL: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
  - Events subscribed:
    - [ ] `checkout.session.completed`
    - [ ] `customer.subscription.created`
    - [ ] `customer.subscription.updated`
    - [ ] `customer.subscription.deleted`
    - [ ] `invoice.payment_succeeded`
    - [ ] `invoice.payment_failed`

- [ ] **Webhook Secret Configured**
  - Environment variable: `STRIPE_WEBHOOK_SECRET`
  - Format: `whsec_xxxxx`
  - **Verify:** Test webhook delivery in Stripe Dashboard

- [ ] **Webhook Signature Verification Enabled**
  - Code location: `api/webhooks/routes.py` or `api/billing/routes.py`
  - **Verify:** Check for `stripe.Webhook.construct_event()`

- [ ] **Webhook Endpoint Tested**
  - [ ] Test event sent from Stripe Dashboard
  - [ ] Webhook logs show successful processing
  - [ ] Database updated correctly

### 1.4 Stripe Dashboard Configuration

- [ ] **Customer Portal Enabled**
  - Location: https://dashboard.stripe.com/settings/billing/portal
  - Features enabled:
    - [ ] Invoice history
    - [ ] Payment method management
    - [ ] Subscription cancellation

- [ ] **Email Receipts Enabled**
  - [ ] Successful payment receipts
  - [ ] Failed payment notifications
  - [ ] Subscription confirmations

- [ ] **Tax Calculation Configured** (if applicable)
  - [ ] Automatic tax enabled in checkout sessions
  - [ ] Tax rates configured for regions

---

## 🔌 2. API Endpoints

### 2.1 Route Registration

- [ ] **Checkout Module Imported**
  - File: `api/main.py`
  - Import: `from api.billing import checkout as checkout_routes`
  - **Verify:** `grep "checkout as checkout_routes" api/main.py`

- [ ] **Router Registered**
  - Code: `app.include_router(checkout_routes.router, tags=["Checkout"])`
  - **Verify:** `grep "include_router(checkout_routes.router" api/main.py`

### 2.2 Endpoint Functionality

- [ ] **POST /api/billing/create-checkout-session**
  - [ ] Endpoint responds (200 OK)
  - [ ] Returns `checkout_url`, `session_id`, `expires_at`
  - [ ] Validates tier (personal, team, enterprise)
  - [ ] Validates email format
  - [ ] Validates URLs (success_url, cancel_url)
  - [ ] Creates Stripe session with correct price ID
  - [ ] Includes metadata (tier, product_type)
  - **Test:** Use Postman or curl

- [ ] **GET /api/billing/checkout-session/{session_id}**
  - [ ] Endpoint responds (200 OK)
  - [ ] Returns session details (status, tier, amount, email)
  - [ ] Handles invalid session IDs (404)
  - [ ] No authentication required
  - **Test:** Use browser or curl

- [ ] **POST /api/billing/create-portal-session**
  - [ ] Returns 501 (Not Implemented) as expected
  - [ ] Documentation indicates future implementation

- [ ] **GET /api/billing/checkout-health**
  - [ ] Returns health status
  - [ ] Validates Stripe configuration
  - [ ] Reports missing price IDs
  - **Test:** `curl http://localhost:8000/api/billing/checkout-health`

### 2.3 Error Handling

- [ ] **HTTP Error Codes Correct**
  - [ ] 400: Invalid request (bad tier, email, URLs)
  - [ ] 404: Session not found
  - [ ] 500: Stripe errors, configuration errors
  - [ ] 501: Not implemented (portal)

- [ ] **Error Messages Clear**
  - [ ] User-friendly messages
  - [ ] No sensitive information exposed
  - [ ] Logged for debugging

- [ ] **Validation Works**
  - [ ] Invalid tier rejected
  - [ ] Invalid email rejected
  - [ ] Invalid URLs rejected

---

## 🖥️ 3. Frontend Components

### 3.1 PricingCard Component

- [ ] **Component Exists**
  - File: `components/PricingCard.js`
  - **Verify:** `ls components/PricingCard.js`

- [ ] **Checkout Integration**
  - [ ] Calls `/api/billing/create-checkout-session`
  - [ ] Passes tier correctly (personal, team, enterprise)
  - [ ] Passes user email if available
  - [ ] Constructs success_url with session_id placeholder
  - [ ] Constructs cancel_url (current page)
  - **Verify:** Review component code

- [ ] **Special Cases Handled**
  - [ ] Enterprise tier redirects to `/inquiries`
  - [ ] x402 tier redirects to `/api-docs`
  - [ ] Loading state shown during redirect
  - [ ] Error handling with user feedback

- [ ] **UI/UX Polish**
  - [ ] Button text changes during processing
  - [ ] Button disabled during checkout
  - [ ] Error alert shown on failure
  - [ ] Accessible (semantic HTML, ARIA labels)

### 3.2 Pricing Page

- [ ] **Page Exists**
  - File: `pages/pricing.js`
  - Route: `/pricing`
  - **Verify:** `ls pages/pricing.js`

- [ ] **Uses PricingCard Component**
  - [ ] Renders cards for personal, team, enterprise
  - [ ] Passes correct plan data
  - [ ] Highlights recommended tier (team)

- [ ] **SEO Optimized**
  - [ ] Meta tags configured
  - [ ] JSON-LD structured data
  - [ ] Canonical URL set
  - [ ] Open Graph tags

### 3.3 Success Page

- [ ] **Page Exists**
  - File: `pages/dashboard/success.js`
  - Route: `/dashboard/success`
  - **Verify:** `ls pages/dashboard/success.js`

- [ ] **Session Retrieval**
  - [ ] Reads `session_id` from URL query
  - [ ] Calls `/api/billing/checkout-session/{session_id}`
  - [ ] Shows loading state
  - [ ] Handles errors gracefully

- [ ] **Content Complete**
  - [ ] Success message with tier info
  - [ ] Next steps clearly listed:
    1. Check email for MCP token
    2. Add KAMIYO to Claude Desktop
    3. Start using security intelligence
  - [ ] CTA buttons:
    - [ ] "Go to Dashboard"
    - [ ] "View Setup Guide"
  - [ ] Order ID displayed

- [ ] **Error Handling**
  - [ ] Shows error message if session fetch fails
  - [ ] Provides "Go to Dashboard" button on error

### 3.4 Frontend Testing

- [ ] **Manual Testing Complete** (see `FRONTEND_CHECKOUT_TESTING.md`)
  - [ ] All pricing tiers tested
  - [ ] Redirects work correctly
  - [ ] Success page loads
  - [ ] Error handling works

- [ ] **Browser Compatibility**
  - [ ] Chrome/Edge (latest)
  - [ ] Firefox (latest)
  - [ ] Safari (latest)

- [ ] **Mobile Responsiveness**
  - [ ] Pricing cards stack on mobile
  - [ ] Buttons are tappable
  - [ ] Success page readable

---

## 🔒 4. Security

### 4.1 Secrets Management

- [ ] **No Secrets in Code**
  - [ ] No hardcoded API keys
  - [ ] No hardcoded price IDs
  - [ ] All sensitive data in environment variables
  - **Verify:** `grep -r "sk_live_\|sk_test_" --include="*.js" --include="*.py" . | grep -v ".env"`

- [ ] **Environment Variables Secure**
  - [ ] `.env` in `.gitignore`
  - [ ] `.env.example` provided (no real values)
  - [ ] Production secrets in secure storage (e.g., AWS Secrets Manager)

- [ ] **API Keys Rotated**
  - [ ] Test keys used in development
  - [ ] Live keys used in production
  - [ ] Keys rotated on compromise

### 4.2 CSRF Protection

- [ ] **CSRF Middleware Enabled**
  - File: `api/main.py`
  - **Verify:** `grep "CsrfProtect\|csrf_protect" api/main.py`

- [ ] **Checkout Endpoints Protected**
  - [ ] POST `/create-checkout-session` requires CSRF token (or is exempt)
  - [ ] GET endpoints don't require CSRF
  - **Note:** Checkout is typically public and may not need CSRF

- [ ] **Webhooks Exempt from CSRF**
  - Webhooks use signature verification instead

### 4.3 Input Validation

- [ ] **Pydantic Models Validate Input**
  - Models: `CheckoutRequest`, `PortalSessionRequest`
  - Validates: tier, email, URLs
  - **Verify:** Review `api/billing/checkout.py`

- [ ] **SQL Injection Not Possible**
  - No raw SQL in checkout code
  - Uses ORM or parameterized queries

- [ ] **XSS Protection**
  - No unescaped user input in responses
  - Content-Type headers correct

### 4.4 Rate Limiting

- [ ] **Rate Limiting Configured**
  - Middleware: `RateLimitMiddleware`
  - Limits: 30 requests/minute per IP (default)
  - **Verify:** `grep "RateLimitMiddleware" api/main.py`

- [ ] **Prevents Abuse**
  - [ ] Checkout spam blocked
  - [ ] DDoS mitigation in place

---

## 💾 5. Database

### 5.1 Schema

- [ ] **Subscription Tables Exist**
  - Tables: `subscriptions`, `customers`, `mcp_tokens` (or similar)
  - **Verify:** Run migration or check database

- [ ] **Migrations Applied**
  - [ ] Migration files exist
  - [ ] Migrations run on production database
  - **Verify:** `ls database/migrations/`

- [ ] **Indexes Created**
  - [ ] Subscription ID indexed
  - [ ] Customer email indexed
  - [ ] MCP token indexed

### 5.2 Data Management

- [ ] **Customer Data Stored Correctly**
  - [ ] Email, Stripe customer ID, subscription ID
  - [ ] No sensitive payment data (PCI compliance)

- [ ] **MCP Token Generation**
  - [ ] Token generated on subscription creation (webhook)
  - [ ] Token format: JWT or secure random string
  - [ ] Token stored in database
  - [ ] Token sent via email

- [ ] **Subscription Status Tracked**
  - [ ] Active, canceled, past_due, unpaid
  - [ ] Updated via webhooks

---

## 📧 6. Email Integration

### 6.1 MCP Token Email

- [ ] **Email Template Created**
  - Template name: `mcp_token_welcome.html` or similar
  - Content:
    - [ ] Welcome message
    - [ ] MCP token (secure, copyable)
    - [ ] Setup instructions link
    - [ ] Support contact

- [ ] **Email Trigger Configured**
  - Trigger: `checkout.session.completed` webhook
  - Function: `send_mcp_token_email()`
  - **Verify:** Check webhook handler

- [ ] **Email Service Configured**
  - Service: SendGrid, Mailgun, AWS SES, or similar
  - API key configured
  - Sender email verified

- [ ] **Test Email Sent**
  - [ ] Use Stripe test mode to trigger
  - [ ] Verify email delivery
  - [ ] Verify token format and content

### 6.2 Email Deliverability

- [ ] **SPF Record Configured**
  - Domain: `kamiyo.ai`
  - **Verify:** `dig kamiyo.ai TXT | grep spf`

- [ ] **DKIM Configured**
  - Email service provides DKIM keys
  - DNS records added

- [ ] **DMARC Policy Set**
  - Policy: `v=DMARC1; p=none;` (minimum)

---

## 🧪 7. Testing

### 7.1 Unit Tests

- [ ] **Checkout Endpoint Tests**
  - [ ] Valid request returns checkout URL
  - [ ] Invalid tier returns 400
  - [ ] Invalid email returns 400
  - [ ] Missing price ID returns 500

- [ ] **Session Retrieval Tests**
  - [ ] Valid session ID returns details
  - [ ] Invalid session ID returns 404

### 7.2 Integration Tests

- [ ] **Full Checkout Flow**
  - [ ] Click "Subscribe" button
  - [ ] Redirect to Stripe Checkout
  - [ ] Complete payment (test mode)
  - [ ] Redirect to success page
  - [ ] Session details loaded
  - [ ] Webhook received and processed
  - [ ] MCP token generated
  - [ ] Email sent

- [ ] **Error Scenarios**
  - [ ] Payment failure handled
  - [ ] Session expiration handled
  - [ ] Network errors handled

### 7.3 Load Testing

- [ ] **Performance Validated**
  - [ ] 100 concurrent checkout sessions
  - [ ] Response time < 2 seconds
  - [ ] No database deadlocks

### 7.4 Security Testing

- [ ] **Penetration Testing**
  - [ ] No SQL injection vulnerabilities
  - [ ] No XSS vulnerabilities
  - [ ] CSRF protection works

- [ ] **Stripe Test Mode Used**
  - [ ] All testing in test mode
  - [ ] Test card numbers used
  - [ ] No real payments made

---

## 📊 8. Monitoring & Logging

### 8.1 Logging

- [ ] **Checkout Events Logged**
  - [ ] Session creation logged
  - [ ] Session retrieval logged
  - [ ] Errors logged with context
  - **Verify:** Check log files or log aggregator

- [ ] **PCI Compliance**
  - [ ] No credit card numbers in logs
  - [ ] No CVV codes in logs
  - [ ] Stripe API keys redacted

### 8.2 Metrics

- [ ] **Prometheus Metrics Enabled**
  - Metrics:
    - [ ] `api_requests_total` (endpoint, status)
    - [ ] Checkout session creations
    - [ ] Checkout session retrievals
  - **Verify:** Check `monitoring/prometheus_metrics.py`

- [ ] **Dashboards Created**
  - [ ] Grafana dashboard for checkout metrics
  - [ ] Alerts for high error rates

### 8.3 Error Tracking

- [ ] **Sentry Configured** (or similar)
  - [ ] Checkout errors sent to Sentry
  - [ ] Stripe errors tagged appropriately

---

## 🚀 9. Deployment

### 9.1 Pre-Deployment

- [ ] **All Tests Pass**
  - [ ] Run `scripts/test_checkout_flow.sh`
  - [ ] All checks green

- [ ] **Code Review Complete**
  - [ ] Checkout module reviewed
  - [ ] Frontend components reviewed
  - [ ] Security reviewed

- [ ] **Documentation Updated**
  - [ ] API docs updated
  - [ ] Setup guides updated
  - [ ] Internal docs updated

### 9.2 Deployment Steps

- [ ] **Environment Variables Set**
  - [ ] Production `.env` configured
  - [ ] All Stripe variables set
  - [ ] Webhook secret set

- [ ] **Database Migrations Run**
  - [ ] Migrations applied to production
  - [ ] No errors

- [ ] **Application Deployed**
  - [ ] Backend deployed
  - [ ] Frontend deployed
  - [ ] Health checks pass

- [ ] **Smoke Testing**
  - [ ] Health endpoint responds
  - [ ] Pricing page loads
  - [ ] Create test checkout session (test mode)
  - [ ] Verify webhook delivery

### 9.3 Post-Deployment

- [ ] **Monitor for Errors**
  - [ ] Check logs for errors
  - [ ] Check Sentry for exceptions
  - [ ] Check Stripe Dashboard for issues

- [ ] **Customer Testing**
  - [ ] Internal team completes test purchase
  - [ ] MCP token received
  - [ ] Token works in Claude Desktop

- [ ] **Production Validation**
  - [ ] Switch to live Stripe keys
  - [ ] Complete real transaction (small amount)
  - [ ] Verify entire flow works

---

## 🎯 10. Go-Live Checklist

### 10.1 Final Validation

- [ ] **All items in this checklist completed**
- [ ] **Security audit passed**
- [ ] **Load testing passed**
- [ ] **Customer journey tested end-to-end**

### 10.2 Go-Live

- [ ] **Live Stripe keys activated**
- [ ] **Webhooks pointing to production**
- [ ] **Pricing page live**
- [ ] **Announcement ready** (email, social media)

### 10.3 Monitoring Plan

- [ ] **24-hour monitoring post-launch**
- [ ] **On-call engineer assigned**
- [ ] **Rollback plan ready**

---

## 📝 Notes

### Common Issues

1. **Missing Price IDs**
   - Error: `Price not configured for tier: personal`
   - Fix: Set `STRIPE_PRICE_MCP_PERSONAL` in `.env`

2. **Webhook Not Received**
   - Check webhook URL is publicly accessible
   - Verify webhook secret matches
   - Check Stripe Dashboard webhook logs

3. **Success Page Not Loading**
   - Ensure `pages/dashboard/success.js` exists
   - Check Next.js routing configuration

4. **CORS Errors**
   - Verify `ALLOWED_ORIGINS` includes frontend domain
   - Check CORS headers in response

### Support Contacts

- **Stripe Support:** https://support.stripe.com
- **KAMIYO Dev Team:** support@kamiyo.ai
- **Documentation:** https://docs.kamiyo.ai

---

## ✅ Sign-Off

**Completed by:** _______________________
**Date:** _______________________
**Approved by:** _______________________
**Production Deployment Date:** _______________________

---

**Version History:**
- v1.0 (2025-10-28): Initial checklist created
