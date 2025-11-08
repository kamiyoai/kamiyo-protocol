# x402 Infrastructure - Production Deployment Plan
## Executable Development Plan for Sonnet 4.5 Agent

**Objective:** Deploy x402 Infrastructure SaaS to production and acquire first 20 paying customers
**Timeline:** 4 weeks (40 hours total)
**Target Outcome:** Production-ready platform with $3K MRR

---

## Overview

This plan takes the 85% complete x402 SaaS implementation to production-ready state and launches to first customers. The agent will execute tasks sequentially, with clear validation criteria for each step.

**Current Status:**
- ✅ Core architecture complete (multi-tenant, API key management)
- ✅ Python SDK production-ready
- ✅ Database schema and migrations ready
- ⚠️ Python verifier not deployed as service
- ⚠️ Dashboard non-functional (mock data)
- ⚠️ Stripe integration untested
- ❌ No monitoring/alerting

**Target Status:**
- ✅ All services deployed and monitored
- ✅ Dashboard fully functional
- ✅ Billing tested and working
- ✅ First 20 customers onboarded
- ✅ $3K MRR achieved

---

## Week 1: Production Infrastructure (16 hours)

### Task 1.1: Deploy Python Verifier as Separate Service (4 hours)

**Objective:** Make payment verification work by deploying the Python verifier as a standalone HTTP API service

**Context:**
- Current issue: `lib/x402-saas/python-verifier-bridge.js` requires `PYTHON_VERIFIER_URL` but verifier not deployed
- Solution: Deploy `api/x402/verifier_api.py` to Render as separate service
- Why critical: Without this, zero verifications can be processed

**Steps:**

1. **Create Dockerfile for Python Verifier** (30 min)
   - Location: Create `api/x402/Dockerfile`
   - Base image: `python:3.11-slim`
   - Install dependencies from `requirements.txt`
   - Expose port 8000
   - CMD: `uvicorn verifier_api:app --host 0.0.0.0 --port 8000`

   ```dockerfile
   FROM python:3.11-slim

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY . .

   EXPOSE 8000

   CMD ["uvicorn", "verifier_api:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

2. **Create requirements.txt for Verifier** (15 min)
   - Location: `api/x402/requirements.txt`
   - Dependencies: fastapi, uvicorn, httpx, solana, web3, base58
   - Pin versions for reproducibility

   ```
   fastapi==0.104.1
   uvicorn==0.24.0
   httpx==0.25.1
   solana==0.30.2
   web3==6.11.3
   base58==2.1.1
   python-dotenv==1.0.0
   ```

3. **Create Render Blueprint for Verifier** (30 min)
   - Location: `render-verifier.yaml`
   - Service type: Web Service
   - Environment: Python 3.11
   - Build command: `pip install -r api/x402/requirements.txt`
   - Start command: `uvicorn api.x402.verifier_api:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/health`
   - Instance type: Starter (should handle 100 req/s)

   ```yaml
   services:
     - type: web
       name: x402-python-verifier
       env: python
       region: oregon
       plan: starter
       branch: main
       buildCommand: pip install -r api/x402/requirements.txt
       startCommand: uvicorn api.x402.verifier_api:app --host 0.0.0.0 --port $PORT
       healthCheckPath: /health
       envVars:
         - key: SOLANA_RPC_URL
           sync: false
         - key: ETHEREUM_RPC_URL
           sync: false
         - key: BASE_RPC_URL
           sync: false
   ```

4. **Deploy Verifier to Render** (1 hour)
   - Push code to GitHub
   - Create new Web Service on Render
   - Use render-verifier.yaml blueprint
   - Set environment variables (RPC URLs)
   - Wait for deployment to complete
   - Verify health check passes

5. **Test Verifier API Independently** (30 min)
   - Use curl or Postman to test `/x402/verify` endpoint
   - Test with real Solana transaction hash
   - Test with real Base/Ethereum transaction hash
   - Verify response format matches expected schema
   - Test error handling (invalid tx hash, wrong chain)

6. **Update Main App Environment Variables** (15 min)
   - Add `PYTHON_VERIFIER_URL` to main app on Render
   - Value: `https://x402-python-verifier.onrender.com`
   - Restart main app to pick up new environment variable

7. **Test End-to-End Verification** (1 hour)
   - Create test tenant via admin API
   - Get API key from database
   - Call `POST /api/v1/x402/verify` with real transaction
   - Verify response includes verification result
   - Check database for X402Verification record
   - Test quota consumption (verify `monthlyVerificationsUsed` increments)

**Validation Criteria:**
- [ ] Python verifier deployed and healthy on Render
- [ ] Health check endpoint returns 200 OK
- [ ] Main app can reach verifier via PYTHON_VERIFIER_URL
- [ ] End-to-end verification works (test transaction verified)
- [ ] Database records verification in X402Verification table
- [ ] Quota consumption tracked correctly

**Rollback Plan:**
- If deployment fails, revert to main branch
- Main app will return error "Verifier unavailable" (graceful degradation)
- Fix issues locally, redeploy

---

### Task 1.2: Fix Dashboard Authentication and API Key Display (6 hours)

**Objective:** Make the dashboard functional so tenants can manage their accounts

**Context:**
- Current issue: `pages/dashboard/x402.js` uses mock API key and mock analytics data
- Solution: Link NextAuth session to X402Tenant, display real API keys, connect to real analytics API
- Why critical: Users can't self-service without working dashboard

**Steps:**

1. **Create Tenant Session Middleware** (1 hour)
   - Location: `lib/x402-saas/get-tenant-from-session.js`
   - Purpose: Map NextAuth user email to X402Tenant
   - Logic:
     1. Get user email from NextAuth session
     2. Query X402Tenant by email
     3. Return tenant object or null if not found

   ```javascript
   // lib/x402-saas/get-tenant-from-session.js
   import { getServerSession } from 'next-auth';
   import { authOptions } from '../../pages/api/auth/[...nextauth]';
   import prisma from '../prisma';

   export async function getTenantFromSession(req, res) {
     const session = await getServerSession(req, res, authOptions);

     if (!session?.user?.email) {
       return null;
     }

     const tenant = await prisma.x402Tenant.findUnique({
       where: { email: session.user.email },
       include: {
         apiKeys: {
           where: { isActive: true },
           orderBy: { createdAt: 'desc' }
         }
       }
     });

     return tenant;
   }
   ```

2. **Create API Route for Dashboard Data** (1 hour)
   - Location: `pages/api/v1/x402/dashboard/overview.js`
   - Purpose: Return tenant info, API keys, usage stats
   - Authentication: Require valid NextAuth session
   - Response format:

   ```javascript
   {
     "tenant": {
       "id": "cuid...",
       "email": "user@example.com",
       "tier": "starter",
       "status": "active",
       "monthlyVerificationLimit": 50000,
       "monthlyVerificationsUsed": 1247,
       "quotaResetDate": "2025-12-01T00:00:00Z",
       "enabledChains": ["solana", "base", "ethereum"]
     },
     "apiKeys": [
       {
         "id": "cuid...",
         "name": "Production API Key",
         "environment": "live",
         "keyPreview": "x402_live_abc...xyz",  // First 12 + last 4 chars
         "scopes": ["verify", "analytics"],
         "lastUsedAt": "2025-11-08T14:23:45Z",
         "createdAt": "2025-11-01T10:00:00Z"
       }
     ],
     "usage": {
       "last7Days": 8456,
       "last30Days": 34201,
       "percentOfQuota": 68.4
     }
   }
   ```

3. **Update Dashboard to Fetch Real Data** (2 hours)
   - File: `pages/dashboard/x402.js`
   - Remove mock data generation
   - Add `useEffect` hook to fetch from `/api/v1/x402/dashboard/overview`
   - Display real tenant information
   - Show API keys with copy-to-clipboard functionality
   - Add loading states
   - Handle error states (tenant not found, API error)

4. **Add API Key Management UI** (1.5 hours)
   - Add "Create New API Key" button
   - Modal for key creation with:
     - Name input (optional)
     - Environment selection (live/test)
     - Scopes checkboxes (verify, settle, analytics)
   - Display newly created key ONCE (never shown again)
   - Add "Revoke" button for existing keys (with confirmation)
   - Show last used timestamp

5. **Create API Routes for Key Management** (30 min)
   - `POST /api/v1/x402/dashboard/api-keys/create`
   - `POST /api/v1/x402/dashboard/api-keys/:keyId/revoke`
   - Both require NextAuth session
   - Create route calls `APIKeyManager.createApiKey()`
   - Revoke route calls `APIKeyManager.revokeApiKey()`

6. **Connect Real Analytics** (30 min)
   - File: `pages/dashboard/x402.js`
   - Fetch analytics from `/api/v1/x402/analytics`
   - Use real date range (last 30 days)
   - Display verification count chart
   - Show chain distribution
   - Display success rate

7. **Test Dashboard End-to-End** (30 min)
   - Create test user via NextAuth
   - Create X402Tenant with same email
   - Login to dashboard
   - Verify tenant info displays correctly
   - Create new API key, verify it appears
   - Copy API key, verify clipboard works
   - Revoke API key, verify it's marked inactive
   - Check analytics displays real data

**Validation Criteria:**
- [ ] NextAuth session maps to X402Tenant correctly
- [ ] Dashboard displays real tenant information (tier, quota, usage)
- [ ] API keys displayed with preview format
- [ ] Copy-to-clipboard works for API keys
- [ ] New API key creation works
- [ ] API key revocation works
- [ ] Analytics charts show real data from database
- [ ] Loading and error states handle gracefully

**Rollback Plan:**
- Dashboard is non-critical for API functionality
- If issues occur, can temporarily disable dashboard link
- API still works independently

---

### Task 1.3: Test and Validate Stripe Integration (4 hours)

**Objective:** Ensure billing system works before accepting real payments

**Context:**
- Code exists: `lib/x402-saas/billing-service.js` (411 lines)
- Untested: No evidence of actual Stripe integration testing
- Risk: Taking payments without testing = refunds, disputes, legal issues
- Why critical: Billing is core revenue generation mechanism

**Steps:**

1. **Set Up Stripe Test Mode** (30 min)
   - Create Stripe account (or use existing)
   - Get test API keys (starts with `pk_test_` and `sk_test_`)
   - Add to environment variables:
     - `STRIPE_SECRET_KEY=sk_test_...`
     - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
     - `STRIPE_WEBHOOK_SECRET=whsec_...` (get after creating webhook)

2. **Create Stripe Products and Prices** (45 min)
   - Run script: `node scripts/create_x402_stripe_products.mjs`
   - This creates 3 products (Starter, Pro, Enterprise)
   - Note down price IDs, add to environment variables:
     - `X402_STRIPE_PRICE_STARTER=price_...`
     - `X402_STRIPE_PRICE_PRO=price_...`
     - `X402_STRIPE_PRICE_ENTERPRISE=price_...`
   - Verify products visible in Stripe dashboard

3. **Test Checkout Flow** (1 hour)
   - Create test tenant in database
   - Login to dashboard as that tenant
   - Click "Upgrade to Starter" button
   - Should redirect to Stripe Checkout
   - Use test card: `4242 4242 4242 4242` (exp: any future date, CVC: any 3 digits)
   - Complete checkout
   - Should redirect back to dashboard
   - Verify in Stripe dashboard that subscription created

4. **Set Up Stripe Webhook** (30 min)
   - In Stripe dashboard, create webhook endpoint
   - URL: `https://your-app.onrender.com/api/v1/x402/webhooks/stripe`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var

5. **Test Webhook Handling** (1 hour)
   - Use Stripe CLI to trigger test webhooks:
     ```bash
     stripe trigger customer.subscription.created
     stripe trigger invoice.payment_succeeded
     stripe trigger invoice.payment_failed
     ```
   - Check application logs for webhook processing
   - Verify database updates:
     - `customer.subscription.created` → sets `stripeSubscriptionId`, updates `tier`
     - `invoice.payment_succeeded` → logs successful payment
     - `invoice.payment_failed` → sets tenant status to `suspended`

6. **Test Subscription Lifecycle** (45 min)

   **Test Case 1: Upgrade (Free → Starter)**
   - Create free tier tenant
   - Initiate checkout for Starter tier
   - Complete payment with test card
   - Verify:
     - [ ] `tier` updated to "starter"
     - [ ] `stripeSubscriptionId` populated
     - [ ] `monthlyVerificationLimit` updated to 50,000
     - [ ] Tenant can now verify payments

   **Test Case 2: Upgrade (Starter → Pro)**
   - Use tenant from Test Case 1
   - Initiate upgrade to Pro
   - Complete payment
   - Verify proration charge created in Stripe
   - Verify:
     - [ ] `tier` updated to "pro"
     - [ ] `monthlyVerificationLimit` updated to 500,000
     - [ ] `enabledChains` includes all 6 chains

   **Test Case 3: Downgrade (Pro → Starter)**
   - Use tenant from Test Case 2
   - Initiate downgrade to Starter
   - Verify proration credit issued
   - Verify:
     - [ ] `tier` updated to "starter"
     - [ ] `monthlyVerificationLimit` updated to 50,000
     - [ ] Next billing period starts at original date

   **Test Case 4: Cancellation**
   - Create new tenant on Starter tier
   - Cancel subscription via Customer Portal
   - Verify:
     - [ ] Subscription marked as `cancel_at_period_end`
     - [ ] Tenant can still verify until period ends
     - [ ] After period ends, `tier` updated to "free"
     - [ ] `stripeSubscriptionId` set to null

   **Test Case 5: Failed Payment**
   - Use Stripe test card that simulates declined payment: `4000 0000 0000 0341`
   - Create subscription
   - Wait for Stripe to retry payment (or trigger via CLI)
   - Verify:
     - [ ] Tenant status set to "suspended"
     - [ ] Verification API returns 401 error
     - [ ] Email sent to tenant (if email configured)

7. **Document Stripe Setup Process** (30 min)
   - Create `STRIPE_SETUP.md` with:
     - How to create Stripe account
     - How to get API keys
     - How to create products
     - How to set up webhook
     - How to test in production
   - Add to repository for future reference

**Validation Criteria:**
- [ ] Stripe test mode configured with valid API keys
- [ ] Products created (Starter $99, Pro $299, Enterprise $999)
- [ ] Checkout flow works end-to-end
- [ ] Webhook endpoint receives events
- [ ] Database updates correctly on subscription events
- [ ] All 5 test cases pass
- [ ] Failed payment handling works
- [ ] Documentation complete

**Rollback Plan:**
- Stripe integration is separate from verification API
- If billing breaks, can temporarily disable upgrade UI
- Manually create subscriptions via Stripe dashboard
- Fix issues and redeploy

---

### Task 1.4: Add Monitoring and Alerting (2 hours)

**Objective:** Detect and respond to production issues before customers complain

**Context:**
- Current state: Zero monitoring, blind to errors
- Risk: Outages go unnoticed, customer churn
- Solution: Sentry for errors, UptimeRobot for uptime, email alerts
- Why critical: Can't run production without knowing if it's working

**Steps:**

1. **Set Up Sentry Error Tracking** (45 min)
   - Create free Sentry account at sentry.io
   - Create new project for "x402-infrastructure"
   - Get DSN (Data Source Name)
   - Install Sentry SDK:
     ```bash
     npm install @sentry/nextjs
     ```
   - Initialize Sentry:
     ```bash
     npx @sentry/wizard -i nextjs
     ```
   - Add DSN to environment variable: `SENTRY_DSN=https://...`
   - Test error capture:
     ```javascript
     // Test endpoint: pages/api/test-sentry.js
     import * as Sentry from '@sentry/nextjs';

     export default function handler(req, res) {
       try {
         throw new Error('Test Sentry integration');
       } catch (error) {
         Sentry.captureException(error);
         res.status(500).json({ error: 'Error logged to Sentry' });
       }
     }
     ```
   - Call `/api/test-sentry` and verify error appears in Sentry dashboard

2. **Add Error Tracking to Critical Paths** (30 min)
   - File: `lib/x402-saas/verification-service.js`
   - Wrap verification calls in try-catch
   - Capture exceptions with context:
     ```javascript
     import * as Sentry from '@sentry/nextjs';

     try {
       const result = await this.verifyPayment(...);
     } catch (error) {
       Sentry.captureException(error, {
         tags: {
           service: 'verification',
           tenant_id: tenantId,
           chain: chain
         },
         extra: {
           tx_hash: txHash,
           amount_usdc: expectedAmount
         }
       });
       throw error;
     }
     ```
   - Add to: BillingService, APIKeyManager, TenantManager

3. **Set Up UptimeRobot Health Checks** (30 min)
   - Create free UptimeRobot account
   - Add HTTP(s) monitor for main app:
     - URL: `https://your-app.onrender.com/api/v1/x402/health`
     - Interval: 5 minutes
     - Alert contacts: Your email
   - Add monitor for Python verifier:
     - URL: `https://x402-python-verifier.onrender.com/health`
     - Interval: 5 minutes
   - Set up alert notifications:
     - Email immediately on downtime
     - Email when service recovers

4. **Create Health Check Dashboard** (15 min)
   - File: `pages/api/v1/x402/health.js` (already exists)
   - Enhance to check:
     - [ ] Database connectivity (Prisma query)
     - [ ] Python verifier reachable (HTTP request)
     - [ ] Redis connectivity (if using Redis)
   - Return 200 if all healthy, 503 if any service down
   - Include details in response:
     ```javascript
     {
       "status": "healthy",
       "timestamp": "2025-11-08T14:30:00Z",
       "checks": {
         "database": { "status": "up", "latency_ms": 12 },
         "python_verifier": { "status": "up", "latency_ms": 45 },
         "redis": { "status": "up", "latency_ms": 3 }
       }
     }
     ```

5. **Set Up Custom Email Alerts** (30 min)
   - Create `lib/x402-saas/alerting.js`
   - Use Resend or SendGrid for email delivery
   - Alert conditions:
     - Error rate > 5% (check every 5 minutes)
     - Quota nearly exceeded (90% of limit)
     - Failed payment (immediate)
     - New paying customer (immediate, positive alert)
   - Example:
     ```javascript
     import { Resend } from 'resend';

     const resend = new Resend(process.env.RESEND_API_KEY);

     export async function sendAlert(type, data) {
       const alerts = {
         high_error_rate: {
           subject: '🚨 High Error Rate Detected',
           html: `Error rate is ${data.error_rate}% in the last 5 minutes.`
         },
         quota_warning: {
           subject: '⚠️ Tenant Approaching Quota Limit',
           html: `Tenant ${data.tenant_id} has used ${data.percent}% of quota.`
         },
         payment_failed: {
           subject: '❌ Payment Failed',
           html: `Payment failed for tenant ${data.tenant_id}.`
         },
         new_customer: {
           subject: '🎉 New Paying Customer!',
           html: `${data.email} upgraded to ${data.tier}.`
         }
       };

       await resend.emails.send({
         from: 'alerts@kamiyo.ai',
         to: 'dev@kamiyo.ai',
         subject: alerts[type].subject,
         html: alerts[type].html
       });
     }
     ```

6. **Test Alerting System** (15 min)
   - Trigger each alert type manually
   - Verify emails received
   - Check Sentry dashboard for errors
   - Confirm UptimeRobot sends downtime alerts
   - Document alert response procedures

**Validation Criteria:**
- [ ] Sentry captures errors with context
- [ ] Health check endpoint returns accurate status
- [ ] UptimeRobot monitors both services
- [ ] Email alerts work for all conditions
- [ ] Response time < 5 minutes for critical alerts
- [ ] Alert fatigue avoided (no spam)

**Rollback Plan:**
- Monitoring is non-invasive, no rollback needed
- Can disable alerts if too noisy
- Sentry can be turned off via environment variable

---

### Task 1.5: Deploy to Production (4 hours)

**Objective:** Ship the production-ready application to Render

**Context:**
- All components tested locally and in staging
- Ready for real-world traffic
- Need careful deployment to avoid downtime

**Steps:**

1. **Pre-Deployment Checklist** (30 min)
   - [ ] All environment variables documented
   - [ ] Database migrations tested
   - [ ] Python verifier deployed and healthy
   - [ ] Stripe configured in test mode first
   - [ ] Monitoring enabled
   - [ ] Health checks passing
   - [ ] Git repository clean (all changes committed)
   - [ ] Backup database (export schema + data)

2. **Set Up Production Database** (30 min)
   - Create production PostgreSQL database on Render
   - Note connection string
   - Add to environment variables: `DATABASE_URL=postgresql://...`
   - Run migrations:
     ```bash
     npx prisma migrate deploy
     ```
   - Verify schema created correctly:
     ```bash
     npx prisma studio  # Check tables exist
     ```

3. **Deploy Main Application to Render** (1 hour)
   - Create new Web Service on Render
   - Connect GitHub repository
   - Branch: `main`
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npm start`
   - Environment variables (copy from local .env):
     - `DATABASE_URL`
     - `NEXTAUTH_SECRET` (generate new for production)
     - `NEXTAUTH_URL=https://kamiyo.ai`
     - `PYTHON_VERIFIER_URL=https://x402-python-verifier.onrender.com`
     - `STRIPE_SECRET_KEY` (use test mode initially)
     - `STRIPE_PUBLISHABLE_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `X402_STRIPE_PRICE_STARTER`
     - `X402_STRIPE_PRICE_PRO`
     - `X402_STRIPE_PRICE_ENTERPRISE`
     - `SENTRY_DSN`
     - `RESEND_API_KEY` (for alerts)
   - Plan: Starter (can upgrade later)
   - Health check path: `/api/v1/x402/health`
   - Deploy

4. **Verify Deployment** (30 min)
   - Check Render logs for errors
   - Visit health check: `https://kamiyo.ai/api/v1/x402/health`
   - Should return 200 with all services "up"
   - Test homepage loads
   - Test API endpoints respond
   - Check Sentry for deployment errors

5. **Configure Custom Domain** (30 min)
   - In Render dashboard, add custom domain: `kamiyo.ai`
   - Add DNS records (Render provides values):
     - CNAME: `kamiyo.ai` → `your-app.onrender.com`
     - CNAME: `www.kamiyo.ai` → `your-app.onrender.com`
   - Wait for DNS propagation (5-30 minutes)
   - Enable auto-SSL (Render provides free SSL via Let's Encrypt)
   - Verify HTTPS works: `https://kamiyo.ai`

6. **Smoke Test Production** (1 hour)

   **Test 1: Create Tenant**
   - Call admin API: `POST /api/v1/x402/admin/create-tenant`
   - Provide admin key (set `X-Admin-Key` header)
   - Body: `{ "email": "test@example.com", "tier": "free" }`
   - Verify tenant created in database
   - Note API key returned (save for testing)

   **Test 2: Verify Payment**
   - Use API key from Test 1
   - Call `POST /api/v1/x402/verify`
   - Provide real transaction hash (use recent Solana tx)
   - Verify response includes verification result
   - Check database for verification record

   **Test 3: Check Usage**
   - Call `GET /api/v1/x402/usage` with API key
   - Verify quota shows 999 remaining (1,000 - 1)

   **Test 4: Dashboard Login**
   - Create user via NextAuth (email: test@example.com)
   - Login to dashboard
   - Verify tenant info displays
   - Verify API keys shown

   **Test 5: Billing Flow**
   - Click "Upgrade to Starter"
   - Complete Stripe checkout (test mode)
   - Verify subscription created
   - Verify tier updated in database

   **Test 6: Monitoring**
   - Check Sentry for errors (should be zero)
   - Check UptimeRobot shows green
   - Verify health check returns 200

7. **Final Production Checklist** (30 min)
   - [ ] All smoke tests pass
   - [ ] No errors in Sentry
   - [ ] Health checks green in UptimeRobot
   - [ ] Database queries performant (< 100ms)
   - [ ] API response times acceptable (< 500ms)
   - [ ] SSL certificate valid
   - [ ] Custom domain working
   - [ ] Monitoring configured
   - [ ] Backup procedures documented
   - [ ] Rollback plan ready

**Validation Criteria:**
- [ ] Application deployed to production
- [ ] Custom domain (kamiyo.ai) working with HTTPS
- [ ] All smoke tests pass
- [ ] Monitoring active and alerting
- [ ] No critical errors in logs
- [ ] Performance meets targets (< 500ms API response)

**Rollback Plan:**
- Render allows instant rollback to previous deployment
- If critical issues, click "Rollback" in Render dashboard
- Points traffic back to previous stable version
- Fix issues, redeploy when ready

---

## Week 2: Launch Preparation (12 hours)

### Task 2.1: Publish Python SDK to PyPI (2 hours)

**Objective:** Make SDK available via `pip install x402` for easy integration

**Context:**
- SDK code complete: `sdks/python/`
- Not yet published to Python Package Index (PyPI)
- Developers expect to install via pip, not git

**Steps:**

1. **Prepare Package for Publication** (30 min)
   - Update `setup.py` with metadata:
     - Version: 1.0.0
     - Author: KAMIYO
     - Description: Official Python SDK for x402 Infrastructure
     - Keywords: x402, payment, verification, crypto, USDC
     - Classifiers (Python versions, license, etc.)
   - Add `README.md` to package (already exists)
   - Add `LICENSE` file (MIT recommended)
   - Create `MANIFEST.in` to include non-code files:
     ```
     include README.md
     include LICENSE
     ```

2. **Test Package Locally** (30 min)
   - Build package:
     ```bash
     cd sdks/python
     python setup.py sdist bdist_wheel
     ```
   - Install locally:
     ```bash
     pip install dist/x402-1.0.0-py3-none-any.whl
     ```
   - Test import:
     ```python
     from x402 import X402Client
     client = X402Client(api_key="test")
     ```
   - Verify no import errors

3. **Create PyPI Account and API Token** (15 min)
   - Sign up at pypi.org
   - Verify email
   - Go to Account Settings → API Tokens
   - Create token with scope "Entire account"
   - Save token securely

4. **Publish to Test PyPI First** (30 min)
   - Upload to test.pypi.org:
     ```bash
     pip install twine
     twine upload --repository testpypi dist/*
     ```
   - Provide username: `__token__`
   - Provide password: [API token from step 3]
   - Verify package appears on test.pypi.org

5. **Test Installation from Test PyPI** (15 min)
   - Install from test PyPI:
     ```bash
     pip install --index-url https://test.pypi.org/simple/ x402
     ```
   - Test basic usage
   - Uninstall: `pip uninstall x402`

6. **Publish to Production PyPI** (15 min)
   - Upload to pypi.org:
     ```bash
     twine upload dist/*
     ```
   - Provide credentials
   - Verify package at pypi.org/project/x402

7. **Update Documentation** (15 min)
   - Update homepage to show:
     ```bash
     pip install x402
     ```
   - Update API docs with installation instructions
   - Add badge to README: ![PyPI](https://img.shields.io/pypi/v/x402)

**Validation Criteria:**
- [ ] Package published to PyPI
- [ ] Can install via `pip install x402`
- [ ] Import works without errors
- [ ] Package metadata correct (author, description, etc.)
- [ ] README displays on PyPI page

---

### Task 2.2: Create Landing Page Highlighting x402 Protocol (4 hours)

**Objective:** Differentiate from generic payment APIs by emphasizing x402 standard

**Context:**
- Current homepage mentions x402 but doesn't explain what it is
- Need to position as "infrastructure for HTTP 402 economy"
- Landing page is first impression for prospects

**Steps:**

1. **Add x402 Protocol Explainer Section** (1.5 hours)
   - Location: `pages/index.js` (after hero section)
   - Content:
     - "What is HTTP 402?" (payment required status code)
     - "What is x402 Protocol?" (standard for micropayments)
     - "Why x402 Matters" (agent economy, API monetization)
   - Visual: Diagram showing traditional payment flow vs x402 flow
   - CTA: "Read the x402 Specification →"

   ```jsx
   <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
     <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
       Built for the x402 Protocol Economy
     </h2>

     <div className="grid md:grid-cols-2 gap-12 mb-12">
       <div className="bg-black border border-gray-500/20 rounded-lg p-8">
         <h3 className="text-xl mb-4 text-cyan">What is HTTP 402?</h3>
         <p className="text-gray-400 mb-4">
           HTTP 402 (Payment Required) is a reserved status code in the HTTP standard,
           originally intended for digital payments. The x402 protocol brings this vision
           to life with crypto micropayments.
         </p>
         <div className="text-sm font-mono text-gray-500">
           HTTP/1.1 402 Payment Required<br/>
           x402-payment-address: [wallet]<br/>
           x402-amount: 0.01 USDC<br/>
           x402-chain: solana
         </div>
       </div>

       <div className="bg-black border border-gray-500/20 rounded-lg p-8">
         <h3 className="text-xl mb-4 text-magenta">Why x402 Matters</h3>
         <ul className="text-gray-400 space-y-3">
           <li>✓ AI agents can pay for services autonomously</li>
           <li>✓ APIs can monetize without complex billing systems</li>
           <li>✓ Micropayments ($0.01 - $10) become economically viable</li>
           <li>✓ No user accounts, credit cards, or KYC required</li>
         </ul>
       </div>
     </div>

     <div className="text-center">
       <LinkButton href="https://x402.org" external>
         Learn More About x402 Protocol →
       </LinkButton>
     </div>
   </section>
   ```

2. **Add "How x402 Works" Flow Diagram** (1 hour)
   - Create visual showing:
     1. User requests resource (GET /data)
     2. Server responds 402 with payment details
     3. User sends USDC to specified address
     4. User submits transaction hash to x402 API
     5. x402 verifies payment
     6. Server grants access
   - Use Mermaid diagram or custom SVG
   - Add to landing page

3. **Add Social Proof Section** (30 min)
   - Show x402scan.com integration
   - List supported chains (12+)
   - Display uptime badge (99.9%)
   - Show verification count (10M+ verified)
   - Add "As seen in" logos (if applicable)

4. **Update Value Proposition** (1 hour)
   - Change from:
     > "Verify crypto payments across 12 blockchains"
   - To:
     > "The verification infrastructure for the x402 protocol economy. Power autonomous payments for AI agents, APIs, and the decentralized web."
   - Update meta description
   - Update hero subheading
   - Add "Built for x402" badge

5. **Test Landing Page** (30 min)
   - Check responsive design (mobile, tablet, desktop)
   - Verify all links work
   - Test page load speed (< 2s target)
   - Run Lighthouse audit (target 90+ score)
   - Fix any accessibility issues

**Validation Criteria:**
- [ ] Landing page explains x402 protocol clearly
- [ ] Visual flow diagram helps understanding
- [ ] Value prop emphasizes protocol positioning
- [ ] Social proof elements build trust
- [ ] Page loads fast and looks professional

---

### Task 2.3: Create Integration Guides (3 hours)

**Objective:** Make it easy for developers to integrate x402 verification

**Context:**
- Developers need step-by-step guides for their tech stack
- Generic docs aren't enough, need specific examples
- Reduce time-to-first-verification

**Steps:**

1. **Create Express.js Integration Guide** (1 hour)
   - Location: Create `docs/integrations/express.md`
   - Content:
     - Install SDK
     - Set up middleware for 402 responses
     - Verify payment before granting access
     - Handle errors
   - Full working example:

   ```javascript
   // docs/integrations/express.md
   const express = require('express');
   const { X402Client } = require('x402-sdk');

   const app = express();
   const x402 = new X402Client({ apiKey: process.env.X402_API_KEY });

   // Middleware to check for payment
   async function requirePayment(req, res, next) {
     const txHash = req.headers['x-payment-hash'];

     if (!txHash) {
       return res.status(402).json({
         error: 'Payment required',
         payment_address: 'YOUR_WALLET_ADDRESS',
         amount_usdc: 1.00,
         chain: 'solana'
       });
     }

     try {
       const result = await x402.verifyPayment({
         txHash,
         chain: req.headers['x-payment-chain'] || 'solana',
         expectedAmount: 1.00
       });

       if (result.verified) {
         next(); // Payment verified, grant access
       } else {
         res.status(402).json({ error: 'Payment not verified' });
       }
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   }

   // Protected endpoint
   app.get('/api/data', requirePayment, (req, res) => {
     res.json({ data: 'Premium data here' });
   });

   app.listen(3000);
   ```

2. **Create Next.js Integration Guide** (1 hour)
   - Location: `docs/integrations/nextjs.md`
   - Show API route example
   - Show client-side payment flow
   - Include TypeScript types

   ```typescript
   // pages/api/premium-data.ts
   import type { NextApiRequest, NextApiResponse } from 'next';
   import { X402Client } from 'x402-sdk';

   const x402 = new X402Client({ apiKey: process.env.X402_API_KEY! });

   export default async function handler(
     req: NextApiRequest,
     res: NextApiResponse
   ) {
     const txHash = req.headers['x-payment-hash'] as string;

     if (!txHash) {
       return res.status(402).json({
         error: 'Payment required',
         payment_address: process.env.PAYMENT_WALLET,
         amount_usdc: 1.00,
         chain: 'solana'
       });
     }

     const result = await x402.verifyPayment({
       txHash,
       chain: (req.headers['x-payment-chain'] as string) || 'solana',
       expectedAmount: 1.00
     });

     if (result.verified) {
       res.status(200).json({ data: 'Premium data' });
     } else {
       res.status(402).json({ error: 'Payment not verified' });
     }
   }
   ```

3. **Create Django Integration Guide** (1 hour)
   - Location: `docs/integrations/django.md`
   - Show view decorator for payment required
   - Include Python SDK usage
   - Add to documentation site

   ```python
   # docs/integrations/django.md
   from django.http import JsonResponse
   from functools import wraps
   from x402 import X402Client

   client = X402Client(api_key=os.getenv('X402_API_KEY'))

   def require_payment(amount_usdc=1.00, chain='solana'):
       def decorator(view_func):
           @wraps(view_func)
           def wrapped_view(request, *args, **kwargs):
               tx_hash = request.META.get('HTTP_X_PAYMENT_HASH')

               if not tx_hash:
                   return JsonResponse({
                       'error': 'Payment required',
                       'payment_address': os.getenv('PAYMENT_WALLET'),
                       'amount_usdc': amount_usdc,
                       'chain': chain
                   }, status=402)

               result = client.verify_payment(
                   tx_hash=tx_hash,
                   chain=request.META.get('HTTP_X_PAYMENT_CHAIN', chain),
                   expected_amount=amount_usdc
               )

               if result.success:
                   return view_func(request, *args, **kwargs)
               else:
                   return JsonResponse({
                       'error': 'Payment not verified'
                   }, status=402)

           return wrapped_view
       return decorator

   # Usage
   @require_payment(amount_usdc=5.00)
   def premium_data(request):
       return JsonResponse({'data': 'Premium data'})
   ```

**Validation Criteria:**
- [ ] 3 integration guides created (Express, Next.js, Django)
- [ ] Each guide includes full working example
- [ ] Code is copy-paste ready
- [ ] Guides published to documentation site

---

### Task 2.4: Record Demo Video (3 hours)

**Objective:** Show x402 verification in action to reduce sales friction

**Context:**
- Video demos convert better than text
- Show complete flow from signup to verification
- 5-minute format is ideal for attention span

**Steps:**

1. **Write Video Script** (30 min)
   - Outline:
     1. Intro (15 sec): "In this video, I'll show you how to add payment verification to your API in 5 minutes"
     2. Problem (30 sec): "Building payment infrastructure is complex..."
     3. Solution (30 sec): "x402 Infrastructure handles this for you"
     4. Demo (3 min): Live coding integration
     5. Outro (15 sec): "Start verifying payments today at kamiyo.ai"
   - Keep it concise, no fluff

2. **Set Up Recording Environment** (30 min)
   - Clean up desktop (close unnecessary apps)
   - Prepare demo code repository
   - Have terminal, browser, code editor ready
   - Test microphone audio quality
   - Use Loom or OBS for screen recording

3. **Record Demo** (1 hour)
   - Follow script
   - Show:
     1. Signup for free account
     2. Get API key from dashboard
     3. Install Python SDK (`pip install x402`)
     4. Write 10 lines of code
     5. Test with real transaction
     6. See verification result
   - Record in one take if possible (edit later if needed)
   - Keep under 5 minutes

4. **Edit Video** (45 min)
   - Remove long pauses
   - Add title card at start
   - Add captions for key points
   - Add CTA at end ("Get started free at kamiyo.ai")
   - Export in 1080p

5. **Publish Video** (15 min)
   - Upload to YouTube
   - Title: "Add Crypto Payment Verification to Your API in 5 Minutes | x402 Infrastructure Tutorial"
   - Description with timestamps and links
   - Tags: x402, crypto payments, USDC, API monetization, blockchain
   - Thumbnail: Screenshot of code with "5 MIN" text

6. **Embed on Website** (15 min)
   - Add video section to homepage
   - YouTube embed code
   - CTA below video: "Ready to start? Sign up free"

**Validation Criteria:**
- [ ] Video under 5 minutes
- [ ] Audio quality good
- [ ] Code clearly visible
- [ ] Published on YouTube
- [ ] Embedded on homepage

---

## Week 3: Customer Acquisition (8 hours)

### Task 3.1: Launch Blog Post and Social Media (2 hours)

**Objective:** Announce launch and drive initial traffic

**Steps:**

1. **Write Launch Blog Post** (1 hour)
   - Title: "Introducing x402 Infrastructure: Payment Verification for the Agent Economy"
   - Content:
     - Why we built this
     - What problems it solves
     - How it works (technical overview)
     - Pricing and availability
     - Call to action (sign up free)
   - Publish on company blog
   - Length: 1,000-1,500 words

2. **Create Twitter Launch Thread** (30 min)
   - Tweet 1: "Today we're launching x402 Infrastructure – payment verification for the HTTP 402 protocol economy 🚀"
   - Tweet 2: Problem statement (complex payment infrastructure)
   - Tweet 3: Solution (1 API call to verify)
   - Tweet 4: Key features (12 chains, sub-500ms, 99.9% uptime)
   - Tweet 5: Pricing (free tier, $99 starter)
   - Tweet 6: Demo video embed
   - Tweet 7: CTA with link
   - Include screenshots, code snippets
   - Use hashtags: #x402 #crypto #API #payments

3. **Post to Relevant Communities** (30 min)
   - Hacker News (Show HN): "Show HN: x402 Infrastructure – Multi-chain payment verification API"
   - Reddit r/CryptoCurrency: Focus on x402 protocol
   - Reddit r/SolanaDevs: Emphasize Solana support
   - Dev.to: Cross-post blog article
   - IndieHackers: Share launch story

**Validation Criteria:**
- [ ] Blog post published
- [ ] Twitter thread posted
- [ ] HN submission live
- [ ] 3+ community posts made

---

### Task 3.2: Reach Out to First 20 Prospects (4 hours)

**Objective:** Personal outreach to generate first customers

**Steps:**

1. **Build Prospect List** (1 hour)
   - Ideal customer profile:
     - Building AI agents with payment needs
     - Running API that wants to monetize
     - Web3 developer needing payment verification
   - Sources:
     - Twitter: Search "AI agent" + "payments"
     - GitHub: Repos using PayAI or ERC-8004
     - Discord: Members of AI agent communities
     - Personal network
   - Target: 20 qualified prospects

2. **Craft Personalized Outreach** (30 min)
   - Template:
     ```
     Hey [Name],

     I saw your work on [specific project]. I'm building x402 Infrastructure –
     it helps developers like you verify crypto payments without building
     infrastructure.

     [Specific value prop for their use case]

     Would you be interested in trying it out? I'm offering free onboarding
     support for the first 20 customers.

     Best,
     [Your name]
     ```
   - Customize for each prospect

3. **Send Outreach Messages** (2 hours)
   - 20 personalized emails or DMs
   - Follow up after 3 days if no response
   - Offer to do demo call
   - Track responses in spreadsheet

4. **Handle Responses** (30 min)
   - Answer questions
   - Schedule demo calls
   - Offer free credits as incentive
   - Get feedback on pain points

**Validation Criteria:**
- [ ] 20 prospects contacted
- [ ] 5+ responses received
- [ ] 2+ demo calls scheduled

---

### Task 3.3: Set Up Feedback Loop (1 hour)

**Objective:** Learn from early customers to improve product

**Steps:**

1. **Add Feedback Form to Dashboard** (30 min)
   - Simple form with:
     - "How would you rate x402 Infrastructure?"
     - "What's missing?"
     - "What would make this better?"
   - Send responses to email or Slack

2. **Schedule Customer Interviews** (30 min)
   - Reach out to first 5 customers
   - Offer $50 Amazon gift card for 30-min call
   - Ask:
     - What brought you to x402?
     - What was confusing during setup?
     - What features do you need most?
     - Would you recommend to others?

**Validation Criteria:**
- [ ] Feedback form live
- [ ] 2+ customer interviews scheduled

---

### Task 3.4: Submit to Product Hunt (1 hour)

**Objective:** Get visibility from startup community

**Steps:**

1. **Prepare Product Hunt Launch** (30 min)
   - Create product listing
   - Add screenshots (dashboard, docs, code)
   - Write compelling tagline
   - Add demo video
   - Set launch date (Tuesday-Thursday best)

2. **Launch Day Activities** (30 min)
   - Post launch at 12:01 AM PT
   - Reply to every comment
   - Share on Twitter
   - Ask friends to upvote
   - Monitor throughout day

**Validation Criteria:**
- [ ] Product Hunt listing live
- [ ] Top 10 in category
- [ ] 50+ upvotes

---

## Week 4: Optimize and Scale (4 hours)

### Task 4.1: Analyze First Week Data (1 hour)

**Objective:** Understand what's working and what's not

**Steps:**

1. **Review Key Metrics** (30 min)
   - Signups: How many free tier accounts?
   - Conversions: How many upgraded to paid?
   - Verifications: How many total payments verified?
   - Errors: Any patterns in failed verifications?
   - Traffic sources: Where did users come from?

2. **Identify Improvement Opportunities** (30 min)
   - Bottlenecks in signup flow
   - Confusing documentation
   - Missing features
   - Pricing concerns
   - Technical issues

**Validation Criteria:**
- [ ] Metrics dashboard created
- [ ] Improvement list prioritized

---

### Task 4.2: Iterate Based on Feedback (2 hours)

**Objective:** Fix issues discovered in first week

**Steps:**

1. **Fix Top 3 User Complaints** (1.5 hours)
   - Based on feedback, address most common issues
   - Examples:
     - Unclear error messages
     - Missing chain support
     - Dashboard UX issues

2. **Add Quick Win Features** (30 min)
   - Features that take < 1 hour but add value
   - Examples:
     - API key labels
     - Usage email alerts
     - Better code examples

**Validation Criteria:**
- [ ] Top complaints addressed
- [ ] User satisfaction improved

---

### Task 4.3: Plan Next Phase (1 hour)

**Objective:** Set roadmap for next 3 months

**Steps:**

1. **Review Evolution Plan** (30 min)
   - Reference X402_INFRASTRUCTURE_EVOLUTION_PLAN.md
   - Identify Phase 2 priorities (Payment Intelligence)
   - Estimate effort for each feature

2. **Create 90-Day Roadmap** (30 min)
   - Month 2 goals
   - Month 3 goals
   - Month 4 goals
   - Share with early customers for input

**Validation Criteria:**
- [ ] Roadmap documented
- [ ] Shared with customers

---

## Success Criteria

### Week 1 Success Criteria
- [ ] Python verifier deployed and healthy
- [ ] Dashboard functional with real data
- [ ] Stripe integration tested and working
- [ ] Monitoring active (Sentry, UptimeRobot)
- [ ] Application deployed to production
- [ ] All smoke tests passing

### Week 2 Success Criteria
- [ ] Python SDK published to PyPI
- [ ] Landing page updated with x402 positioning
- [ ] 3 integration guides published
- [ ] Demo video recorded and published

### Week 3 Success Criteria
- [ ] Launch blog post published
- [ ] Social media announcement made
- [ ] 20 prospects contacted
- [ ] Product Hunt listing live
- [ ] First 5 customers signed up

### Week 4 Success Criteria
- [ ] 20 total customers (free + paid)
- [ ] 3+ paying customers
- [ ] $3K MRR achieved
- [ ] 99.9% uptime maintained
- [ ] 90-day roadmap created

---

## Rollback Procedures

### If Python Verifier Fails
1. Check Render logs for errors
2. Verify environment variables set
3. Test health endpoint directly
4. Rollback to previous deployment if needed
5. Main app will gracefully degrade (return error to users)

### If Database Migration Fails
1. Restore from backup
2. Review migration SQL
3. Test migration on local database
4. Fix issues and re-run

### If Stripe Integration Breaks
1. Disable upgrade UI temporarily
2. Create subscriptions manually in Stripe
3. Fix webhook handling
4. Re-enable UI when fixed

### If Production Deploy Fails
1. Click "Rollback" in Render dashboard
2. Points traffic to previous version
3. Fix issues locally
4. Redeploy when ready

---

## Monitoring and Alerts

### Critical Alerts (Immediate Response Required)
- API error rate > 5%
- Database connectivity lost
- Python verifier down
- Stripe webhook failures

### Warning Alerts (Response Within 1 Hour)
- API response time > 1s
- Quota approaching 90%
- Failed payment detected

### Info Alerts (Daily Review)
- New customer signup
- First payment verified
- Unusual usage patterns

---

## Post-Launch Checklist

### Day 1
- [ ] Monitor logs continuously
- [ ] Respond to customer questions
- [ ] Fix any critical bugs immediately

### Week 1
- [ ] Review all metrics daily
- [ ] Talk to first 5 customers
- [ ] Iterate based on feedback

### Month 1
- [ ] Write case study of successful customer
- [ ] Publish monthly metrics (signups, verifications)
- [ ] Start Phase 2 development (Payment Intelligence)

---

## Resources and Documentation

### Key Files
- `X402_INFRASTRUCTURE_EVOLUTION_PLAN.md` - Long-term strategy
- `DEPLOY_X402_SAAS.md` - Deployment documentation
- `X402_SAAS_REVIEW.md` - Implementation review
- `SEO_OPTIMIZATION_REPORT.md` - SEO strategy

### External Resources
- Render Dashboard: https://dashboard.render.com
- Sentry Dashboard: https://sentry.io
- Stripe Dashboard: https://dashboard.stripe.com
- UptimeRobot: https://uptimerobot.com

### Support Channels
- Email: dev@kamiyo.ai
- Discord: (create channel for customers)
- GitHub Issues: Bug reports

---

## Final Notes

This plan is executable by a Sonnet 4.5 agent with access to:
- Code repository (read/write)
- Deployment platforms (Render, Vercel)
- External services (Stripe, Sentry, etc.)
- Terminal commands
- File system

Each task includes:
- Clear objective
- Step-by-step instructions
- Validation criteria
- Time estimates
- Rollback procedures

The agent should execute tasks sequentially, validating each step before proceeding. If validation fails, the agent should troubleshoot or rollback before continuing.

**Total Estimated Time:** 40 hours over 4 weeks
**Expected Outcome:** Production-ready platform with $3K MRR and 20 customers

---

**Document Version:** 1.0
**Last Updated:** November 8, 2025
**Author:** KAMIYO AI Strategy Team
**Status:** Ready for Execution by Sonnet 4.5 Agent
