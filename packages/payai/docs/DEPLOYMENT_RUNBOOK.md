# Kamiyo Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying Kamiyo to Render.com production environment.

**Deployment Architecture:**
- 2 Web Services (API + Frontend)
- 1 PostgreSQL Database (Starter Plan)
- Environment: Production
- Platform: Render.com

---

## Pre-Deployment Checklist

### 1. Code Quality Verification

- [ ] All tests passing locally
  ```bash
  cd /Users/dennisgoslar/Projekter/kamiyo
  pytest tests/
  ```

- [ ] No critical security vulnerabilities
  ```bash
  ./scripts/security_audit.sh
  ```

- [ ] Code reviewed and approved
- [ ] Git branch is up to date with main
  ```bash
  git status
  git pull origin main
  ```

### 2. Environment Configuration Validation

- [ ] Run environment validation script
  ```bash
  ./scripts/validate_env.sh production
  ```

- [ ] Verify all required secrets are set in Render.com dashboard
  - Navigate to: `Settings > Environment Variables`
  - Check against `/Users/dennisgoslar/Projekter/kamiyo/docs/PRODUCTION_ENV_SETUP.md`

- [ ] Database connection string is correct
- [ ] HTTPS origins configured (no HTTP in production)
- [ ] Stripe webhook secret matches Stripe dashboard
- [ ] NEXTAUTH_SECRET is set (min 32 chars)

### 3. Database Readiness

- [ ] Database migrations ready
  ```bash
  # Verify migrations exist
  ls -la website/prisma/migrations/
  ```

- [ ] Database backup created (if updating existing deployment)
  ```bash
  ./scripts/backup_database.sh
  ```

- [ ] Migration plan reviewed

### 4. Dependency Check

- [ ] Python dependencies locked in requirements.txt
  ```bash
  pip freeze > requirements.txt.lock
  diff requirements.txt requirements.txt.lock
  ```

- [ ] Node.js dependencies locked in package-lock.json or yarn.lock
  ```bash
  cd website
  npm ci  # Verify lock file is valid
  ```

### 5. Monitoring & Alerting

- [ ] Sentry DSN configured for error tracking
- [ ] Health check endpoints verified
  - API: `/health` returns 200
  - Frontend: `/` returns 200
- [ ] Prometheus metrics enabled (if using)
- [ ] Alert contacts updated in on-call rotation

---

## Deployment Process

### Step 1: Pre-Deployment Communication

**5 minutes before deployment:**

1. Notify team in deployment channel:
   ```
   [DEPLOYMENT] Starting Kamiyo deployment
   - Services: API + Frontend
   - Branch: main
   - Commit: <commit-hash>
   - Expected duration: 10-15 minutes
   - Estimated downtime: 2-3 minutes
   ```

2. Set status page to "Maintenance" (if applicable)

### Step 2: Trigger Deployment

**Option A: Automatic Deployment (Recommended)**

1. Push to main branch:
   ```bash
   git push origin main
   ```

2. Render.com will automatically:
   - Detect the push
   - Build both services in parallel
   - Run health checks
   - Switch traffic to new version

**Option B: Manual Deployment via Render Dashboard**

1. Log in to Render.com dashboard
2. Navigate to "kamiyo-api" service
3. Click "Manual Deploy" > "Deploy latest commit"
4. Repeat for "kamiyo-frontend" service

**Option C: Deploy via Render CLI**

```bash
# Install Render CLI (if not installed)
npm install -g @render/cli

# Login
render login

# Deploy API
render deploy --service kamiyo-api

# Deploy Frontend
render deploy --service kamiyo-frontend
```

### Step 3: Monitor Deployment

**Watch the build logs:**

1. API Service:
   - Navigate to: Render Dashboard > kamiyo-api > Logs
   - Look for: "Uvicorn running on http://0.0.0.0:PORT"
   - Verify: No Python import errors

2. Frontend Service:
   - Navigate to: Render Dashboard > kamiyo-frontend > Logs
   - Look for: "Ready in Xms"
   - Verify: Prisma migrations completed successfully

**Key log patterns to watch for:**

```
# API Success Indicators
✓ "Kamiyo API starting up..."
✓ "Database exploits: XXXX"
✓ "Tracked chains: XX"
✓ "WebSocket manager started"
✓ "Cache manager connected"

# Frontend Success Indicators
✓ "Prisma schema loaded from prisma/schema.prisma"
✓ "Migrations complete"
✓ "Ready in XXXms"
✓ "Local: http://localhost:3000"

# Warning Signs (investigate immediately)
✗ "Error fetching exploits"
✗ "Database connection failed"
✗ "Failed to connect cache manager"
✗ "STRIPE VERSION] CRITICAL"
✗ ImportError, ModuleNotFoundError
✗ "Port already in use"
```

### Step 4: Post-Deployment Validation

**Automated Validation (2-3 minutes):**

```bash
# Run production validation script
./scripts/status-check.sh https://api.kamiyo.ai https://kamiyo.ai
```

**Manual Validation Checklist:**

- [ ] **API Health Check**
  ```bash
  curl https://api.kamiyo.ai/health
  # Expected: {"status": "healthy", "database_exploits": XXXX, ...}
  ```

- [ ] **API Readiness Check**
  ```bash
  curl https://api.kamiyo.ai/ready
  # Expected: {"status": "ready", "database": "healthy", ...}
  ```

- [ ] **Frontend Loads**
  ```bash
  curl -I https://kamiyo.ai
  # Expected: HTTP/2 200
  ```

- [ ] **Database Connectivity**
  ```bash
  curl https://api.kamiyo.ai/exploits?page=1&page_size=10
  # Expected: {"data": [...], "total": XXXX, ...}
  ```

- [ ] **WebSocket Connection**
  ```bash
  # Use wscat or browser console
  wscat -c wss://api.kamiyo.ai/ws
  # Expected: Connection established, heartbeat messages
  ```

- [ ] **Stripe Webhook Processing** (if payment features deployed)
  ```bash
  # Send test webhook from Stripe Dashboard
  # Verify in logs: "Webhook processed successfully"
  ```

- [ ] **Authentication Flow**
  - Visit: https://kamiyo.ai
  - Click "Sign In"
  - Verify: NextAuth login page loads
  - Test: Login with test account

- [ ] **Critical User Flows**
  - [ ] View exploits dashboard
  - [ ] Filter by chain/protocol
  - [ ] View exploit details
  - [ ] Subscribe to alerts (if authenticated)

### Step 5: Performance Verification

**Response Time Checks:**

```bash
# API response time (should be < 500ms)
time curl https://api.kamiyo.ai/exploits?page=1&page_size=100

# Frontend Time to First Byte (should be < 1s)
curl -w "@curl-format.txt" -o /dev/null -s https://kamiyo.ai
```

**Create curl-format.txt:**
```bash
cat > /tmp/curl-format.txt << 'EOF'
    time_namelookup:  %{time_namelookup}\n
       time_connect:  %{time_connect}\n
    time_appconnect:  %{time_appconnect}\n
      time_redirect:  %{time_redirect}\n
   time_pretransfer:  %{time_pretransfer}\n
 time_starttransfer:  %{time_starttransfer}\n
                    ----------\n
         time_total:  %{time_total}\n
EOF
```

**Database Query Performance:**

```bash
# Check slow queries (if configured)
curl https://api.kamiyo.ai/admin/db/slow-queries -H "X-API-Key: $ADMIN_API_KEY"
```

### Step 6: Error Monitoring

**Check Sentry for new errors:**

1. Log in to Sentry: https://sentry.io
2. Navigate to Kamiyo project
3. Filter by: "Last 15 minutes"
4. Verify: No new critical errors
5. Investigate any error spikes

**Check Render logs for errors:**

```bash
# API errors
render logs --service kamiyo-api --tail 100 | grep -i error

# Frontend errors
render logs --service kamiyo-frontend --tail 100 | grep -i error
```

### Step 7: Deployment Completion

1. Announce deployment success:
   ```
   [DEPLOYMENT] ✓ Kamiyo deployment successful
   - API: https://api.kamiyo.ai/health (healthy)
   - Frontend: https://kamiyo.ai (operational)
   - Duration: X minutes
   - Issues: None / See #incident-XXXX
   ```

2. Update status page to "Operational"

3. Document any issues encountered in deployment log

4. Update on-call rotation if needed

---

## Rollback Procedure

**When to rollback:**
- Critical bugs affecting core functionality
- Database corruption
- Authentication completely broken
- Payment processing failures
- Security vulnerability introduced

**DO NOT rollback for:**
- Minor UI issues
- Non-critical feature bugs
- Performance degradation < 50%
- Issues affecting < 5% of users

### Rollback Steps

**Option A: Render Dashboard Rollback (Fastest - 2 minutes)**

1. Navigate to Render Dashboard
2. Select service (kamiyo-api or kamiyo-frontend)
3. Click "Rollbacks" tab
4. Select previous successful deployment
5. Click "Rollback to this version"
6. Confirm rollback

**Option B: Git Revert Rollback (5-10 minutes)**

```bash
# 1. Revert the problematic commit
git revert <bad-commit-hash>

# 2. Push to trigger automatic deployment
git push origin main

# 3. Monitor deployment as in Step 3 above
```

**Option C: Redeploy Previous Commit**

```bash
# 1. Find last good commit
git log --oneline -n 10

# 2. Force push to main (use with caution!)
git reset --hard <last-good-commit>
git push -f origin main

# 3. Monitor deployment
```

### Post-Rollback Actions

1. **Immediate:**
   - [ ] Verify rollback successful (run Step 4 validation)
   - [ ] Announce rollback completion
   - [ ] Create incident report

2. **Within 1 hour:**
   - [ ] Document rollback reason
   - [ ] Create bug ticket for issue
   - [ ] Review what went wrong in deployment process

3. **Within 24 hours:**
   - [ ] Root cause analysis
   - [ ] Update deployment checklist to prevent recurrence
   - [ ] Plan fix and re-deployment

---

## Database Migration Rollback

**CRITICAL: Always backup database before migrations**

### If migration fails during deployment:

1. **Don't panic** - Render keeps previous version running if health checks fail

2. **Check migration logs:**
   ```bash
   render logs --service kamiyo-frontend --tail 500 | grep -i prisma
   ```

3. **Manual migration rollback:**
   ```bash
   # Connect to Render PostgreSQL
   psql $DATABASE_URL

   # Check migration status
   SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;

   # If migration is marked as failed, Prisma won't retry it
   # You may need to manually rollback and fix
   ```

4. **Restore from backup (if corruption occurred):**
   ```bash
   ./scripts/restore-database.sh <backup-file>
   ```

---

## Emergency Contacts

### On-Call Rotation

**Primary On-Call:** [Name] - [Phone] - [Email]
**Secondary On-Call:** [Name] - [Phone] - [Email]
**Engineering Manager:** [Name] - [Phone] - [Email]

### Escalation Path

1. **Level 1** (0-15 min): Primary On-Call engineer investigates
2. **Level 2** (15-30 min): Secondary On-Call joins, consider rollback
3. **Level 3** (30+ min): Engineering Manager involved, execute rollback
4. **Level 4** (Critical outage): CEO/CTO notified

### External Contacts

**Render.com Support:**
- Email: support@render.com
- Dashboard: https://render.com/support
- Status: https://status.render.com

**Stripe Support:**
- Dashboard: https://dashboard.stripe.com/support
- Phone: [Available in Stripe Dashboard]
- Status: https://status.stripe.com

**Sentry Support:**
- Email: support@sentry.io
- Status: https://status.sentry.io

---

## Common Deployment Issues & Solutions

### Issue: Build Fails - "Module not found"

**Cause:** Missing dependency in requirements.txt or package.json

**Solution:**
```bash
# For Python
pip freeze | grep <module-name>
# Add to requirements.txt if missing

# For Node.js
npm ls <module-name>
# Run npm install <module-name> and commit package.json
```

### Issue: Health Check Fails After Deployment

**Cause:** Application not binding to $PORT correctly

**Solution:**
- Check startCommand in render.yaml
- API: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- Frontend: `npm start` (ensure PORT=3000 in env)

### Issue: Database Connection Timeout

**Cause:** DATABASE_URL not set or incorrect

**Solution:**
1. Verify DATABASE_URL in Render dashboard
2. Check database is in same region as web services
3. Verify database is not paused (Starter plan auto-pauses)

### Issue: CORS Errors After Deployment

**Cause:** ALLOWED_ORIGINS not including production domains

**Solution:**
- Update ALLOWED_ORIGINS env var to include:
  - `https://kamiyo.ai`
  - `https://www.kamiyo.ai`
  - `https://api.kamiyo.ai`

### Issue: NextAuth Error - "NEXTAUTH_URL mismatch"

**Cause:** NEXTAUTH_URL doesn't match actual deployment URL

**Solution:**
- Set NEXTAUTH_URL to: `https://kamiyo.ai`
- Ensure no trailing slash
- Redeploy frontend service

### Issue: Stripe Webhook Signature Verification Failed

**Cause:** STRIPE_WEBHOOK_SECRET doesn't match endpoint secret in Stripe

**Solution:**
1. Go to Stripe Dashboard > Developers > Webhooks
2. Click on webhook endpoint
3. Click "Reveal" on "Signing secret"
4. Copy and update STRIPE_WEBHOOK_SECRET in Render
5. Redeploy API service

### Issue: High Memory Usage / Out of Memory

**Cause:** Instance tier too small, memory leak, or inefficient queries

**Solution:**
1. **Immediate:** Upgrade instance tier in Render dashboard
2. **Short-term:** Restart service to clear memory
3. **Long-term:**
   - Profile memory usage
   - Optimize database queries
   - Add pagination to large datasets

### Issue: Slow API Response Times

**Cause:** Database queries not optimized, missing indexes, or cold start

**Solution:**
1. Check query performance in logs
2. Add database indexes for frequently filtered columns
3. Enable Redis caching (set REDIS_URL)
4. Consider upgrading instance tier

---

## Deployment Metrics & SLOs

### Service Level Objectives (SLOs)

- **Availability:** 99.5% uptime (monthly)
- **API Response Time (p95):** < 500ms
- **Frontend Load Time (p95):** < 2s
- **Error Rate:** < 0.1%
- **Deployment Success Rate:** > 95%

### Track After Each Deployment

- [ ] Deployment duration
- [ ] Downtime duration (if any)
- [ ] Number of rollbacks (should be 0)
- [ ] Post-deployment error rate (first 1 hour)
- [ ] Performance impact (response times)

### Deployment Log Template

```
Date: YYYY-MM-DD HH:MM UTC
Deployer: [Name]
Branch: main
Commit: [hash]
Services: API + Frontend
Duration: X minutes
Downtime: X seconds
Issues: None / [Description]
Rollback: No / Yes - [Reason]
Notes: [Any observations]
```

---

## Post-Deployment Tasks

### Within 1 Hour

- [ ] Monitor error rates in Sentry
- [ ] Check response times in APM (if configured)
- [ ] Verify no user reports of issues
- [ ] Update deployment log

### Within 24 Hours

- [ ] Review deployment metrics vs SLOs
- [ ] Document any lessons learned
- [ ] Update runbook if process changed
- [ ] Schedule retrospective if issues occurred

### Within 1 Week

- [ ] Analyze deployment success rate
- [ ] Review and optimize slow endpoints (if identified)
- [ ] Update monitoring alerts if needed
- [ ] Plan next deployment improvements

---

## Continuous Improvement

After each deployment, ask:

1. **What went well?**
   - Document successful practices
   - Share with team

2. **What could be better?**
   - Update this runbook
   - Automate manual steps
   - Add new validations

3. **What was surprising?**
   - Add to troubleshooting section
   - Create alerts for early detection

4. **How can we prevent issues?**
   - Add pre-deployment checks
   - Improve testing coverage
   - Enhance monitoring

---

## Appendix: Deployment Checklist (Print Version)

```
PRE-DEPLOYMENT:
□ All tests passing
□ Security scan passed
□ Code reviewed
□ Environment validated
□ Database backup created
□ Team notified

DEPLOYMENT:
□ Deployment triggered
□ Build logs monitored
□ Services healthy
□ Health checks passing

POST-DEPLOYMENT:
□ API health verified
□ Frontend loading
□ Database accessible
□ Auth flow working
□ Critical features tested
□ No errors in Sentry
□ Performance acceptable
□ Team notified

IF ISSUES:
□ Severity assessed
□ Rollback decision made
□ Rollback executed
□ Services verified
□ Incident documented
□ Post-mortem scheduled
```

---

**Last Updated:** 2025-10-14
**Document Owner:** DevOps Team
**Review Cycle:** After each deployment or monthly
