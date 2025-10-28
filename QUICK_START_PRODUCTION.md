# KAMIYO Production Deployment - Quick Start Guide

**⚠️ IMPORTANT:** Read this entire guide before deploying to production.

---

## 🚨 Current Status: NOT PRODUCTION READY

**Critical Blockers:**
1. ❌ Using Stripe TEST keys (must switch to LIVE)
2. ❌ ENVIRONMENT=development (must be production)
3. ⚠️  Payment addresses need verification

---

## ⚡ Quick Production Deployment (3 Steps)

### Step 1: Configure Production Environment (5-10 minutes)

Create `.env.production`:

```bash
cp .env .env.production
nano .env.production
```

**Required Changes:**
```bash
# 1. CRITICAL: Set environment
ENVIRONMENT=production

# 2. CRITICAL: Stripe LIVE keys
# Get from: https://dashboard.stripe.com/ (switch to Live mode)
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_KEY_HERE

# 3. CRITICAL: Create production webhook
# URL: https://api.kamiyo.ai/api/v1/webhooks/stripe
STRIPE_WEBHOOK_SECRET=whsec_YOUR_PRODUCTION_WEBHOOK_SECRET

# 4. Verify payment addresses (YOUR production wallets)
X402_BASE_PAYMENT_ADDRESS=0x8595171C4A3d5B9F70585c4AbAAd08613360e643
X402_ETHEREUM_PAYMENT_ADDRESS=0x8595171C4A3d5B9F70585c4AbAAd08613360e643
X402_SOLANA_PAYMENT_ADDRESS=CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY

# 5. Production Alchemy keys (your keys are already set)
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/ezbkII66mmExHt3B6aeKM
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/ezbkII66mmExHt3B6aeKM

# 6. Production domain
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai

# 7. Redis (required for production)
REDIS_URL=redis://localhost:6379/0

# 8. Monitoring (highly recommended)
SENTRY_DSN=https://YOUR_SENTRY_DSN@sentry.io/PROJECT_ID
```

### Step 2: Validate Configuration (1 minute)

```bash
# Validate all production settings
python3 scripts/validate_production_config.py

# If validation passes, you're ready to deploy!
```

### Step 3: Deploy (2-5 minutes)

**Option A: Docker Deployment (Recommended)**
```bash
# One-command deployment
./scripts/deploy_production.sh

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
```

**Option B: Manual Deployment (VPS)**
```bash
# Install Redis
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis

# Start API with production config
source venv/bin/activate
export $(cat .env.production | xargs)
uvicorn api.main_x402:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## ✅ Verification (5 minutes)

### 1. Health Check
```bash
curl https://api.kamiyo.ai/health
# Should return: {"status":"healthy","service":"kamiyo-x402",...}
```

### 2. Test Payment Endpoints
```bash
# Check payment addresses are correct
curl https://api.kamiyo.ai/x402/supported-chains

# Check pricing
curl https://api.kamiyo.ai/x402/pricing
```

### 3. Test CSRF Protection
```bash
# Should fail with 403 (CSRF protection working)
curl -X POST https://api.kamiyo.ai/x402/verify-payment

# Get CSRF token (should succeed)
curl https://api.kamiyo.ai/api/csrf-token
```

### 4. Test Stripe Webhook
```bash
# In Stripe Dashboard:
# - Go to Webhooks
# - Click your production webhook
# - Click "Send test webhook"
# - Check that it's received (200 OK)
```

---

## 🔥 Production Checklist (Must Complete)

### Before Launch
- [ ] `.env.production` created with production values
- [ ] `ENVIRONMENT=production`
- [ ] Stripe LIVE keys configured (not test)
- [ ] Production webhook created in Stripe
- [ ] Payment wallet addresses verified (you control private keys)
- [ ] Alchemy RPC keys configured
- [ ] CORS origins only include production domains
- [ ] Redis installed and running
- [ ] Configuration validated: `python3 scripts/validate_production_config.py`

### DNS & SSL
- [ ] Domain `kamiyo.ai` pointing to server IP
- [ ] Subdomain `api.kamiyo.ai` pointing to server IP
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] HTTPS working: `https://api.kamiyo.ai/health`
- [ ] HTTP → HTTPS redirect working

### Security
- [ ] Firewall configured (only ports 22, 80, 443)
- [ ] SSH key-only authentication (no passwords)
- [ ] Non-root user created for running application
- [ ] Fail2ban installed
- [ ] Security headers verified: https://securityheaders.com/?q=api.kamiyo.ai

### Monitoring
- [ ] Sentry configured for error tracking
- [ ] Uptime monitoring configured (UptimeRobot/StatusCake)
- [ ] Log aggregation configured
- [ ] Backup strategy implemented

### Post-Launch
- [ ] Monitor logs for first hour
- [ ] Test complete payment flow
- [ ] Test subscription creation
- [ ] Verify webhooks working
- [ ] Check error rates in Sentry

---

## 🆘 Troubleshooting

### Issue: Health check fails
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs api

# Or if not using Docker
journalctl -u kamiyo -n 100
```

### Issue: Stripe webhooks failing
```bash
# Check webhook secret is correct
grep STRIPE_WEBHOOK_SECRET .env.production

# Test webhook signature in logs
docker-compose logs api | grep webhook
```

### Issue: Payment verification fails
```bash
# Check RPC endpoints are responding
curl https://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# Check logs for verification errors
docker-compose logs api | grep "payment"
```

### Issue: Redis connection error
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG

# Check Redis URL in config
grep REDIS_URL .env.production
```

---

## 📞 Emergency Contacts

### If Something Goes Wrong
1. **Stop service immediately:**
   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs api > error.log
   ```

3. **Rollback if needed:**
   ```bash
   git checkout <previous-working-commit>
   ./scripts/deploy_production.sh
   ```

### Support Resources
- Stripe Support: https://support.stripe.com/
- Alchemy Status: https://status.alchemy.com/
- FastAPI Docs: https://fastapi.tiangolo.com/
- Docker Docs: https://docs.docker.com/

---

## 📊 Success Criteria

Your deployment is successful when:
- ✅ Health endpoint returns 200: `curl https://api.kamiyo.ai/health`
- ✅ Payment addresses match your wallets: `curl https://api.kamiyo.ai/x402/supported-chains`
- ✅ CSRF protection working (POST without token = 403)
- ✅ Stripe webhooks receiving events (check Stripe Dashboard)
- ✅ No errors in logs for 1 hour
- ✅ Test payment verification works
- ✅ Test subscription creation works

---

## 🎯 Next Steps After Launch

1. **Week 1:** Monitor closely
   - Check logs daily
   - Monitor error rates
   - Verify payment success rates
   - Watch for failed webhooks

2. **Week 2-4:** Optimize
   - Review performance metrics
   - Optimize slow endpoints
   - Scale if needed

3. **Ongoing:** Maintain
   - Weekly security updates
   - Monthly dependency updates
   - Quarterly security audits
   - Regular backup testing

---

## 📚 Additional Documentation

- **Full Deployment Guide:** `PRODUCTION_READINESS_CHECKLIST.md`
- **Refactoring Summary:** `X402_REFACTORING_COMPLETE.md`
- **API Documentation:** https://api.kamiyo.ai/docs (after deployment)

---

**Ready to deploy?** Run: `python3 scripts/validate_production_config.py`
