# Kamiyo Deployment Documentation

## Overview

This directory contains comprehensive deployment documentation for Kamiyo's Render.com production environment.

**Created by:** Agent ALPHA-DEPLOY
**Date:** 2025-10-14
**Platform:** Render.com
**Services:** API (Python/FastAPI) + Frontend (Node.js/Next.js) + PostgreSQL

---

## Quick Start

### First-Time Production Deployment

1. **Read the Audit Report**
   - Start here: [DEPLOYMENT_AUDIT_REPORT.md](./DEPLOYMENT_AUDIT_REPORT.md)
   - Understand current configuration and risks
   - Review critical action items

2. **Configure Environment Variables**
   - Follow: [PRODUCTION_ENV_SETUP.md](./PRODUCTION_ENV_SETUP.md)
   - Set all required secrets in Render Dashboard
   - Generate secure keys where needed

3. **Validate Configuration**
   ```bash
   ./scripts/validate_env.sh production
   ```
   - Fix any failures before proceeding

4. **Follow Deployment Runbook**
   - Use: [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)
   - Complete pre-deployment checklist
   - Execute deployment steps
   - Verify post-deployment

### Emergency Hotfix

If you need to deploy an urgent fix:

1. **Determine Severity**
   - P0 (Critical): Service down, security breach
   - P1 (High): Major feature broken, payment issues
   - P2+ (Medium/Low): Use normal deployment

2. **Follow Hotfix Procedure**
   - Read: [HOTFIX_PROCEDURE.md](./HOTFIX_PROCEDURE.md)
   - Get required approvals
   - Deploy and monitor closely

---

## Document Index

### 1. [DEPLOYMENT_AUDIT_REPORT.md](./DEPLOYMENT_AUDIT_REPORT.md)

**Purpose:** Comprehensive audit of Render.com deployment configuration

**Contents:**
- Infrastructure configuration analysis
- Environment variables audit
- Security assessment
- Risk identification
- Compliance review
- Deployment readiness checklist

**When to Read:**
- Before first production deployment
- When planning infrastructure changes
- During security audits
- Quarterly reviews

**Key Sections:**
- Executive Summary (start here)
- Risk Assessment (understand what could go wrong)
- Recommendations Summary (know what to fix)
- Deployment Readiness Checklist (final sign-off)

---

### 2. [PRODUCTION_ENV_SETUP.md](./PRODUCTION_ENV_SETUP.md)

**Purpose:** Complete guide to configuring production environment variables

**Contents:**
- All required environment variables
- How to generate secure secrets
- Step-by-step Render.com configuration
- Validation procedures
- Troubleshooting common issues

**When to Read:**
- Setting up new Render.com deployment
- Adding/changing environment variables
- Debugging configuration issues
- Onboarding new team members

**Key Sections:**
- Environment Variables Checklist (quick reference)
- Security Best Practices (protect secrets)
- Troubleshooting (fix common issues)

---

### 3. [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)

**Purpose:** Step-by-step procedure for deploying to production

**Contents:**
- Pre-deployment checklist
- Deployment execution steps
- Post-deployment validation
- Monitoring procedures
- Rollback procedures
- Communication templates

**When to Read:**
- Before every production deployment
- When training new deployers
- During incidents requiring rollback
- When updating deployment process

**Key Sections:**
- Pre-Deployment Checklist (don't skip this)
- Deployment Process (step-by-step)
- Post-Deployment Validation (verify success)
- Rollback Procedure (when things go wrong)

---

### 4. [HOTFIX_PROCEDURE.md](./HOTFIX_PROCEDURE.md)

**Purpose:** Emergency deployment procedure for critical issues

**Contents:**
- When to use hotfix vs normal deployment
- Hotfix classification (P0/P1/P2)
- Fast-track deployment process
- Testing requirements
- Communication protocols
- Post-mortem requirements

**When to Read:**
- During production incidents
- When critical bug discovered
- Training on-call engineers
- Post-incident reviews

**Key Sections:**
- When to Deploy a Hotfix (decision tree)
- Hotfix Deployment Process (fast track)
- Rollback Procedure (emergency revert)
- Post-Mortem Requirements (learn from incidents)

---

## Scripts & Tools

### validate_env.sh

**Location:** `/Users/dennisgoslar/Projekter/kamiyo/scripts/validate_env.sh`

**Purpose:** Validate all environment variables are correctly configured

**Usage:**
```bash
# Validate for production
./scripts/validate_env.sh production

# Validate for development
./scripts/validate_env.sh development

# Validate for staging
./scripts/validate_env.sh staging
```

**What it checks:**
- Required variables are set
- Secrets meet minimum length
- URLs are valid format
- HTTPS is used in production
- Stripe keys match environment
- Database URL is correct format
- Database connection works (if psql installed)

**Exit Codes:**
- 0: All checks passed
- 1: Critical failures (fix before deploying)
- 2: Warnings present (review before deploying)

---

## Configuration Files

### render.yaml (Root)

**Location:** `/Users/dennisgoslar/Projekter/kamiyo/render.yaml`

**Purpose:** Infrastructure as Code for Render.com

**Contains:**
- Database configuration
- API service definition
- Frontend service definition
- Environment variable mappings
- Health check paths

**When to Edit:**
- Adding new services
- Changing build/start commands
- Updating Node/Python versions
- Modifying health check paths
- Adding persistent disks

**Important:**
- This is the source of truth
- Changes trigger redeployment
- Test in staging first
- Review diffs carefully

---

### .env.example

**Location:** `/Users/dennisgoslar/Projekter/kamiyo/.env.example`

**Purpose:** Template for local development environment

**NOT used for:** Production deployment (use Render Dashboard instead)

**Contains:**
- All possible environment variables
- Example values
- Documentation for each variable

---

## Deployment Workflow

### Normal Deployment Flow

```
1. Development
   ├─ Write code
   ├─ Test locally
   ├─ Run tests
   └─ Create PR

2. Code Review
   ├─ Team reviews
   ├─ CI/CD runs tests
   ├─ Approve PR
   └─ Merge to main

3. Pre-Deployment
   ├─ Read DEPLOYMENT_RUNBOOK.md
   ├─ Complete pre-deployment checklist
   ├─ Run validate_env.sh
   └─ Notify team

4. Deployment
   ├─ Push to main (or manual deploy)
   ├─ Monitor build logs
   ├─ Wait for health checks
   └─ Traffic switches automatically

5. Post-Deployment
   ├─ Run validation checks
   ├─ Monitor error rates
   ├─ Test critical flows
   └─ Announce success
```

### Hotfix Deployment Flow

```
1. Incident Detection
   ├─ Issue reported/detected
   ├─ Verify severity
   ├─ Determine P0/P1/P2
   └─ Get approval (if needed)

2. Hotfix Development
   ├─ Create hotfix branch
   ├─ Implement minimal fix
   ├─ Test locally
   └─ Quick code review

3. Emergency Deployment
   ├─ Merge to main
   ├─ Monitor deployment
   ├─ Verify fix works
   └─ Roll back if issues

4. Post-Incident
   ├─ Continue monitoring
   ├─ Announce resolution
   ├─ Write post-mortem
   └─ Implement prevention
```

---

## Critical Action Items (Before First Deploy)

### MUST DO (Blocking)

- [ ] **Add JWT_SECRET**
  ```bash
  # Generate
  openssl rand -base64 48
  # Add to Render Dashboard: kamiyo-api → Environment
  ```

- [ ] **Configure Stripe Keys**
  - Get from Stripe Dashboard
  - Use LIVE keys (sk_live_..., pk_live_...)
  - Set in both API and Frontend services
  - Configure webhook secret

- [ ] **Set NEXTAUTH_SECRET**
  ```bash
  # Generate
  openssl rand -base64 48
  # Add to Render Dashboard: kamiyo-frontend → Environment
  ```

- [ ] **Set NEXTAUTH_URL**
  - Value: `https://kamiyo.ai` (exact deployment URL)
  - No trailing slash
  - Must be HTTPS

- [ ] **Configure ALLOWED_ORIGINS**
  - Value: `https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai`
  - HTTPS only
  - No spaces

- [ ] **Run Validation**
  ```bash
  ./scripts/validate_env.sh production
  # Must pass all checks
  ```

### SHOULD DO (Highly Recommended)

- [ ] **Add Redis**
  - For caching and rate limiting
  - Critical for production scalability
  - Render Redis or Upstash

- [ ] **Configure Sentry**
  - Essential for error monitoring
  - Free tier available
  - Set SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN

- [ ] **Remove SQLite (if unused)**
  - Verify EXPLOIT_DB_PATH is not used
  - Remove disk mount if unnecessary
  - Use PostgreSQL only

- [ ] **Create Database Backup**
  ```bash
  ./scripts/backup_database.sh
  ```

### NICE TO HAVE (Optional)

- [ ] External API keys (Etherscan, GitHub)
- [ ] Alert channels (Discord, Telegram, Slack)
- [ ] Custom domain configuration
- [ ] Load testing

---

## Common Issues & Solutions

### "Environment validation failed"

**Solution:**
1. Check which variables failed
2. Refer to PRODUCTION_ENV_SETUP.md
3. Add missing variables in Render Dashboard
4. Redeploy service

### "Health check timeout"

**Solution:**
1. Check build logs for errors
2. Verify startCommand is correct
3. Ensure app binds to $PORT
4. Check database connection

### "CORS error in browser"

**Solution:**
1. Verify ALLOWED_ORIGINS includes frontend domain
2. Ensure HTTPS (not HTTP) in production
3. No trailing slashes in URLs
4. Redeploy API service

### "Stripe webhook signature verification failed"

**Solution:**
1. Verify STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
2. Check webhook URL is correct
3. Ensure using correct environment (test vs live)
4. Redeploy API service

---

## Monitoring & Alerting

### Health Check Endpoints

**API:**
- Health: `https://api.kamiyo.ai/health`
- Readiness: `https://api.kamiyo.ai/ready`

**Frontend:**
- Homepage: `https://kamiyo.ai/`

**Expected Response:**
- 200 OK with JSON payload
- Response time < 500ms

### Error Monitoring

**Sentry (when configured):**
- Backend: Project for kamiyo-api
- Frontend: Project for kamiyo-frontend
- Check dashboard: https://sentry.io

**Render Logs:**
- Dashboard → Service → Logs
- Filter by ERROR level
- Set up log alerts

### Performance Monitoring

**Render Metrics:**
- CPU usage
- Memory usage
- Request rate
- Response time

**Alert Thresholds:**
- CPU > 80% for 5 minutes
- Memory > 90% for 5 minutes
- Error rate > 1%
- Response time > 2s (p95)

---

## Security Checklist

### Secrets Management

- [ ] No secrets in git
- [ ] All secrets in Render Dashboard
- [ ] Secrets meet minimum length (32 chars)
- [ ] Different secrets per environment
- [ ] Secrets documented in secure vault

### Network Security

- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] Security headers enabled
- [ ] Rate limiting active
- [ ] Database SSL enforced

### Access Control

- [ ] Render account has 2FA
- [ ] Team access properly scoped
- [ ] Admin API key set
- [ ] JWT secret configured
- [ ] Regular access audits

### Compliance

- [ ] PCI DSS compliant (logging filters)
- [ ] OWASP best practices followed
- [ ] Data encryption at rest
- [ ] Audit logs enabled

---

## Escalation & Support

### On-Call Rotation

**Primary:** [Name] - [Phone] - [Email]
**Secondary:** [Name] - [Phone] - [Email]
**Manager:** [Name] - [Phone] - [Email]

### External Support

**Render.com:**
- Support: support@render.com
- Dashboard: https://render.com/support
- Status: https://status.render.com

**Stripe:**
- Dashboard: https://dashboard.stripe.com/support
- Status: https://status.stripe.com

**Sentry:**
- Support: support@sentry.io
- Status: https://status.sentry.io

---

## Document Maintenance

### Review Schedule

- **Weekly:** During deployment (deployer reviews relevant docs)
- **Monthly:** Full review of all documents
- **Quarterly:** Audit report refresh
- **After Incidents:** Update based on learnings

### Update Process

1. Identify outdated information
2. Update relevant document(s)
3. Test any changed procedures
4. Notify team of changes
5. Update "Last Updated" date

### Version Control

All documentation is version controlled in git:
- Location: `/Users/dennisgoslar/Projekter/kamiyo/docs/`
- Branch: `main`
- Review changes in PRs

---

## Training Resources

### New Team Members

1. Read DEPLOYMENT_AUDIT_REPORT.md (overview)
2. Review PRODUCTION_ENV_SETUP.md (configuration)
3. Shadow a deployment (DEPLOYMENT_RUNBOOK.md)
4. Practice in staging environment
5. Lead deployment with supervision

### On-Call Training

1. Read HOTFIX_PROCEDURE.md
2. Review incident response plan
3. Practice hotfix deployment in staging
4. Shadow on-call engineer
5. Take on-call shift with backup

---

## FAQ

**Q: Which render.yaml should I use?**
A: Use the root one (`/Users/dennisgoslar/Projekter/kamiyo/render.yaml`). The one in website/ is a duplicate and should be removed.

**Q: Do I need Redis?**
A: Highly recommended for production. Without it, rate limiting and caching only work per-instance.

**Q: Is SQLite being used?**
A: Need to verify. If EXPLOIT_DB_PATH is used, migrate to PostgreSQL only for production.

**Q: How do I rollback a deployment?**
A: Render Dashboard → Service → Rollbacks → Select previous version → Rollback. See DEPLOYMENT_RUNBOOK.md for details.

**Q: What if validation script fails?**
A: Fix the failures before deploying. See PRODUCTION_ENV_SETUP.md for configuration help.

**Q: How often should I deploy?**
A: As often as needed. Daily deployments are fine. Use normal process unless it's a hotfix.

**Q: Who approves hotfixes?**
A: P0 (critical) - Primary On-Call. P1 (high) - Engineering Manager. P2+ (medium/low) - Use normal deployment.

---

## Getting Help

**For deployment issues:**
1. Check relevant documentation
2. Review troubleshooting sections
3. Check Render status page
4. Contact on-call engineer
5. Escalate if unresolved in 30 minutes

**For documentation issues:**
1. Create issue in git repo
2. Tag document owner
3. Propose changes in PR
4. Update after review

---

**Last Updated:** 2025-10-14
**Document Owner:** DevOps Team
**Next Review:** 2025-11-14
