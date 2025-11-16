# KAMIYO Post-Launch Verification Guide

**Purpose:** Step-by-step checklist to verify all systems after production deployment
**Timeline:** Complete within 1 hour of launch
**Owner:** Operations Team / On-Call Engineer

---

## Quick Start

Run the automated verification script:

```bash
# Local verification (development environment)
python3 scripts/pre_launch_verification.py

# Production verification (tests live URLs)
python3 scripts/pre_launch_verification.py --production
```

---

## Within 1 Hour of Launch

### 1. Service Health ✅

**API Health:**
```bash
# Check API health endpoint
curl -s https://api.kamiyo.ai/health | jq

# Expected output:
# {
#   "status": "healthy",
#   "timestamp": "2025-10-29T...",
#   "environment": "production",
#   "version": "1.0.0"
# }
```

**API Ready:**
```bash
# Check API readiness (dependencies)
curl -s https://api.kamiyo.ai/ready | jq

# Expected output:
# {
#   "status": "ready",
#   "database": "connected",
#   "redis": "connected"
# }
```

**Frontend:**
```bash
# Check frontend is accessible
curl -I https://kamiyo.ai

# Expected output:
# HTTP/2 200
# content-type: text/html
```

**Check all services in Render dashboard:**
- [ ] kamiyo-api: Healthy ✅
- [ ] kamiyo-frontend: Healthy ✅
- [ ] kamiyo-aggregator: Running ✅
- [ ] kamiyo-postgres: Healthy ✅

---

### 2. Error Monitoring ✅

**Sentry Dashboard:**
```
URL: https://sentry.io/organizations/kamiyo/issues/
```

- [ ] No critical errors in last hour
- [ ] Error rate < 0.1%
- [ ] No repeated error patterns
- [ ] Release tagged correctly

**Check Logs in Render:**
```bash
# View recent API logs
render logs --service kamiyo-api --tail 100

# View recent frontend logs
render logs --service kamiyo-frontend --tail 100
```

Look for:
- ❌ ERROR level messages
- ❌ Stack traces
- ❌ Database connection errors
- ❌ Payment processing errors

---

### 3. User Signup Flow ✅

**Test user registration:**

1. **Visit frontend:**
   ```
   https://kamiyo.ai
   ```

2. **Click "Get Started" or "Sign Up"**
   - Should redirect to NextAuth sign-in page
   - Google OAuth should work
   - Email verification should send

3. **Complete signup:**
   - User record created in database
   - Email confirmation sent
   - Redirected to dashboard

4. **Verify in database:**
   ```bash
   # Connect to production database
   psql $DATABASE_URL -c "SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 5;"
   ```

**Expected:** New user appears in database

---

### 4. Payment Processing ✅

#### **4a. Stripe Subscription Test**

**Test Personal Tier ($19/mo):**

1. Visit pricing page: `https://kamiyo.ai/pricing`
2. Click "Subscribe - $19/mo"
3. Complete Stripe checkout (use test card: `4242 4242 4242 4242`)
4. Verify webhook received:
   ```bash
   # Check API logs for Stripe webhook
   render logs --service kamiyo-api --tail 100 | grep "stripe_webhook"
   ```
5. Verify subscription in dashboard
6. Verify database:
   ```bash
   psql $DATABASE_URL -c "SELECT user_id, tier, status FROM subscriptions ORDER BY created_at DESC LIMIT 5;"
   ```

**Expected Results:**
- ✅ Checkout completes successfully
- ✅ Webhook received and processed
- ✅ User tier updated to "personal"
- ✅ Subscription status: "active"
- ✅ Invoice sent via Stripe

#### **4b. x402 Payment Test**

**Test USDC payment on Base:**

1. **Get payment address:**
   ```bash
   curl -s https://api.kamiyo.ai/api/v1/x402/payment-address
   ```

2. **Send test payment:**
   - Send $1.00 USDC to the provided Base address
   - Use MetaMask or another wallet
   - Wait for 6 confirmations (~30 seconds)

3. **Verify payment detected:**
   ```bash
   # Check payment status
   curl -s https://api.kamiyo.ai/api/v1/x402/payments | jq
   ```

4. **Verify token generated:**
   ```bash
   # Get token (should be in payment response)
   TOKEN="<your-token-here>"

   # Test API call with token
   curl -H "x-payment-token: $TOKEN" https://api.kamiyo.ai/api/v1/exploits/search?q=metamask
   ```

**Expected Results:**
- ✅ Payment detected after 6 confirmations
- ✅ Token generated (1000 requests)
- ✅ API call succeeds with token
- ✅ Rate limiting works (1000 requests per $1)

---

### 5. API Endpoints ✅

**Test critical endpoints:**

```bash
# Public endpoints (no auth)
curl -s https://api.kamiyo.ai/health
curl -s https://api.kamiyo.ai/ready
curl -s https://api.kamiyo.ai/api/v1/exploits/latest | jq

# Protected endpoints (requires auth)
# Get API key from dashboard first
API_KEY="your-api-key-here"

curl -H "Authorization: Bearer $API_KEY" \
     -s https://api.kamiyo.ai/api/v1/exploits/search?q=uniswap | jq

# MCP endpoints (requires MCP subscription)
curl -H "Authorization: Bearer $API_KEY" \
     -s https://api.kamiyo.ai/api/v1/mcp/risk-assessment \
     -d '{"address": "0x..."}' | jq
```

**Expected Results:**
- ✅ All endpoints respond within 500ms (p95)
- ✅ Correct HTTP status codes
- ✅ Valid JSON responses
- ✅ Authentication works
- ✅ Rate limiting enforced

---

### 6. Frontend Loading ✅

**Test all critical pages:**

```bash
# Homepage
curl -I https://kamiyo.ai

# Pricing
curl -I https://kamiyo.ai/pricing

# Features
curl -I https://kamiyo.ai/features

# API Docs
curl -I https://kamiyo.ai/api-docs

# Legal pages
curl -I https://kamiyo.ai/privacy
curl -I https://kamiyo.ai/terms

# Dashboard (requires auth)
curl -I https://kamiyo.ai/dashboard
```

**Performance check:**
```bash
# Use WebPageTest or Lighthouse
# Target: < 2 seconds load time
```

**Expected Results:**
- ✅ All pages return HTTP 200
- ✅ HTTPS enforced (HTTP redirects to HTTPS)
- ✅ Load time < 2 seconds
- ✅ No JavaScript errors in console
- ✅ Mobile responsive

---

### 7. Monitoring Data Collection ✅

**UptimeRobot:**
```
URL: https://uptimerobot.com/dashboard
```

- [ ] All 4 monitors are "Up" ✅
- [ ] Check interval: 5 minutes
- [ ] Response time < 500ms
- [ ] No alerts triggered

**Sentry:**
```
URL: https://sentry.io/organizations/kamiyo/
```

- [ ] Events being collected
- [ ] No critical errors
- [ ] Error rate < 0.1%
- [ ] Performance tracking active

**Render Dashboard:**
```
URL: https://dashboard.render.com/
```

- [ ] All services healthy
- [ ] CPU usage normal (<70%)
- [ ] Memory usage normal (<80%)
- [ ] No failed deployments

---

## Within 24 Hours of Launch

### 8. Performance Metrics ✅

**API Performance:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.kamiyo.ai/health

# Create curl-format.txt:
# time_namelookup:    %{time_namelookup}s\n
# time_connect:       %{time_connect}s\n
# time_starttransfer: %{time_starttransfer}s\n
# time_total:         %{time_total}s\n
```

**Expected:**
- p50 response time: < 200ms
- p95 response time: < 500ms
- p99 response time: < 1000ms

**Database Performance:**
```bash
# Check slow queries
psql $DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Expected:**
- No queries > 100ms average
- Connection pool healthy
- No connection leaks

---

### 9. Error Rate ✅

**Sentry Dashboard:**

Target: Error rate < 0.1% (1 error per 1000 requests)

```
Total Requests: [check metric]
Total Errors:   [check metric]
Error Rate:     [calculate: errors/requests * 100]
```

**If error rate > 0.1%:**
1. Identify top errors in Sentry
2. Check if errors are critical or benign
3. Create GitHub issues for critical errors
4. Plan hotfix if needed

---

### 10. User Feedback ✅

**Monitor support channels:**

- [ ] Check support@kamiyo.ai inbox
- [ ] Check Discord/Slack (if applicable)
- [ ] Check Twitter mentions
- [ ] Review user-reported issues

**Common first-day issues:**
- Login problems
- Payment processing issues
- Slow page loads
- Missing features
- Confusing UX

---

### 11. Security Incidents ✅

**Check for security issues:**

- [ ] No failed login attempts (brute force)
- [ ] No SQL injection attempts
- [ ] No DDoS attacks
- [ ] No unauthorized API access
- [ ] No data leaks

**Review logs for suspicious activity:**
```bash
# Check for failed auth attempts
render logs --service kamiyo-api | grep "authentication_failed"

# Check for rate limit hits
render logs --service kamiyo-api | grep "rate_limit_exceeded"

# Check for 401/403 errors
render logs --service kamiyo-api | grep "HTTP 401\|HTTP 403"
```

---

### 12. Backups ✅

**Verify database backups:**

```bash
# Check Render backup status
render backups list --service kamiyo-postgres

# Expected: Backup completed successfully today
```

**Test backup restoration (if time permits):**
```bash
# Create test restore (don't overwrite production!)
render backups restore --service kamiyo-postgres-test --backup <backup-id>
```

---

### 13. Monitoring Dashboards ✅

**Review all monitoring dashboards:**

1. **Render Dashboard:**
   - Service health
   - Resource utilization
   - Deployment status
   - Logs

2. **Sentry Dashboard:**
   - Error trends
   - Performance metrics
   - User impact
   - Release health

3. **UptimeRobot Dashboard:**
   - Uptime percentage
   - Response times
   - Alert history
   - Status page

4. **Stripe Dashboard:**
   - Successful payments
   - Failed payments
   - MRR (Monthly Recurring Revenue)
   - Churn rate

---

## Within 1 Week of Launch

### 14. Post-Launch Retrospective ✅

**Schedule team meeting to discuss:**

- What went well?
- What went wrong?
- What surprised us?
- What should we improve for next time?

**Document lessons learned:**
```
Location: docs/POST_LAUNCH_RETROSPECTIVE.md
```

---

### 15. Action Items ✅

**From retrospective, create action items:**

- [ ] Bug fixes
- [ ] Performance optimizations
- [ ] Documentation updates
- [ ] Monitoring improvements
- [ ] Process improvements

**Track in GitHub Issues:**
```
Label: post-launch
Milestone: Post-Launch Improvements
```

---

### 16. Monitoring and Alerts Tuning ✅

**Review alert thresholds:**

Based on actual production metrics, adjust:
- Error rate thresholds
- Response time thresholds
- Resource utilization thresholds
- Alert fatigue (too many false positives?)

**Update alerts in:**
- UptimeRobot
- Sentry
- PagerDuty
- Render

---

### 17. Documentation Updates ✅

**Update docs based on learnings:**

- [ ] Fix inaccuracies in deployment guide
- [ ] Add troubleshooting tips
- [ ] Update runbooks with actual incidents
- [ ] Document workarounds
- [ ] Update FAQ

---

## Rollback Procedure

**If critical issues are detected:**

### Emergency Rollback Steps

1. **Assess severity:**
   - SEV1 (Critical): Service down, data loss, security breach
   - SEV2 (High): Degraded performance, payment issues
   - SEV3 (Medium): Minor bugs, cosmetic issues

2. **For SEV1/SEV2 issues, rollback:**
   ```bash
   # Rollback to previous deployment
   cd /path/to/kamiyo
   git log --oneline -10  # Find previous good commit
   git checkout <previous-commit>
   git push mizuki main --force

   # Render will auto-deploy the rollback
   ```

3. **Verify rollback:**
   ```bash
   # Check API health
   curl https://api.kamiyo.ai/health

   # Check frontend
   curl https://kamiyo.ai
   ```

4. **Communicate:**
   - Update status page
   - Notify users (if needed)
   - Inform team in #incidents channel

5. **Post-mortem:**
   - Document what happened
   - Root cause analysis
   - Corrective actions
   - Timeline of events

---

## Success Criteria

Launch is considered successful if:

- ✅ All services healthy for 24 hours
- ✅ Error rate < 0.1%
- ✅ No critical incidents
- ✅ No data loss
- ✅ No security incidents
- ✅ Payment processing working
- ✅ User signup working
- ✅ Performance within SLOs
- ✅ Monitoring collecting data
- ✅ Backups completed successfully
- ✅ No rollback required

---

## Quick Reference Commands

```bash
# Check all service health
curl -s https://api.kamiyo.ai/health | jq
curl -s https://api.kamiyo.ai/ready | jq
curl -I https://kamiyo.ai

# View logs
render logs --service kamiyo-api --tail 100
render logs --service kamiyo-frontend --tail 100

# Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# Run tests
pytest tests/x402/test_e2e_payment_flow.py -v
pytest tests/test_stripe_e2e.py -v

# Check deployments
render deployments --service kamiyo-api --limit 5

# Force redeploy if needed
render services restart --service kamiyo-api
```

---

## Contacts

**Emergency Contacts:**
- On-Call Engineer: [Phone]
- Engineering Lead: [Phone]
- Infrastructure Lead: [Phone]

**Vendor Support:**
- Render Support: support@render.com
- Stripe Support: https://dashboard.stripe.com/support
- Sentry Support: support@sentry.io

**Internal Channels:**
- Incidents: #incidents (Slack/Discord)
- Deployments: #deployments
- On-Call: #on-call

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-29
**Owner:** Operations Team
