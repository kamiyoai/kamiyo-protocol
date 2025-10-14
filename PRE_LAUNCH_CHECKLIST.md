# KAMIYO PRE-LAUNCH CHECKLIST
## Final Steps Before Production Deployment

**Date:** October 14, 2025
**Status:** Ready for Render.com Configuration

---

## ✅ COMPLETED (Code-Side)

### Security Enhancements
- [x] Content-Security-Policy header added to `api/main.py:142-150`
- [x] All security headers implemented (7/7)
- [x] PCI logging filter operational
- [x] Rate limiting middleware active
- [x] HTTPS enforcement in production

### Secrets Generated
- [x] JWT_SECRET: `UxNuSyJ9rz/jNPeiP/+n2o+6wV4ve6HeNUoKiMXbqgQzw7XTHfP4hDFYQndnz556`
- [x] NEXTAUTH_SECRET: `52Zx+1JZ0nuHd8PoyAcjdJy8IAk1R92GNGkQ5l2u3Sw=`
- [x] ADMIN_API_KEY: `4d131e88c61822ea1feb0d8125e7832d3aab5fc0e5825a8a711c67aec44c847d`

### Documentation
- [x] Launch configuration guide created (`LAUNCH_CONFIGURATION.md`)
- [x] All environment variables documented
- [x] Stripe setup instructions provided
- [x] Security best practices documented

---

## 📋 TODO: Render.com Dashboard Configuration (25 minutes)

### Step 1: Configure kamiyo-api Service (15 minutes)

**Go to:** Render Dashboard → kamiyo-api → Environment

**Add these environment variables:**

```bash
# Critical Secrets
JWT_SECRET=UxNuSyJ9rz/jNPeiP/+n2o+6wV4ve6HeNUoKiMXbqgQzw7XTHfP4hDFYQndnz556
ADMIN_API_KEY=4d131e88c61822ea1feb0d8125e7832d3aab5fc0e5825a8a711c67aec44c847d

# CORS Configuration
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai

# Stripe (get from Stripe Dashboard - Live mode keys)
STRIPE_SECRET_KEY=sk_live_... (from Stripe Dashboard)
STRIPE_PUBLISHABLE_KEY=pk_live_... (from Stripe Dashboard)
STRIPE_WEBHOOK_SECRET=whsec_... (after creating webhook endpoint)

# Environment
ENVIRONMENT=production
```

**Verification:**
- [ ] All 7 variables added
- [ ] Stripe keys start with `sk_live_` and `pk_live_`
- [ ] ALLOWED_ORIGINS uses HTTPS only
- [ ] Clicked "Save Changes"

---

### Step 2: Configure kamiyo-frontend Service (10 minutes)

**Go to:** Render Dashboard → kamiyo-frontend → Environment

**Add these environment variables:**

```bash
# Authentication
NEXTAUTH_SECRET=52Zx+1JZ0nuHd8PoyAcjdJy8IAk1R92GNGkQ5l2u3Sw=
NEXTAUTH_URL=https://kamiyo.ai

# Stripe (same publishable key as backend)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... (same as backend)
```

**Verification:**
- [ ] All 3 variables added
- [ ] NEXTAUTH_URL matches your production domain
- [ ] Stripe key matches backend configuration
- [ ] Clicked "Save Changes"

---

### Step 3: Create Stripe Webhook (5 minutes)

**Go to:** https://dashboard.stripe.com → Developers → Webhooks

**Steps:**
1. [ ] Click "+ Add endpoint"
2. [ ] Endpoint URL: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
3. [ ] Select events:
   - [ ] `customer.subscription.created`
   - [ ] `customer.subscription.updated`
   - [ ] `customer.subscription.deleted`
   - [ ] `invoice.payment_succeeded`
   - [ ] `invoice.payment_failed`
4. [ ] Click "Add endpoint"
5. [ ] Click the endpoint → "Reveal" signing secret
6. [ ] Copy the `whsec_...` value
7. [ ] Add to Render (kamiyo-api) as `STRIPE_WEBHOOK_SECRET`

---

## 🧪 POST-CONFIGURATION VALIDATION

### Automatic Validation (Render will do this)

Once you save changes in Render:
- Services will automatically redeploy
- Wait 3-5 minutes for deployment
- Check logs for startup success

### Manual Validation (Do these after deploy)

**1. Test API Health:**
```bash
curl https://api.kamiyo.ai/health

# Expected: HTTP 200 with JSON
{
  "status": "healthy",
  "database_exploits": 431,
  ...
}
```
- [ ] Returns 200 OK
- [ ] No error messages

**2. Test Frontend:**
```bash
curl https://kamiyo.ai/

# Expected: HTTP 200 with HTML
```
- [ ] Returns 200 OK
- [ ] Returns HTML (not error page)

**3. Check API Logs (Render Dashboard):**
- [ ] No "JWT_SECRET not set" error
- [ ] No "STRIPE_SECRET_KEY not set" warning
- [ ] See: "Kamiyo API starting up..."
- [ ] See: "Database exploits: 431"
- [ ] See: "WebSocket manager started"

**4. Check Frontend Logs:**
- [ ] No authentication errors
- [ ] Server started successfully
- [ ] No NEXTAUTH errors

**5. Test Security Headers:**
```bash
curl -I https://api.kamiyo.ai/health

# Should include these headers:
# Content-Security-Policy: default-src 'self'; ...
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Strict-Transport-Security: max-age=31536000; includeSubDomains
```
- [ ] All 7 security headers present

**6. Test Rate Limiting:**
```bash
# Make 15 quick requests
for i in {1..15}; do
  curl https://api.kamiyo.ai/exploits?page=1&page_size=10
done

# After 10 requests, should see:
# HTTP 429 - Too Many Requests
```
- [ ] Rate limiting working (returns 429)

**7. Test Stripe Webhook (Stripe Dashboard):**
- [ ] Go to Developers → Webhooks → Your endpoint
- [ ] Click "Send test webhook"
- [ ] Select `customer.subscription.created`
- [ ] Check Render logs for: "Received webhook: customer.subscription.created"

---

## 🚨 TROUBLESHOOTING

### Issue: "JWT_SECRET not set" in logs
**Solution:** Go back to Render Dashboard → kamiyo-api → Environment → Verify JWT_SECRET is set → Redeploy

### Issue: CORS errors in browser
**Solution:** Check ALLOWED_ORIGINS includes your domain with HTTPS → Restart kamiyo-api

### Issue: Payment flow fails
**Solution:**
1. Verify Stripe keys are LIVE mode (not test)
2. Check webhook secret matches Stripe
3. Test webhook delivery in Stripe Dashboard

### Issue: NextAuth errors
**Solution:** Verify NEXTAUTH_SECRET and NEXTAUTH_URL are set correctly

---

## 📊 SUCCESS CRITERIA

**Launch is ready when:**

✅ All environment variables configured in Render
✅ Services deployed successfully (no errors in logs)
✅ API health endpoint returns 200
✅ Frontend loads without errors
✅ Security headers present in responses
✅ Rate limiting working (429 after limit)
✅ Stripe webhook receiving test events
✅ No critical errors in logs for 10 minutes

---

## 📞 SUPPORT CONTACTS

### If You Need Help:

**Render Support:**
- Email: support@render.com
- Status: https://status.render.com

**Stripe Support:**
- Dashboard: https://support.stripe.com
- Status: https://status.stripe.com

**Documentation:**
- Full guide: `LAUNCH_CONFIGURATION.md`
- Security audit: `SECURITY_AUDIT_REPORT.md`
- Deployment runbook: `docs/DEPLOYMENT_RUNBOOK.md`

---

## ⏱️ ESTIMATED TIME

- **Render Configuration:** 15 minutes
- **Stripe Webhook Setup:** 5 minutes
- **Validation:** 5 minutes
- **Total:** 25 minutes

---

## 🎯 WHAT'S NEXT?

After successful configuration and validation:

1. **Monitor First Hour:**
   - Watch logs continuously
   - Test all major flows
   - Check for any errors

2. **Week 1 Monitoring:**
   - See: `PRODUCTION_READINESS_100_PERCENT.md` → "Post-Launch Monitoring"
   - Daily health checks
   - Review user feedback
   - Monitor performance metrics

3. **Week 2 Actions:**
   - Schedule Stripe API upgrade (P1 priority)
   - Review first week metrics
   - Address any issues found
   - Plan capacity scaling if needed

---

## ✅ FINAL CHECK

Before clicking "Deploy" in Render:

- [ ] Read `LAUNCH_CONFIGURATION.md` fully
- [ ] All secrets generated and documented
- [ ] Stripe Dashboard ready (Live mode keys)
- [ ] Team notified of deployment
- [ ] Incident response plan reviewed (`docs/INCIDENT_RESPONSE.md`)
- [ ] Monitoring dashboards ready
- [ ] This checklist completed

---

**You're ready to launch! 🚀**

**Next step:** Configure environment variables in Render Dashboard (25 minutes)

---

**Document Version:** 1.0
**Last Updated:** October 14, 2025
**Status:** Ready for Configuration
