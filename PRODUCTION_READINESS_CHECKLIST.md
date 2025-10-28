# KAMIYO Production Deployment Checklist
**Date:** 2025-10-27
**Status:** 🔴 NOT READY - Critical Items Required

---

## 🚨 CRITICAL BLOCKERS (Must Fix Before Launch)

### 1. Stripe Keys - **BLOCKER**
**Current Status:** ❌ Using TEST keys
```bash
STRIPE_SECRET_KEY=sk_test_...  # ❌ MUST CHANGE TO LIVE
```

**Required Actions:**
1. Switch to Stripe Live Mode:
   - Go to https://dashboard.stripe.com/
   - Toggle from "Test mode" to "Live mode" (top right)
   - Get new API keys from https://dashboard.stripe.com/apikeys

2. Update `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY
   STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_KEY
   ```

3. Create new webhook for production:
   - URL: `https://api.kamiyo.ai/api/v1/webhooks/stripe`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Get webhook secret: `whsec_...`

### 2. Environment Variable - **BLOCKER**
**Current Status:** ❌ Development mode
```bash
ENVIRONMENT=development  # ❌ MUST CHANGE TO PRODUCTION
```

**Required Action:**
```bash
ENVIRONMENT=production
```

### 3. Payment Wallet Security - **VERIFY**
**Current Addresses:**
```
Base:     0x8595171C4A3d5B9F70585c4AbAAd08613360e643
Ethereum: 0x8595171C4A3d5B9F70585c4AbAAd08613360e643
Solana:   CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY
```

**Critical Questions:**
- [ ] Do you control the private keys for these addresses?
- [ ] Are these addresses ONLY for production (not dev/test)?
- [ ] Have you backed up the private keys securely?
- [ ] Are these addresses monitored for incoming payments?

### 4. Domain & SSL - **BLOCKER**
**Required Setup:**
- [ ] Domain purchased and configured: `kamiyo.ai`
- [ ] DNS A record pointing to server IP
- [ ] SSL certificate installed (Let's Encrypt recommended)
- [ ] HTTPS working (test: https://api.kamiyo.ai/health)
- [ ] HTTP → HTTPS redirect enabled

### 5. CORS Origins - **BLOCKER**
**Current Status:** Includes localhost
```bash
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai
```

**Required Action:**
Remove all localhost origins in production `.env`

---

## ⚠️ HIGH PRIORITY (Required for Production)

### 6. Redis Cache - **REQUIRED**
**Current Status:** ❌ Not running (optional for dev)

**Why Required:**
- Rate limiting will use in-memory (not shared across processes)
- Cache won't work across multiple workers
- Performance degradation under load

**Setup:**
```bash
# Option 1: Local Redis (if single server)
apt-get install redis-server
systemctl start redis
systemctl enable redis

# Option 2: Redis Cloud (recommended for multi-server)
# Get from: https://redis.com/try-free/
REDIS_URL=redis://:<password>@<host>:6379/0
```

### 7. Database - **RECOMMEND UPGRADE**
**Current Status:** SQLite (development)

**Production Recommendation:** PostgreSQL
```bash
# Install PostgreSQL
apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb kamiyo_prod
sudo -u postgres createuser kamiyo

# Update .env
DATABASE_URL=postgresql://kamiyo:<password>@localhost:5432/kamiyo_prod
```

**If staying with SQLite:**
- [ ] Database file has proper permissions (not world-readable)
- [ ] Regular backups configured
- [ ] File stored on persistent storage (not /tmp)

### 8. Monitoring & Logging - **REQUIRED**

**Error Tracking (Sentry):**
```bash
# Sign up: https://sentry.io/
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production
```

**Logging:**
```bash
LOG_LEVEL=INFO  # Not DEBUG in production
LOG_FORMAT=json  # Structured logging for analysis
```

### 9. Process Manager - **REQUIRED**
**Don't run with:** `python api/main_x402.py` (no auto-restart)

**Option 1: Systemd (Recommended for VPS)**
Create `/etc/systemd/system/kamiyo.service`:
```ini
[Unit]
Description=KAMIYO x402 Payment Facilitator
After=network.target

[Service]
Type=simple
User=kamiyo
WorkingDirectory=/opt/kamiyo
Environment="PATH=/opt/kamiyo/venv/bin"
ExecStart=/opt/kamiyo/venv/bin/uvicorn api.main_x402:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Option 2: Docker (Recommended for Cloud)**
See `DOCKER_DEPLOYMENT.md` (I'll create this next)

### 10. Firewall Configuration - **REQUIRED**
```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 443/tcp   # HTTPS
ufw deny 8000/tcp   # Block direct API access
ufw enable
```

Use reverse proxy (nginx/caddy) in front of API.

---

## 📋 MEDIUM PRIORITY (Strongly Recommended)

### 11. Reverse Proxy (Nginx/Caddy)
**Why:** Handle SSL termination, rate limiting, DDoS protection

**Nginx Configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.kamiyo.ai;

    ssl_certificate /etc/letsencrypt/live/api.kamiyo.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.kamiyo.ai/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 12. Backup Strategy
```bash
# Database backups
0 2 * * * /opt/kamiyo/scripts/backup_database.sh

# .env backup (encrypted)
0 3 * * * gpg --encrypt --recipient admin@kamiyo.ai /opt/kamiyo/.env

# Upload to S3/B2
aws s3 sync /opt/kamiyo/backups s3://kamiyo-backups/
```

### 13. Health Check Monitoring
Set up external monitoring:
- UptimeRobot: https://uptimerobot.com/
- StatusCake: https://www.statuscake.com/
- Pingdom: https://www.pingdom.com/

Monitor: `https://api.kamiyo.ai/health`

### 14. Rate Limiting Configuration
**Verify limits are production-appropriate:**
```bash
RATE_LIMIT_FREE=10         # Requests per minute for free tier
RATE_LIMIT_BASIC=100       # Basic tier
RATE_LIMIT_PRO=1000        # Pro tier ($89/month)
RATE_LIMIT_ENTERPRISE=10000  # Enterprise ($499/month)
```

---

## ✅ SECURITY CHECKLIST

### Pre-Launch Security Audit
- [ ] **ENVIRONMENT=production** (blocks dev defaults)
- [ ] **Stripe LIVE keys** (not test)
- [ ] **Strong X402_ADMIN_KEY** (64+ chars random)
- [ ] **CSRF_SECRET_KEY** changed from default
- [ ] **JWT_SECRET** changed from default (if using)
- [ ] **No default passwords** in any config
- [ ] **CORS origins** only allow production domains
- [ ] **Firewall rules** configured
- [ ] **SSH key-only** authentication (no password login)
- [ ] **Fail2ban** installed and configured
- [ ] **TLS 1.3** enabled (disable TLS 1.0/1.1)

### Runtime Security
- [ ] **HTTPS only** (HSTS header enabled)
- [ ] **CSRF protection** enabled and tested
- [ ] **Rate limiting** active (test: excessive requests → 429)
- [ ] **PCI logging** filter active (no card numbers in logs)
- [ ] **Error messages** don't leak sensitive info
- [ ] **Security headers** present (check: securityheaders.com)

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Pre-Deployment Checklist
```bash
# 1. Verify all blockers resolved
grep "STRIPE_SECRET_KEY=sk_live" .env  # Should return live key
grep "ENVIRONMENT=production" .env      # Should return production

# 2. Test startup locally with production config
ENVIRONMENT=production python api/main_x402.py

# 3. Run security validation
python test_startup_security.py
```

### Step 2: Server Setup
```bash
# 1. Install dependencies
apt-get update
apt-get install -y python3.11 python3.11-venv nginx redis-server postgresql certbot

# 2. Create application user
useradd -m -s /bin/bash kamiyo
su - kamiyo

# 3. Clone repository
git clone https://github.com/yourusername/kamiyo.git /opt/kamiyo
cd /opt/kamiyo

# 4. Setup virtual environment
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 5. Copy and configure .env
cp .env.example .env.production
nano .env.production  # Edit with production values
ln -s .env.production .env

# 6. Test configuration
python test_startup_security.py
```

### Step 3: SSL Certificate
```bash
# Using Let's Encrypt (free)
certbot certonly --nginx -d api.kamiyo.ai

# Verify auto-renewal
certbot renew --dry-run
```

### Step 4: Start Services
```bash
# Start Redis
systemctl start redis
systemctl enable redis

# Start KAMIYO
systemctl start kamiyo
systemctl enable kamiyo

# Check status
systemctl status kamiyo
journalctl -u kamiyo -f  # Follow logs
```

### Step 5: Verify Deployment
```bash
# 1. Health check
curl https://api.kamiyo.ai/health

# 2. Test HTTPS redirect
curl -I http://api.kamiyo.ai/health  # Should 301 → https://

# 3. Test payment endpoints
curl https://api.kamiyo.ai/x402/pricing

# 4. Test CSRF protection
curl -X POST https://api.kamiyo.ai/x402/verify-payment  # Should 403

# 5. Monitor logs
tail -f /var/log/kamiyo/api.log
```

---

## 📊 POST-LAUNCH MONITORING

### Day 1 (Launch Day)
- [ ] Monitor error rate in Sentry
- [ ] Check payment verification success rate
- [ ] Monitor API response times
- [ ] Watch for failed Stripe webhooks
- [ ] Check SSL certificate valid
- [ ] Verify all endpoints accessible

### Week 1
- [ ] Review error logs daily
- [ ] Monitor payment success rate
- [ ] Check Redis memory usage
- [ ] Review rate limiting effectiveness
- [ ] Analyze API usage patterns
- [ ] Test backup restoration

### Ongoing
- [ ] Weekly security updates
- [ ] Monthly SSL certificate renewal check
- [ ] Quarterly security audit
- [ ] Regular backup testing

---

## 🆘 ROLLBACK PLAN

### If Issues Occur
1. **Stop service immediately:**
   ```bash
   systemctl stop kamiyo
   ```

2. **Check logs:**
   ```bash
   journalctl -u kamiyo -n 100
   tail -f /var/log/kamiyo/api.log
   ```

3. **Rollback to previous version:**
   ```bash
   git checkout <previous-commit>
   systemctl restart kamiyo
   ```

4. **Emergency contacts:**
   - Keep this list updated with team contacts
   - Have backup plan for payment address access

---

## 📞 CRITICAL CONTACTS

- **Stripe Support:** https://support.stripe.com/
- **Alchemy Support:** https://www.alchemy.com/support
- **Server Provider:** [Your hosting provider]
- **Domain Registrar:** [Your domain provider]
- **On-Call Developer:** [Phone number]

---

## ✅ FINAL GO/NO-GO CHECKLIST

### MUST HAVE (Production Blockers)
- [ ] Stripe LIVE keys configured
- [ ] ENVIRONMENT=production
- [ ] Domain & SSL working (https://api.kamiyo.ai)
- [ ] Payment wallet addresses verified
- [ ] CORS origins production-only
- [ ] Redis running
- [ ] Process manager configured (systemd/docker)
- [ ] Firewall configured
- [ ] Reverse proxy configured (nginx)
- [ ] Monitoring configured (Sentry)

### SHOULD HAVE (Strongly Recommended)
- [ ] PostgreSQL database
- [ ] Automated backups
- [ ] Uptime monitoring
- [ ] Log aggregation
- [ ] Rate limiting tested
- [ ] Security headers verified

### NICE TO HAVE (Can Add Post-Launch)
- [ ] CDN for static assets
- [ ] Multi-region deployment
- [ ] Load balancer
- [ ] Automated scaling

---

## 🎯 DEPLOYMENT DECISION

**Ready to Deploy:** Only if ALL "MUST HAVE" items checked ✅

**Current Status:** 🔴 NOT READY

**Blockers:**
1. Stripe test keys (not live)
2. Environment=development (not production)
3. Redis not configured
4. Process manager not set up
5. Domain/SSL not verified

**Estimated Time to Production Ready:** 2-4 hours (if all resources available)

---

Would you like me to help you resolve these blockers?
