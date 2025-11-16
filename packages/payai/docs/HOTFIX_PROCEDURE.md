# Kamiyo Hotfix Deployment Procedure

## Overview

This document outlines the process for deploying critical hotfixes to production outside of the normal deployment schedule. Hotfixes are reserved for urgent issues that require immediate resolution.

---

## When to Deploy a Hotfix

### ✅ DEPLOY HOTFIX FOR:

**P0 - Critical (Deploy Immediately)**
- Complete service outage (API/Frontend down)
- Data corruption or loss
- Payment processing failures
- Security vulnerability exploitation (active attack)
- Authentication completely broken (no users can login)
- Database connection failures

**P1 - High (Deploy Within 2 Hours)**
- Major feature completely broken (affects >50% users)
- Payment webhooks failing (revenue impact)
- Severe performance degradation (>5s response times)
- Data integrity issues (incorrect data shown)
- Critical third-party integration failures (Stripe, Database)

### ❌ DO NOT HOTFIX FOR:

**Deploy in Next Scheduled Release Instead:**
- Minor UI bugs (cosmetic issues)
- Non-critical feature improvements
- Performance optimization (unless severe)
- New features
- Refactoring
- Issues affecting <5% of users
- Non-urgent bug fixes
- Documentation updates

---

## Hotfix Classification Matrix

| Severity | Impact | Response Time | Approval Required | Example |
|----------|--------|---------------|-------------------|---------|
| **P0 - Critical** | Complete outage | Immediate (0-15 min) | CTO/Engineering Manager | API returns 500 for all requests |
| **P1 - High** | Major functionality broken | 2 hours | Engineering Manager | Payment webhooks not processing |
| **P2 - Medium** | Feature degraded | Next day | Team Lead | Slow loading (but functional) |
| **P3 - Low** | Minor issue | Next sprint | None (normal process) | Button text typo |

---

## Pre-Hotfix Checklist

### 1. Incident Verification (5 minutes)

- [ ] Confirm the issue is real (not user error)
- [ ] Verify scope of impact
  ```bash
  # Check error rates in Sentry
  # Check API response codes in logs
  # Check user reports
  ```
- [ ] Determine severity (P0/P1/P2)
- [ ] Check if workaround exists

### 2. Root Cause Analysis (10-15 minutes)

- [ ] Identify exact cause
- [ ] Locate problematic code/config
- [ ] Verify when issue started (recent deploy?)
- [ ] Document in incident tracker

### 3. Approval Process

**P0 Critical:**
- Primary On-Call engineer can approve
- Notify Engineering Manager immediately
- Document decision

**P1 High:**
- Requires Engineering Manager approval
- Escalate if manager unavailable
- Document approval in ticket

**P2+ Medium/Low:**
- Go through normal deployment process
- Do not use hotfix procedure

### 4. Communication (BEFORE starting hotfix)

**Internal:**
```
HOTFIX ALERT - [P0/P1]
Issue: [Brief description]
Impact: [User impact]
ETA: [Estimated fix time]
Status: Deploying hotfix
Engineer: [Name]
```

**External (if P0 with outage):**
- Update status page: "Investigating issue"
- Twitter/Status feed: "We're aware of [issue] and deploying a fix"

---

## Hotfix Development Process

### Step 1: Create Hotfix Branch

```bash
cd /Users/dennisgoslar/Projekter/kamiyo

# Ensure you're on latest main
git checkout main
git pull origin main

# Create hotfix branch from main
git checkout -b hotfix/[issue-description]

# Example:
git checkout -b hotfix/stripe-webhook-verification
```

**Branch Naming Convention:**
- `hotfix/stripe-webhook-verification`
- `hotfix/database-connection-timeout`
- `hotfix/auth-redirect-loop`

### Step 2: Implement Fix

**Guidelines:**
- Make minimal changes (only fix the specific issue)
- Do not refactor or add features
- Do not update dependencies (unless that's the fix)
- Add comments explaining the hotfix
- Include ticket/issue reference

**Example:**
```python
# HOTFIX: Issue #1234 - Stripe webhook signature verification
# Fixed by updating webhook secret handling
# Deployed: 2025-10-14 by [Engineer]
def verify_webhook_signature(payload, signature, secret):
    # Previous code had bug with secret encoding
    # Now correctly handles UTF-8 encoding
    return stripe.Webhook.verify_signature(payload, signature, secret)
```

### Step 3: Testing Requirements

**Minimum Testing (15-20 minutes):**

1. **Unit Tests (if existing)**
   ```bash
   pytest tests/ -v -k [relevant_test]
   ```

2. **Manual Testing**
   - [ ] Verify fix resolves the issue locally
   - [ ] Test primary user flow end-to-end
   - [ ] Check no new errors introduced

3. **Staging Deployment (if available)**
   ```bash
   # Deploy to staging first
   git push origin hotfix/[issue-description]
   # Manually deploy to staging via Render
   # Test thoroughly
   ```

**P0 Critical Exception:**
- If production is completely down, can skip staging
- Deploy directly to production
- But still test locally first

### Step 4: Code Review

**P0 Critical:**
- Quick review by another engineer (15 min max)
- Can be post-deployment if emergency
- Focus on: "Does this break anything else?"

**P1 High:**
- Full code review required before deployment
- At least one approver
- 30-60 minute max review time

**Review Checklist:**
- [ ] Fix addresses root cause (not just symptom)
- [ ] No unrelated changes included
- [ ] No obvious bugs introduced
- [ ] Minimal scope (smallest change possible)
- [ ] Comments explain the hotfix

---

## Hotfix Deployment Process

### Step 1: Pre-Deployment Verification

```bash
# Validate environment variables
./scripts/validate_env.sh production

# Verify database is accessible
curl https://api.kamiyo.ai/health

# Check current error rates
# (Sentry, logs, monitoring)
```

### Step 2: Create Deployment Commit

```bash
# Commit the hotfix
git add [changed-files]
git commit -m "HOTFIX: [Issue description]

Fixes: #[issue-number]
Severity: P0/P1
Impact: [Brief impact]
Root Cause: [Brief cause]
Solution: [Brief solution]

Tested: [Testing performed]
Approved-By: [Manager name]
Deployed-By: [Engineer name]"

# Example:
git commit -m "HOTFIX: Fix Stripe webhook signature verification

Fixes: #1234
Severity: P1
Impact: Payment webhooks failing, revenue impact
Root Cause: Incorrect UTF-8 encoding of webhook secret
Solution: Added explicit encoding handling

Tested: Local + Staging, all webhook events processed
Approved-By: Jane Doe (Engineering Manager)
Deployed-By: John Smith"
```

### Step 3: Deploy to Production

**Option A: Direct Deployment (Fastest)**

```bash
# Merge to main
git checkout main
git merge --no-ff hotfix/[issue-description]
git push origin main

# Render.com will auto-deploy
# Monitor logs
```

**Option B: Manual Deploy (More Control)**

```bash
# Push hotfix branch
git push origin hotfix/[issue-description]

# Deploy via Render Dashboard
1. Navigate to service
2. Click "Manual Deploy"
3. Select branch: hotfix/[issue-description]
4. Click "Deploy"
```

### Step 4: Monitor Deployment

**Watch Build Logs (5-10 minutes):**

```bash
# Via Render CLI
render logs --service kamiyo-api --tail

# Via Dashboard
# Navigate to service → Logs tab
```

**Success Indicators:**
```
✓ Build completed
✓ Health check passing
✓ No startup errors
✓ API responding
```

**Failure Indicators:**
```
✗ Build failed
✗ Health check timeout
✗ Import errors
✗ Database connection failed
```

### Step 5: Verify Fix is Live

**Automated Verification:**
```bash
# Run status check
./scripts/status-check.sh https://api.kamiyo.ai https://kamiyo.ai

# Check specific endpoint
curl https://api.kamiyo.ai/health

# Test the specific fix
# (e.g., send test Stripe webhook)
```

**Manual Verification:**

- [ ] API health endpoint returns 200
- [ ] Frontend loads correctly
- [ ] Specific issue is resolved
- [ ] No new errors in Sentry
- [ ] Error rate decreased in monitoring

**Verification Checklist by Issue Type:**

**Payment Issue:**
- [ ] Send test Stripe webhook
- [ ] Verify webhook processed
- [ ] Check payment logs

**Auth Issue:**
- [ ] Login with test account
- [ ] Verify session persists
- [ ] Check auth redirects

**API Issue:**
- [ ] Test affected endpoint
- [ ] Verify correct response
- [ ] Check response time

**Database Issue:**
- [ ] Query returns data
- [ ] No connection errors
- [ ] Performance acceptable

---

## Post-Hotfix Validation

### Immediate (Within 15 Minutes)

- [ ] Verify issue is resolved
- [ ] Check error rates dropped
- [ ] Monitor response times
- [ ] Scan Sentry for new errors
- [ ] Test critical user flows

```bash
# Check error rates
curl https://api.kamiyo.ai/health | jq

# Monitor logs for 10 minutes
render logs --service kamiyo-api --tail | grep -i error

# Sentry check
# Navigate to Sentry → Filter by "Last 15 minutes"
```

### Short-Term (Within 1 Hour)

- [ ] Full smoke test of application
- [ ] Verify all integrations working
  - Stripe payments
  - Authentication
  - Database queries
  - WebSocket connections
- [ ] Check performance metrics
- [ ] Review user feedback channels

### Communication Updates

**Internal:**
```
HOTFIX DEPLOYED - [P0/P1]
Issue: [Description]
Status: RESOLVED
Deployment: Successful
Verification: All systems operational
Next Steps: Post-mortem scheduled
```

**External (if status page updated):**
```
Update: Issue resolved
The issue affecting [service] has been resolved.
All systems are now operational.
We apologize for any inconvenience.
```

---

## Rollback Procedure

### When to Rollback

**Immediate Rollback Required:**
- New critical errors introduced
- Fix doesn't resolve original issue
- Performance worse than before
- Data integrity compromised
- Health checks failing

### Rollback Steps

**Fast Rollback (2-3 minutes):**

```bash
# Option 1: Render Dashboard Rollback
1. Navigate to service
2. Click "Rollbacks" tab
3. Select previous deployment
4. Click "Rollback"

# Option 2: Git Revert
git revert HEAD
git push origin main
# Render auto-deploys
```

**Verify Rollback:**
```bash
# Check service is healthy
curl https://api.kamiyo.ai/health

# Verify original issue returns
# (Known issue is better than broken system)
```

**Post-Rollback:**
1. Investigate why hotfix failed
2. Develop new fix
3. Test more thoroughly
4. Redeploy

---

## Post-Mortem Requirements

### Required for ALL Hotfixes

**Within 24 Hours:**

Create post-mortem document including:

1. **Incident Summary**
   - What happened
   - When detected
   - User impact
   - Duration

2. **Root Cause Analysis**
   - Why it happened
   - What conditions led to it
   - Why wasn't it caught earlier

3. **Resolution**
   - What was fixed
   - How it was deployed
   - Verification performed

4. **Prevention Measures**
   - How to prevent recurrence
   - Process improvements needed
   - Monitoring additions
   - Test coverage gaps

5. **Action Items**
   - Assigned tasks
   - Deadlines
   - Responsible parties

**Post-Mortem Template:**
```markdown
# Hotfix Post-Mortem: [Issue]

## Incident Summary
- Date: [Date]
- Duration: [Start - End]
- Severity: P0/P1
- Impact: [User/Revenue impact]

## Timeline
- [Time] - Issue detected
- [Time] - Hotfix started
- [Time] - Fix deployed
- [Time] - Verified resolved

## Root Cause
[Detailed explanation]

## Resolution
[What was changed]

## Prevention
- [ ] Add test coverage
- [ ] Add monitoring
- [ ] Update deployment checklist
- [ ] Team training

## Action Items
- [ ] [Task] - [@assignee] - [Deadline]
```

---

## Hotfix Best Practices

### DO:

- Keep changes minimal and focused
- Test thoroughly (within time constraints)
- Document everything
- Communicate proactively
- Follow approval process
- Monitor post-deployment
- Write post-mortem

### DON'T:

- Bundle multiple fixes together
- Add new features
- Refactor code (unless necessary for fix)
- Skip testing
- Deploy without approval (P1+)
- Forget to communicate
- Skip documentation

---

## Hotfix Communication Templates

### Internal Alert (Start)

```
🚨 HOTFIX ALERT - P[0/1]

Issue: [Brief description]
Severity: [P0/P1]
Impact: [User impact]
Affected: [Service/Feature]

Timeline:
- Detected: [Time]
- Fix started: [Time]
- ETA: [Estimated completion]

Engineer: @[Name]
Approved by: @[Manager]

Status: 🔧 Deploying fix
```

### Internal Update (Complete)

```
✅ HOTFIX COMPLETE - P[0/1]

Issue: [Description]
Status: RESOLVED

Deployment:
- Deployed: [Time]
- Verification: Complete
- Monitoring: Active

Impact:
- Downtime: [Duration or None]
- Users affected: [Number/Percentage]
- Revenue impact: [If applicable]

Next Steps:
- Continue monitoring for 1 hour
- Post-mortem scheduled for [Date/Time]
- Action items will be assigned

Thanks @[Team] for quick response!
```

### External Status Update (If Applicable)

**Initial:**
```
We're aware of an issue affecting [service].
Our team is actively working on a fix.
Updates: [status page URL]
```

**Resolved:**
```
The issue affecting [service] has been resolved.
All systems are operating normally.
We apologize for any inconvenience.
```

---

## Hotfix Metrics to Track

### Deployment Metrics

- Time to detection
- Time to fix
- Time to deployment
- Total incident duration
- Rollback required? (Y/N)

### Impact Metrics

- Users affected (count/percentage)
- Downtime duration
- Revenue impact (if applicable)
- Support tickets created
- Error rate change

### Process Metrics

- Time to approval
- Time to code review
- Test coverage (before/after)
- Similar incidents (pattern?)

---

## Emergency Contacts

### On-Call Rotation

**Primary:** [Name] - [Phone] - [Email]
**Secondary:** [Name] - [Phone] - [Email]
**Manager:** [Name] - [Phone] - [Email]

### Escalation Path

1. **0-15 min:** Primary On-Call investigates
2. **15-30 min:** Secondary On-Call joins
3. **30-60 min:** Engineering Manager involved
4. **60+ min:** CTO escalation

### External Support

**Render.com:**
- Support: support@render.com
- Status: https://status.render.com
- Dashboard: https://render.com/support

**Stripe:**
- Dashboard: https://dashboard.stripe.com/support
- Status: https://status.stripe.com

**Sentry:**
- Support: support@sentry.io
- Status: https://status.sentry.io

---

## Appendix: Quick Reference

### Hotfix Decision Tree

```
Is service completely down?
├─ YES → P0 - Deploy hotfix immediately
└─ NO ↓

Is major functionality broken (>50% users)?
├─ YES → P1 - Deploy hotfix within 2 hours
└─ NO ↓

Is there revenue impact?
├─ YES → P1 - Deploy hotfix within 2 hours
└─ NO ↓

Is there a security vulnerability?
├─ YES → P0 - Deploy hotfix immediately
└─ NO ↓

Is this affecting <5% of users?
└─ NO HOTFIX - Schedule in next release
```

### Quick Commands

```bash
# Create hotfix branch
git checkout -b hotfix/[issue]

# Deploy hotfix
git push origin main

# Rollback
git revert HEAD && git push

# Check health
curl https://api.kamiyo.ai/health

# Monitor logs
render logs --service kamiyo-api --tail

# Validate environment
./scripts/validate_env.sh production
```

---

**Last Updated:** 2025-10-14
**Document Owner:** DevOps Team
**Review Cycle:** Quarterly or after each hotfix
