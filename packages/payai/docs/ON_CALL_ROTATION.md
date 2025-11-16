# KAMIYO On-Call Rotation Guide

## Overview

This guide defines the on-call rotation structure, responsibilities, and procedures for the KAMIYO production environment. The on-call engineer is the first responder to production incidents and is responsible for maintaining service availability.

## Table of Contents

1. [On-Call Responsibilities](#on-call-responsibilities)
2. [Rotation Schedule](#rotation-schedule)
3. [Incident Severity Levels](#incident-severity-levels)
4. [Escalation Procedures](#escalation-procedures)
5. [On-Call Handoff](#on-call-handoff)
6. [Contact Information](#contact-information)
7. [Common Incidents and Runbooks](#common-incidents-and-runbooks)
8. [PagerDuty/Opsgenie Setup](#pagerdutyopsgenie-setup)
9. [Incident Response Process](#incident-response-process)
10. [Post-Incident Procedures](#post-incident-procedures)

---

## On-Call Responsibilities

### Primary Responsibilities

The on-call engineer is responsible for:

1. **Incident Response**
   - Acknowledge all alerts within 5 minutes
   - Investigate and diagnose incidents
   - Implement fixes or mitigations
   - Communicate status to stakeholders
   - Escalate when necessary

2. **Monitoring**
   - Monitor alert channels (#kamiyo-alerts, PagerDuty, email)
   - Proactively check system health at shift start
   - Review metrics and logs for anomalies
   - Verify recent deployments are stable

3. **Communication**
   - Update status page during incidents
   - Post updates in #kamiyo-alerts Slack channel
   - Notify stakeholders of critical incidents
   - Document incident timeline and actions taken

4. **Documentation**
   - Create incident reports for SEV1 and SEV2 incidents
   - Update runbooks with new procedures
   - Document workarounds and fixes
   - Share learnings with the team

5. **Handoff**
   - Conduct thorough handoff with next on-call
   - Document any ongoing issues
   - Share context from recent incidents
   - Ensure next on-call is prepared

### Availability Requirements

**During On-Call Shift:**
- Available to respond 24/7
- Able to respond to pages within 5 minutes
- Access to laptop with VPN and necessary tools
- Stable internet connection
- Charged phone for PagerDuty/Opsgenie notifications

**Response Time SLAs:**
```yaml
SEV1 (Critical):
  Acknowledgment: 5 minutes
  Initial response: 15 minutes
  Status update: Every 30 minutes

SEV2 (High):
  Acknowledgment: 15 minutes
  Initial response: 30 minutes
  Status update: Every 1 hour

SEV3 (Medium):
  Acknowledgment: 1 hour
  Initial response: 2 hours
  Status update: Daily
```

### Pre-Shift Checklist

Before your on-call shift begins:

- [ ] Verify PagerDuty/Opsgenie notifications are working
  - Test push notification on phone
  - Verify SMS is enabled
  - Confirm phone call settings
- [ ] Verify access to all critical systems
  - Render.com dashboard access
  - Database access (if needed)
  - GitHub repository access
  - AWS/Cloud provider console
- [ ] Review recent incidents and deployments
  - Check #kamiyo-alerts for recent activity
  - Review last week's incident reports
  - Check recent commits and deployments
- [ ] Ensure laptop is ready
  - Development environment set up
  - VPN configured
  - SSH keys loaded
  - Necessary tools installed
- [ ] Review current system status
  - Check uptime monitors
  - Review performance metrics
  - Check any ongoing issues
- [ ] Confirm backup contact information
  - Secondary on-call contact
  - Escalation contacts
  - Vendor support numbers
- [ ] Read any handoff notes from previous on-call

---

## Rotation Schedule

### Recommended Schedule Structure

**Weekly Rotation (Recommended):**
- Rotation period: Monday 9:00 AM - Monday 9:00 AM (local timezone)
- Handoff: Monday morning standup or scheduled call
- Coverage: 24/7 including weekends and holidays

**Example 4-Person Rotation:**
```
Week 1: Engineer A (Primary), Engineer B (Backup)
Week 2: Engineer B (Primary), Engineer C (Backup)
Week 3: Engineer C (Primary), Engineer D (Backup)
Week 4: Engineer D (Primary), Engineer A (Backup)
```

**Alternative: Shift-Based Rotation:**

For teams with dedicated operations engineers:

```
Business Hours (9 AM - 5 PM local time):
  - Tier 1: Junior engineers
  - Tier 2: Senior engineers (escalation)

After Hours (5 PM - 9 AM):
  - Tier 1: Senior engineers
  - Tier 2: Engineering leads (escalation)

Weekend:
  - Rotating senior engineer
  - Engineering manager (escalation)
```

### Holiday and PTO Coverage

**Requesting Time Off:**

1. Request coverage in #on-call channel at least 2 weeks in advance
2. Find a volunteer to swap shifts
3. Update PagerDuty/Opsgenie schedule
4. Document the swap in the rotation calendar
5. Notify team of the change

**Holiday Coverage:**

Major holidays require special planning:

```yaml
Thanksgiving, Christmas, New Year:
  - Volunteer basis (request 1 month in advance)
  - Offer comp time: 1.5x hours off
  - Offer incentive: Holiday bonus or extra PTO day

All Other Holidays:
  - Normal rotation continues
  - Escalation threshold lowered (escalate more readily)
  - Engineering manager on standby
```

### Rotation Calendar

Maintain a shared calendar with:

- Current on-call engineer (primary)
- Backup on-call engineer
- Upcoming rotations (next 8 weeks)
- Planned coverage changes
- Holiday schedules

**Calendar Sharing:**
- Google Calendar: Share with team@kamiyo.ai
- Subscribe URL: Publish read-only iCal URL
- Slack Integration: Post weekly reminder of current on-call

**Weekly Slack Reminder:**
```markdown
:rotating_light: On-Call Rotation - Week of [Date]

Primary: @engineer-name
Backup: @engineer-name

Remember:
- Acknowledge alerts within 5 minutes
- Update #kamiyo-alerts during incidents
- Handoff next Monday at 9 AM

Runbooks: https://docs.kamiyo.ai/runbooks
PagerDuty: https://kamiyo.pagerduty.com
```

---

## Incident Severity Levels

### SEV1: Critical - Service Down

**Definition:**
- Complete service outage affecting all users
- Core functionality completely unavailable
- Data loss or corruption occurring
- Security breach or active attack

**Examples:**
- API returning 500 errors for all requests
- Database unreachable
- Website completely down
- Payment processing failing for all transactions
- Active security incident

**Response Requirements:**
```yaml
Acknowledgment: Within 5 minutes
Initial Response: Within 15 minutes
Status Updates: Every 30 minutes
Escalation: Immediately notify engineering lead
Notification: Page on-call engineer via phone if no acknowledgment
```

**Response Actions:**

1. **Immediate (0-5 minutes):**
   - Acknowledge alert in PagerDuty
   - Post in #kamiyo-alerts: "SEV1 investigating [issue]"
   - Update status page: "Investigating"

2. **Triage (5-15 minutes):**
   - Verify scope of outage (all users or subset?)
   - Check recent deployments
   - Review error logs
   - Check infrastructure status
   - Identify likely cause

3. **Communication (15 minutes):**
   - Post initial findings in #kamiyo-alerts
   - Update status page with identified issue
   - Notify engineering lead if not resolved in 15 min

4. **Resolution:**
   - Implement fix or rollback
   - Monitor for recovery
   - Update status page: "Monitoring"
   - Confirm full recovery
   - Update status page: "Resolved"

**Example SEV1 Response:**

```markdown
[09:15] @oncall-engineer: SEV1 - API completely down, investigating
[09:18] @oncall-engineer: Identified: Database connection pool exhausted
[09:20] @oncall-engineer: Action: Restarting API service, increasing pool size
[09:25] @oncall-engineer: API recovering, monitoring response rates
[09:30] @oncall-engineer: ✅ Resolved - API fully operational. Root cause: connection leak in new code. Rolling back to previous version.
[09:35] @oncall-engineer: Status page updated, incident report to follow
```

### SEV2: High - Degraded Performance

**Definition:**
- Service available but significantly degraded
- Subset of users affected
- Important features unavailable
- High error rate but not complete outage
- Critical functionality impaired

**Examples:**
- API response times > 5 seconds
- 10%+ error rate on API requests
- Payment processing failing intermittently
- Exploit delivery failing for some users
- Database queries timing out intermittently

**Response Requirements:**
```yaml
Acknowledgment: Within 15 minutes
Initial Response: Within 30 minutes
Status Updates: Every 1 hour
Escalation: After 2 hours if not resolved
Notification: PagerDuty push notification and SMS
```

**Response Actions:**

1. **Triage (0-30 minutes):**
   - Acknowledge alert
   - Assess impact (percentage of users affected)
   - Check metrics and logs
   - Identify patterns

2. **Investigation (30-60 minutes):**
   - Deep dive into root cause
   - Check for resource constraints
   - Review recent changes
   - Test hypotheses

3. **Resolution:**
   - Implement fix or mitigation
   - Monitor for improvement
   - Update stakeholders

**Example SEV2 Response:**

```markdown
[14:00] @oncall-engineer: SEV2 - API response times elevated to 6s average
[14:15] @oncall-engineer: Investigating - appears to be database query performance
[14:30] @oncall-engineer: Root cause: Missing index on exploits table after schema change
[14:45] @oncall-engineer: Creating index, ETA 10 minutes
[15:00] @oncall-engineer: ✅ Resolved - Response times back to normal (~200ms)
```

### SEV3: Medium - Non-Critical Issues

**Definition:**
- Minor functionality impaired
- Workaround available
- Small subset of users affected
- No immediate business impact
- Cosmetic or UX issues

**Examples:**
- Documentation links broken
- Non-critical API endpoint slow
- Dashboard chart not loading
- Email notifications delayed
- Monitoring alert false positive

**Response Requirements:**
```yaml
Acknowledgment: Within 1 hour
Initial Response: Within 2 hours
Status Updates: Daily
Escalation: Not required unless becomes SEV2
Notification: Email and Slack only
```

**Response Actions:**

1. **Assess (0-2 hours):**
   - Acknowledge alert
   - Determine actual severity
   - Document issue
   - Decide on timing of fix

2. **Resolution:**
   - Schedule fix during business hours
   - Create ticket for tracking
   - Implement fix when convenient
   - Verify resolution

**Example SEV3 Response:**

```markdown
[10:00] @oncall-engineer: SEV3 - Dashboard stats page loading slowly
[11:00] @oncall-engineer: Investigated - non-optimized query, not affecting core functionality
[11:05] @oncall-engineer: Creating ticket #1234 to optimize query, scheduling for next sprint
[11:10] @oncall-engineer: Workaround: Stats available via API endpoint
```

### Severity Determination Matrix

Use this matrix when severity is unclear:

| Factor | SEV1 | SEV2 | SEV3 |
|--------|------|------|------|
| **Users Affected** | All or nearly all | 10-50% | <10% |
| **Core Functionality** | Complete outage | Degraded | Working |
| **Business Impact** | Revenue loss | User complaints | Minimal |
| **Data Impact** | Loss or corruption | Risk of loss | None |
| **Security Impact** | Active breach | Vulnerability exposed | Minor issue |
| **Workaround** | None available | Difficult | Easy |
| **Response Time** | Immediate | Within 1 hour | Within 1 day |

**When in doubt, escalate to higher severity.** It's better to over-escalate and downgrade than to under-escalate.

---

## Escalation Procedures

### Escalation Triggers

**Automatic Escalation (SEV1):**
- No acknowledgment within 5 minutes → Page secondary on-call
- No acknowledgment within 10 minutes → Page engineering lead
- No resolution within 30 minutes → Notify engineering manager
- No resolution within 1 hour → Notify CTO

**Manual Escalation:**

Escalate immediately if:
- Issue is beyond your expertise
- Multiple systems are affected
- Security incident suspected
- Data loss or corruption possible
- External vendor issue requires management involvement
- Customer escalation (angry customer, press inquiry)

### Escalation Chain

**Level 1: Primary On-Call Engineer**
- First responder
- Acknowledges all alerts
- Investigates and resolves

**Level 2: Secondary On-Call Engineer (Backup)**
- Responds if primary doesn't acknowledge within 5 minutes
- Provides support for complex issues
- Takes over if primary is overwhelmed

**Level 3: Engineering Lead / Senior Engineer**
- Escalation for unresolved SEV1 after 30 minutes
- Technical expertise for complex issues
- Decision authority for major changes (rollbacks, etc.)

**Level 4: Engineering Manager**
- Escalation for unresolved SEV1 after 1 hour
- Resource coordination (pulling in additional engineers)
- Stakeholder communication
- Business decision authority

**Level 5: CTO / VP Engineering**
- Major outages (>2 hours)
- Security incidents
- Data loss incidents
- Customer escalations
- Press inquiries

### Escalation Contact Template

Maintain this information in a secure, accessible location:

```yaml
Primary On-Call:
  Name: [Current on-call engineer]
  Phone: [Phone number]
  PagerDuty: @oncall-primary
  Backup: [Email address]

Secondary On-Call:
  Name: [Backup engineer]
  Phone: [Phone number]
  PagerDuty: @oncall-secondary
  Backup: [Email address]

Engineering Lead:
  Name: [Lead name]
  Phone: [Phone number]
  Email: [Email address]
  Available: [Hours/Days]

Engineering Manager:
  Name: [Manager name]
  Phone: [Phone number]
  Email: [Email address]
  Available: 24/7 for SEV1

CTO:
  Name: [CTO name]
  Phone: [Phone number]
  Email: [Email address]
  Available: 24/7 for major incidents

Vendor Contacts:
  Render.com Support:
    Portal: https://render.com/support
    Email: support@render.com
    Priority: Based on plan

  Stripe Support:
    Phone: 1-888-926-2289
    Email: support@stripe.com
    Portal: https://support.stripe.com

  Helius (Solana):
    Email: support@helius.dev
    Discord: [Invite link]
```

### Escalation Communication Template

**Email Subject:**
```
[SEV1] KAMIYO Production Incident - [Brief Description]
```

**Email Body:**
```markdown
Priority: High
Incident Severity: SEV1
Time Started: [Timestamp UTC]
Current Status: [Investigating/Identified/Resolving]

IMPACT:
[Clear description of user impact]

SYMPTOMS:
[What we're seeing]

INVESTIGATION:
[What we've tried so far]

REQUESTING:
[What help you need]

NEXT STEPS:
[What you're doing next]

Incident Channel: #kamiyo-alerts
Status Page: https://status.kamiyo.ai
On-Call: [Your name]
```

**Slack Escalation Message:**
```markdown
@engineering-lead - Escalating SEV1 incident

Issue: [Brief description]
Impact: [User impact]
Duration: [How long it's been down]
Tried: [What you've attempted]
Need: [What help you need]

Thread: [Link to incident thread]
```

---

## On-Call Handoff

### Handoff Timing

**Scheduled Handoff:**
- Every Monday at 9:00 AM local time
- 30-minute handoff meeting
- Both outgoing and incoming on-call present
- Optional: Engineering lead present

**Emergency Handoff:**
- During an active SEV1 incident (if necessary)
- When on-call engineer becomes unavailable
- Medical emergency or personal crisis

### Handoff Meeting Agenda

**1. System Status (5 minutes)**

Review current state:
- [ ] All monitors green?
- [ ] Any performance issues?
- [ ] Any ongoing investigations?
- [ ] Recent deployments stable?

**2. Recent Incidents (10 minutes)**

Review incidents from past week:
- [ ] SEV1 incidents and resolutions
- [ ] SEV2 incidents and mitigations
- [ ] Any recurring issues?
- [ ] Any workarounds in place?

**3. Ongoing Issues (5 minutes)**

Discuss anything that needs attention:
- [ ] Known issues without fixes
- [ ] Temporary workarounds
- [ ] Scheduled maintenance
- [ ] Upcoming deployments

**4. Access and Tools (5 minutes)**

Verify incoming on-call has access:
- [ ] PagerDuty notifications working
- [ ] Render.com access confirmed
- [ ] Slack alerts configured
- [ ] Runbooks accessible
- [ ] Emergency contacts available

**5. Questions and Context (5 minutes)**

Open floor for questions:
- Clarify anything unclear
- Share tribal knowledge
- Discuss any concerns

### Handoff Documentation

**Handoff Notes Template:**

Create a document for each handoff:

```markdown
# On-Call Handoff - [Date]

**Outgoing:** [Name]
**Incoming:** [Name]
**Date:** [Date]
**Time:** [Time]

## System Status

- [x] All monitors operational
- [ ] Performance issue: API response times slightly elevated (within SLA)
- [x] No active incidents
- [x] Recent deployment (v1.2.3) stable

## Incidents This Week

### SEV1: Database Connection Pool Exhaustion (Oct 26)
- Duration: 15 minutes
- Root cause: Connection leak in new feature code
- Resolution: Rolled back to v1.2.2, fixed leak, redeployed v1.2.3
- Follow-up: Added connection pool monitoring
- Incident report: [Link]

### SEV2: Elevated API Latency (Oct 28)
- Duration: 2 hours
- Root cause: Missing database index after schema migration
- Resolution: Added index, response times normalized
- Follow-up: Updated migration checklist to verify indexes
- Incident report: [Link]

## Ongoing Issues

### Issue 1: Intermittent Slow Queries
- Severity: SEV3
- Description: Occasionally see slow query logs for exploit search
- Impact: Minimal, affects <1% of requests
- Workaround: None needed
- Next steps: Ticket #1234 to optimize query
- Owner: Engineering team, scheduled for next sprint

## Upcoming Events

### Scheduled Maintenance - Database Backup
- Date: Sunday, Nov 3 at 03:00 UTC
- Duration: 30 minutes
- Impact: API ready endpoint may show degraded during backup
- Action: Maintenance window configured in UptimeRobot
- Notification: Posted to status page

### Deployment - v1.3.0
- Planned: Tuesday, Oct 31 at 14:00 UTC
- Changes: New exploit categories feature
- Risk: Low
- Rollback plan: Available
- Monitor: Watch error rates and response times for 1 hour post-deploy

## Handoff Checklist

- [x] System status reviewed
- [x] Recent incidents discussed
- [x] Ongoing issues documented
- [x] Upcoming events noted
- [x] Incoming on-call has access to all systems
- [x] PagerDuty notifications tested
- [x] Questions answered

## Notes

- Password for shared monitoring account expires next week - will need reset
- Remember to check SSL cert expiry dashboard - one cert expires in 15 days
- New runbook for EVM payment verification added this week

**Incoming On-Call Acknowledgment:**
I have reviewed the handoff notes and am ready to take over on-call duties.

Signature: _________________ Date: _________________
```

### Handoff Checklist

Use this checklist for every handoff:

**Outgoing On-Call:**
- [ ] Prepared handoff notes document
- [ ] Reviewed all incidents from past week
- [ ] Documented ongoing issues
- [ ] Listed upcoming events
- [ ] Tested that incoming on-call has access
- [ ] Scheduled handoff meeting
- [ ] Answered all questions
- [ ] Updated rotation calendar

**Incoming On-Call:**
- [ ] Read handoff notes thoroughly
- [ ] Asked clarifying questions
- [ ] Tested PagerDuty notifications
- [ ] Verified access to Render.com
- [ ] Verified access to GitHub
- [ ] Checked current system status
- [ ] Reviewed recent commits and deployments
- [ ] Read runbooks for recent incident types
- [ ] Confirmed emergency contact information
- [ ] Ready to respond to incidents

---

## Contact Information

### Internal Contacts

**Engineering Team:**
```yaml
On-Call Primary:
  Name: [Current rotation - see PagerDuty]
  Phone: [See PagerDuty]
  Email: oncall-primary@kamiyo.ai
  PagerDuty: @oncall-primary

On-Call Secondary:
  Name: [Current rotation - see PagerDuty]
  Phone: [See PagerDuty]
  Email: oncall-secondary@kamiyo.ai
  PagerDuty: @oncall-secondary

Engineering Lead:
  Name: [Name]
  Phone: +1-XXX-XXX-XXXX
  Email: engineering-lead@kamiyo.ai
  Slack: @engineering-lead
  Available: Mon-Fri 9 AM - 6 PM, SEV1 escalation 24/7

Engineering Manager:
  Name: [Name]
  Phone: +1-XXX-XXX-XXXX
  Email: engineering-manager@kamiyo.ai
  Slack: @eng-manager
  Available: 24/7 for SEV1 escalations

CTO:
  Name: [Name]
  Phone: +1-XXX-XXX-XXXX
  Email: cto@kamiyo.ai
  Slack: @cto
  Available: Major incidents only

DevOps/Infrastructure:
  Email: devops@kamiyo.ai
  Slack: #kamiyo-infrastructure
  Oncall: [See PagerDuty]
```

### External Vendor Support

**Render.com:**
```yaml
Support Portal: https://render.com/support
Email: support@render.com
Response Time:
  - Starter: Best effort
  - Standard: < 24 hours
  - Pro: < 8 hours
  - Enterprise: < 4 hours, 24/7 phone support

Support Hours:
  - Email: 24/7
  - Live Chat: Business hours (varies by plan)
  - Phone: Enterprise plans only

Emergency Contact:
  - Use support portal for fastest response
  - Mark as "Critical" for production outages
  - Include service name and ID in all requests
```

**Stripe:**
```yaml
Support:
  Phone: 1-888-926-2289 (US)
  Email: support@stripe.com
  Portal: https://support.stripe.com

Response Time:
  - Standard: < 24 hours
  - Critical: < 1 hour (active payment processing issues)

Dashboard: https://dashboard.stripe.com
Status: https://status.stripe.com

Incident Escalation:
  - Use phone support for payment processing outages
  - Email for non-critical issues
  - Check status page first
```

**Helius (Solana RPC):**
```yaml
Support:
  Email: support@helius.dev
  Discord: [Server invite link]
  Documentation: https://docs.helius.dev

Response Time:
  - Email: < 24 hours
  - Discord: Community support, faster for urgent issues

Dashboard: https://dev.helius.xyz
Status: Check Discord #status channel

Incident Escalation:
  - Use Discord for fastest response to RPC issues
  - Email for billing or account issues
```

**Alchemy (Ethereum RPC):**
```yaml
Support:
  Email: support@alchemy.com
  Portal: https://www.alchemy.com/support
  Documentation: https://docs.alchemy.com

Response Time:
  - Growth plan: < 24 hours
  - Enterprise: < 4 hours

Dashboard: https://dashboard.alchemy.com
Status: https://status.alchemy.com

Incident Escalation:
  - Use support portal for RPC issues
  - Include app ID in all requests
```

### Emergency Procedures Contact

**Security Incident:**
```yaml
Internal:
  Primary: security@kamiyo.ai
  Phone: [Security team on-call]
  Escalate to: CTO immediately

External:
  - Law enforcement (if needed): Local FBI field office
  - Legal counsel: [Law firm contact]
  - PR/Communications: [PR contact]
```

**Data Breach:**
```yaml
Immediate Actions:
  1. Notify security@kamiyo.ai
  2. Page CTO
  3. Do NOT communicate externally until legal review
  4. Preserve all logs and evidence
  5. Follow incident response playbook

Legal:
  - In-house counsel: legal@kamiyo.ai
  - External counsel: [Law firm]
  - Regulatory: Determine notification requirements
```

**Customer Escalation:**
```yaml
Customer Support:
  Email: support@kamiyo.ai
  Slack: #customer-support

Executive Escalation:
  - Angry customer: Notify customer success manager
  - Legal threat: Notify legal@kamiyo.ai
  - Press inquiry: Notify pr@kamiyo.ai, CTO
  - Refund request: Follow billing escalation procedure
```

---

## Common Incidents and Runbooks

### Runbook Index

All detailed runbooks are stored in `/docs/runbooks/`. Quick reference:

1. **API Service Down** → `runbooks/api-down.md`
2. **Database Issues** → `runbooks/database-issues.md`
3. **High Error Rate** → `runbooks/high-error-rate.md`
4. **Performance Degradation** → `runbooks/performance-degradation.md`
5. **Payment Processing Failure** → `runbooks/payment-failure.md`
6. **SSL Certificate Issues** → `runbooks/ssl-certificate.md`
7. **Deployment Rollback** → `runbooks/deployment-rollback.md`
8. **Security Incident** → `runbooks/security-incident.md`

### Quick Reference: API Service Down

**Symptoms:**
- Uptime monitor reports API down
- API returning 500 errors
- Timeout errors
- No response from API

**Initial Investigation (5 minutes):**

1. **Check Render.com service status:**
   ```bash
   # Via dashboard or CLI
   render services get api-kamiyo-ai
   ```

2. **Check recent deployments:**
   ```bash
   # Check deploy history
   render deploys list --service api-kamiyo-ai --limit 5
   ```

3. **Check service logs:**
   ```bash
   # View recent logs
   render logs --service api-kamiyo-ai --tail 100
   ```

**Common Causes and Fixes:**

**Cause 1: Recent Deployment Issue**
```bash
# Rollback to previous version
render services rollback api-kamiyo-ai

# Verify recovery
curl https://api.kamiyo.ai/health
```

**Cause 2: Database Connection Issue**
```bash
# Check database status via Render dashboard
# If database is down, restart it
render services restart kamiyo-database

# Restart API after database is back
render services restart api-kamiyo-ai
```

**Cause 3: Resource Exhaustion**
```bash
# Check metrics in Render dashboard
# - CPU usage
# - Memory usage
# - Connection pool

# If resource limits hit, scale up temporarily
render services scale api-kamiyo-ai --num 2

# Or increase instance size
render services update api-kamiyo-ai --plan standard-plus
```

**Escalation:**
- If not resolved in 15 minutes → Engineering Lead
- If database issue persists → Contact Render support
- If cause unknown → Engineering Manager

### Quick Reference: Payment Processing Failure

**Symptoms:**
- x402 payment verification failing
- Webhook not receiving notifications
- Exploit access denied despite payment

**Initial Investigation (5 minutes):**

1. **Check Stripe dashboard:**
   - https://dashboard.stripe.com
   - Verify webhook endpoint is receiving events
   - Check recent payment intents

2. **Check payment verification logs:**
   ```bash
   # Check x402 payment logs
   render logs --service api-kamiyo-ai --tail 100 | grep "payment"
   ```

3. **Verify webhook endpoint:**
   ```bash
   # Test webhook endpoint
   curl https://api.kamiyo.ai/api/billing/webhook
   # Should return 405 (Method Not Allowed) or similar, not 404
   ```

**Common Causes and Fixes:**

**Cause 1: Stripe Webhook Signing Secret Mismatch**
```bash
# Verify webhook secret in Render environment variables
# Navigate to Render dashboard → Service → Environment
# Check STRIPE_WEBHOOK_SECRET matches Stripe dashboard

# If mismatch, update and redeploy
render services env set api-kamiyo-ai \
  STRIPE_WEBHOOK_SECRET=whsec_new_secret
```

**Cause 2: Database Payment Record Not Created**
```bash
# Check if payment exists in database
# Access database console or use API
curl https://api.kamiyo.ai/api/admin/payment/[payment_id]

# If missing, webhook may not have processed
# Check webhook delivery in Stripe dashboard
# Retry webhook if failed
```

**Cause 3: Blockchain Transaction Not Confirmed**
```bash
# For EVM payments, verify transaction on block explorer
# Check transaction hash in payment record
# If pending, wait for confirmations (usually < 1 minute)
# If failed, refund may be needed
```

**Escalation:**
- If Stripe webhook issue → Contact Stripe support
- If blockchain issue → Check Alchemy/Helius status
- If data integrity issue → Engineering Lead immediately

### Quick Reference: High Error Rate

**Symptoms:**
- Elevated 5xx error rate (>1%)
- Monitor shows degraded performance
- User reports of errors

**Initial Investigation (5 minutes):**

1. **Check error rate and patterns:**
   ```bash
   # View recent error logs
   render logs --service api-kamiyo-ai --tail 500 | grep "ERROR"

   # Look for patterns:
   # - Specific endpoint?
   # - Specific error message?
   # - Started after deployment?
   ```

2. **Check metrics:**
   - Response times
   - CPU/Memory usage
   - Database query performance

3. **Identify affected endpoints:**
   ```bash
   # Group errors by endpoint
   render logs --service api-kamiyo-ai | \
     grep "ERROR" | \
     grep -oP "/(api/[^\\s]+)" | \
     sort | uniq -c | sort -rn
   ```

**Common Causes and Fixes:**

**Cause 1: Database Query Timeout**
```bash
# Check slow query logs
# Identify problematic queries
# Add missing indexes or optimize queries

# Temporary fix: Increase query timeout
# Permanent fix: Optimize query or add index
```

**Cause 2: External API Failure**
```bash
# Check if external service is down
# - Stripe status: https://status.stripe.com
# - Alchemy status: https://status.alchemy.com
# - Helius status: Discord #status

# Implement circuit breaker or use cached data
# Notify users if third-party issue
```

**Cause 3: Rate Limiting or Throttling**
```bash
# Check if hitting rate limits on external APIs
# Review error messages for "429" or "rate limit"

# Temporary fix: Increase rate limits if possible
# Permanent fix: Implement request queuing or caching
```

**Escalation:**
- If database issue persists > 30 min → Engineering Lead
- If external service issue → Contact vendor support
- If cause unclear → Engineering Manager

---

## PagerDuty/Opsgenie Setup

### PagerDuty Setup (Recommended)

PagerDuty provides robust on-call management with escalation policies, schedules, and incident response features.

#### Step 1: Create Account and Service

1. **Sign up for PagerDuty:**
   - Visit https://www.pagerduty.com
   - Choose plan (Professional or Business recommended)
   - Complete registration

2. **Create Service:**
   - Navigate to "Services" → "Service Directory"
   - Click "New Service"
   - Configure:
     ```yaml
     Name: KAMIYO Production
     Description: Production monitoring for KAMIYO services
     Integration: Email (for UptimeRobot)
     Escalation Policy: KAMIYO On-Call Rotation (create next)
     Incident Urgency: Use support hours and escalation policy
     ```

3. **Get Integration Email:**
   - After creating service, copy integration email
   - Format: `kamiyo-production@yourcompany.pagerduty.com`
   - Add this to UptimeRobot as alert contact

#### Step 2: Create Escalation Policy

1. **Navigate to "Escalation Policies"**
2. **Click "New Escalation Policy"**
3. **Configure:**

```yaml
Name: KAMIYO On-Call Rotation

Level 1:
  - Targets: Primary On-Call Schedule
  - Escalation delay: 5 minutes
  - Notification rules:
      - Immediately: Push notification
      - After 5 min: SMS
      - After 10 min: Phone call

Level 2:
  - Targets: Secondary On-Call Schedule
  - Escalation delay: 10 minutes
  - Notification rules:
      - Immediately: Push notification + SMS
      - After 5 min: Phone call

Level 3:
  - Targets: Engineering Lead
  - Escalation delay: 15 minutes
  - Notification rules:
      - Immediately: Push + SMS + Phone call

Level 4:
  - Targets: Engineering Manager
  - Notification rules:
      - Immediately: All channels
```

4. **Save Escalation Policy**

#### Step 3: Create On-Call Schedules

**Primary On-Call Schedule:**

1. Navigate to "On-Call Schedules"
2. Click "New On-Call Schedule"
3. Configure:

```yaml
Name: KAMIYO Primary On-Call
Timezone: [Your timezone]
Schedule type: Weekly rotation

Rotation:
  - Handoff time: Monday 9:00 AM
  - Rotation length: 1 week
  - Team members:
      - Engineer A
      - Engineer B
      - Engineer C
      - Engineer D

Coverage:
  - 24/7 coverage
  - No gaps

Start date: [Next Monday]
```

4. **Preview schedule** to ensure no gaps
5. **Save schedule**

**Secondary On-Call Schedule:**

Repeat above steps with:
- Name: KAMIYO Secondary On-Call
- Same team members, offset by 1 week
- Ensures backup is always someone different from primary

#### Step 4: Configure Notification Rules

For each team member:

1. Navigate to "My Profile" → "Notification Rules"
2. Configure:

```yaml
High Urgency:
  0 minutes: Push notification
  5 minutes: SMS to [phone]
  10 minutes: Phone call to [phone]
  15 minutes: SMS again
  20 minutes: Phone call again

Low Urgency:
  0 minutes: Push notification
  30 minutes: SMS to [phone]
```

3. **Test notifications:**
   - Click "Test" for each notification method
   - Verify all channels work

#### Step 5: Mobile App Setup

1. **Download PagerDuty app:**
   - iOS: https://apps.apple.com/app/pagerduty/id594039512
   - Android: https://play.google.com/store/apps/details?id=com.pagerduty.android

2. **Configure app:**
   - Log in with PagerDuty account
   - Enable push notifications
   - Test "Do Not Disturb Override" (critical for on-call)
   - Set up critical alerts to bypass phone silence mode

3. **Test incident flow:**
   - Create test incident in PagerDuty
   - Verify notification received
   - Practice acknowledging
   - Practice resolving

#### Step 6: Integrate with UptimeRobot

1. **In PagerDuty:**
   - Copy integration email from service

2. **In UptimeRobot:**
   - Navigate to "Alert Contacts"
   - Add email alert contact
   - Email: [PagerDuty integration email]
   - Friendly name: PagerDuty - KAMIYO Production

3. **Add to monitors:**
   - Edit each monitor
   - Add PagerDuty alert contact
   - Configure to alert on "Down" status

4. **Test integration:**
   - Pause a monitor briefly to trigger alert
   - Verify incident created in PagerDuty
   - Acknowledge and resolve in PagerDuty
   - Verify workflow

### Opsgenie Setup (Alternative)

Opsgenie is Atlassian's incident management tool, great for teams already using Jira.

#### Step 1: Create Account and Team

1. **Sign up for Opsgenie:**
   - Visit https://www.atlassian.com/software/opsgenie
   - Choose plan (Standard or Enterprise)
   - Complete registration

2. **Create Team:**
   - Navigate to "Teams"
   - Click "Add team"
   - Configure:
     ```yaml
     Name: KAMIYO Engineering
     Description: Production engineering team
     Members: [Add all engineers]
     ```

#### Step 2: Create On-Call Schedule

1. **Navigate to team → "On-call"**
2. **Create schedule:**

```yaml
Name: KAMIYO Primary On-Call
Timezone: [Your timezone]

Rotation:
  - Type: Weekly
  - Participants: Engineer A, B, C, D
  - Handoff: Monday 9:00 AM
  - Rotation interval: 1 week

Coverage:
  - 24/7
  - Restrictions: None
```

3. **Create secondary schedule** (similar to above)

#### Step 3: Create Escalation Policy

```yaml
Name: KAMIYO Production Escalation

Step 1:
  - Who: Primary On-Call Schedule
  - Delay: 5 minutes

Step 2:
  - Who: Secondary On-Call Schedule
  - Delay: 10 minutes

Step 3:
  - Who: Engineering Lead
  - Delay: 15 minutes

Step 4:
  - Who: Engineering Manager
  - No delay (immediately after step 3)
```

#### Step 4: Configure Integration

1. **Create email integration:**
   - Navigate to "Integrations"
   - Add "Email-based Integration"
   - Copy integration email
   - Add escalation policy

2. **Add to UptimeRobot:**
   - Add integration email as alert contact
   - Configure monitors to use it

3. **Test workflow**

### PagerDuty vs Opsgenie Comparison

| Feature | PagerDuty | Opsgenie |
|---------|-----------|----------|
| **Pricing** | $21-$41/user/month | $9-$29/user/month |
| **Mobile App** | Excellent | Excellent |
| **Escalation** | Robust | Robust |
| **Jira Integration** | Available | Native (Atlassian) |
| **Analytics** | Comprehensive | Good |
| **Status Page** | Available (addon) | Available (addon) |
| **Learning Curve** | Moderate | Easy (if using Jira) |
| **Best For** | Dedicated incident management | Teams using Atlassian suite |

---

## Incident Response Process

### Incident Response Lifecycle

```
Detection → Acknowledgment → Investigation → Mitigation →
Communication → Resolution → Post-Incident Review
```

### Phase 1: Detection (0 minutes)

**Automated Detection:**
- Uptime monitors trigger alert
- Error rate threshold exceeded
- Performance metrics degraded
- Customer reports via support

**Manual Detection:**
- Team member notices issue
- Customer escalation
- Social media report

**Actions:**
- Alert fires in #kamiyo-alerts
- PagerDuty pages on-call engineer
- Incident clock starts

### Phase 2: Acknowledgment (0-5 minutes)

**Actions:**
1. **Acknowledge alert:**
   - In PagerDuty: Click "Acknowledge"
   - In Slack: React with 👀 emoji
   - Stops escalation timer

2. **Initial assessment:**
   - Is this a real incident?
   - What's the severity?
   - What's the scope?

3. **Communicate:**
   - Post in #kamiyo-alerts: "Acknowledged, investigating"
   - Set your status: 🔥 "Responding to incident"

**Example:**
```markdown
@oncall-engineer: 👀 Acknowledged. API health check failing, investigating scope.
```

### Phase 3: Investigation (5-30 minutes)

**Systematic Investigation:**

1. **Verify the issue:**
   ```bash
   # Test the service manually
   curl https://api.kamiyo.ai/health
   curl https://api.kamiyo.ai/ready

   # Check from multiple locations
   # Use external tool: https://downforeveryoneorjustme.com
   ```

2. **Check recent changes:**
   ```bash
   # Recent deployments
   git log --oneline -10

   # Recent configuration changes
   # Check Render dashboard for env var changes

   # Recent database migrations
   # Check migration logs
   ```

3. **Review logs:**
   ```bash
   # Application logs
   render logs --service api-kamiyo-ai --tail 500

   # Look for error patterns
   render logs --service api-kamiyo-ai | grep -i "error\|exception\|failed"

   # Check for specific errors
   render logs --service api-kamiyo-ai | grep "500"
   ```

4. **Check metrics:**
   - CPU usage (in Render dashboard)
   - Memory usage
   - Response times
   - Error rates
   - Database connection pool

5. **Check dependencies:**
   - Database status
   - External API status (Stripe, Alchemy, Helius)
   - DNS resolution
   - SSL certificates

**Create Investigation Thread:**

In #kamiyo-alerts, create a thread with findings:

```markdown
Investigation findings (15 min in):

✅ API service is running
✅ Database is responsive
✅ No recent deployments
❌ Seeing high error rate on /api/exploits endpoint
❌ Database query timeout errors in logs

Hypothesis: Database performance issue, possibly missing index or slow query

Next: Checking database query performance
```

### Phase 4: Mitigation (15-60 minutes)

**Goal: Restore service quickly, even if not a permanent fix**

**Common Mitigation Strategies:**

1. **Rollback:**
   ```bash
   # If issue started with recent deployment
   render services rollback api-kamiyo-ai

   # Verify recovery
   curl https://api.kamiyo.ai/health
   ```

2. **Restart service:**
   ```bash
   # Sometimes a simple restart helps
   render services restart api-kamiyo-ai

   # Monitor recovery
   watch -n 5 'curl -s https://api.kamiyo.ai/health | jq'
   ```

3. **Scale resources:**
   ```bash
   # If resource exhaustion
   render services scale api-kamiyo-ai --num 3

   # Or increase instance size
   render services update api-kamiyo-ai --plan standard-plus
   ```

4. **Disable problematic feature:**
   ```bash
   # Set feature flag to disable broken feature
   render services env set api-kamiyo-ai \
     FEATURE_NEW_SEARCH=false

   # This allows service to continue without the broken part
   ```

5. **Clear cache/queue:**
   ```bash
   # If issue is related to stale cache or queue backup
   # Use admin endpoint or database command
   curl -X POST https://api.kamiyo.ai/api/admin/cache/clear \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

**Decision Tree:**

```
Is there a recent deployment?
├─ YES → Rollback immediately
└─ NO → Continue investigation

Is a specific feature broken?
├─ YES → Disable feature via feature flag
└─ NO → Continue investigation

Are resources exhausted (CPU/Memory/Connections)?
├─ YES → Scale up temporarily
└─ NO → Continue investigation

Is external dependency down?
├─ YES → Implement fallback or circuit breaker
└─ NO → Continue investigation

Is root cause unclear?
└─ YES → Restart service, monitor, escalate
```

### Phase 5: Communication (Throughout)

**Internal Communication:**

**Status Updates (Every 30 minutes for SEV1, every hour for SEV2):**

```markdown
[10:00] Update #1: Still investigating API errors. Identified database query issue.
Working on fix. ETA: 15 minutes.

[10:30] Update #2: Fix deployed (added database index). Monitoring recovery.
Error rate decreasing. Will confirm resolution in 10 minutes.

[10:45] Final Update: ✅ Resolved. Error rate back to normal. Monitoring for stability.
Incident report to follow.
```

**External Communication (if needed):**

**Status Page Updates:**

```markdown
[10:00] Investigating
We are investigating connectivity issues affecting KAMIYO API. Some users may
experience errors when accessing exploits. Our team is actively working on a resolution.

[10:30] Identified
We have identified a database performance issue causing API errors. A fix has been
deployed and services are recovering.

[10:45] Resolved
This incident has been resolved. All services are operating normally. We apologize
for any inconvenience.
```

### Phase 6: Resolution (After mitigation)

**Verify resolution:**

1. **Check all monitors green:**
   - UptimeRobot showing all services up
   - Error rate back to normal (<0.1%)
   - Response times normal

2. **Monitor for stability:**
   - Watch for 15-30 minutes
   - Ensure issue doesn't recur
   - Check logs for lingering errors

3. **Communicate resolution:**
   ```markdown
   ✅ RESOLVED - API Errors Due to Database Query Performance

   Duration: 45 minutes (10:00 - 10:45 UTC)
   Root cause: Missing database index after schema migration
   Fix: Added index to exploits table
   Impact: ~5% of API requests failed during incident

   All services are now operating normally. Monitoring for stability.

   Post-incident review will be scheduled to prevent recurrence.
   ```

4. **Close incident:**
   - Resolve in PagerDuty
   - Update status page to "Resolved"
   - Post final update in #kamiyo-alerts
   - Clear your incident status

### Phase 7: Post-Incident Review (Within 48 hours)

**Schedule blameless post-mortem meeting:**
- Within 1 business day for SEV1
- Within 1 week for SEV2
- Optional for SEV3

**Meeting agenda:**
- Incident timeline
- Root cause analysis
- What went well
- What could be improved
- Action items to prevent recurrence

**Incident Report Template:**

See [Post-Incident Procedures](#post-incident-procedures) section below.

---

## Post-Incident Procedures

### Incident Report Template

Create an incident report for every SEV1 and SEV2 incident:

```markdown
# Incident Report: [Brief Title]

**Incident ID:** INC-[NUMBER]
**Severity:** [SEV1/SEV2/SEV3]
**Date:** [Date]
**Duration:** [Duration in minutes/hours]
**On-Call Engineer:** [Name]

## Summary

[2-3 sentence summary of what happened and the impact]

Example:
On October 28, 2025 at 10:00 UTC, the KAMIYO API began returning errors for
approximately 5% of requests due to a missing database index. The issue was
identified and resolved within 45 minutes by adding the missing index. No data
loss occurred, but some users experienced failed API requests during this period.

## Impact

- **User Impact:** [Description of customer impact]
  - Example: Users unable to access exploit details (5% of requests)
  - Example: Payment processing delayed but not failed
- **Duration:** [How long users were affected]
- **Scope:** [Percentage or number of users affected]
- **Data Impact:** [Any data loss or corruption]
- **Revenue Impact:** [Estimated revenue impact, if applicable]

## Timeline

All times in UTC:

| Time | Event |
|------|-------|
| 09:55 | Database schema migration deployed |
| 10:00 | Error rate begins increasing |
| 10:02 | UptimeRobot alert fired |
| 10:03 | On-call engineer acknowledged |
| 10:05 | Initial investigation started |
| 10:15 | Root cause identified (missing index) |
| 10:20 | Fix implemented (index added) |
| 10:25 | Error rate begins decreasing |
| 10:30 | Service fully recovered |
| 10:45 | Incident resolved, monitoring for stability |

## Root Cause

[Detailed explanation of why the incident occurred]

Example:
The database migration script (002_add_exploit_categories.sql) added a new column
to the exploits table but did not include an index on this column. The application
began querying this column immediately after deployment, resulting in full table
scans for a table with 1M+ rows. This caused query timeouts and API errors.

**Contributing Factors:**
- Migration script did not include performance testing
- No automated index verification in migration pipeline
- Migration checklist not followed completely

## Detection

[How was the incident detected?]

Example:
- Automated: UptimeRobot alert for elevated error rate (10:02 UTC)
- Manual: Customer support received 3 error reports (10:10 UTC)

**Time to Detection:** 5 minutes (from first error to alert)

## Response

[How did we respond?]

Example:
On-call engineer acknowledged alert within 3 minutes and began investigation.
Root cause was identified through log analysis showing slow query warnings.
Fix was implemented by adding the missing index. No rollback was required.

**Time to Acknowledgment:** 3 minutes
**Time to Mitigation:** 20 minutes
**Time to Resolution:** 45 minutes

## Resolution

[What fixed the issue?]

Example:
Added a B-tree index on exploits.category_id column:
```sql
CREATE INDEX idx_exploits_category_id ON exploits(category_id);
```

This reduced query time from 30+ seconds to <50ms.

## Lessons Learned

### What Went Well

- ✅ Alert fired quickly and accurately
- ✅ On-call engineer responded within SLA
- ✅ Root cause identified quickly through systematic debugging
- ✅ Fix was straightforward and low-risk
- ✅ Good communication in #kamiyo-alerts channel

### What Could Be Improved

- ❌ Migration script should have included index from the start
- ❌ No automated testing of migration performance
- ❌ Migration checklist exists but wasn't followed
- ❌ No early warning of query performance degradation

## Action Items

| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 | Update migration template to include index checklist | @eng-lead | 2025-11-01 | ✅ Complete |
| 2 | Add automated slow query detection to monitoring | @devops | 2025-11-05 | 🟡 In Progress |
| 3 | Create pre-migration performance test script | @engineer-a | 2025-11-10 | ⏳ Pending |
| 4 | Conduct migration training for all engineers | @eng-manager | 2025-11-15 | ⏳ Pending |
| 5 | Add migration review to PR checklist | @eng-lead | 2025-11-01 | ✅ Complete |

## Appendix

### Related Documents

- Migration script: database/migrations/002_add_exploit_categories.sql
- PR introducing the change: #234
- Slack thread: [Link to #kamiyo-alerts thread]
- PagerDuty incident: INC-123

### Metrics

**Before Incident:**
- Average response time: 185ms
- Error rate: 0.05%
- P95 response time: 450ms

**During Incident:**
- Average response time: 3,500ms
- Error rate: 5.2%
- P95 response time: 30,000ms (timeout)

**After Resolution:**
- Average response time: 190ms
- Error rate: 0.04%
- P95 response time: 460ms

---

**Report Author:** [On-call engineer name]
**Date Created:** [Date]
**Review Date:** [Date of post-mortem meeting]
**Approved By:** [Engineering Manager]
```

### Post-Incident Meeting (Blameless Post-Mortem)

**Schedule meeting within:**
- SEV1: Next business day
- SEV2: Within 1 week
- SEV3: Optional

**Attendees:**
- On-call engineer who responded
- Engineering lead
- Engineering manager
- Other engineers involved
- Product manager (if user impact)

**Meeting Structure (45 minutes):**

1. **Incident overview (5 min)**
   - On-call engineer presents timeline
   - What happened, how long, who was affected

2. **Root cause analysis (10 min)**
   - Why did this happen?
   - What were the contributing factors?
   - Use "5 Whys" technique:
     ```
     Problem: API errors
     Why? Database queries timing out
     Why? Full table scans on large table
     Why? Missing index on new column
     Why? Migration script didn't include index
     Why? Migration checklist not followed
     ```

3. **Response evaluation (10 min)**
   - What went well?
   - What could be improved?
   - Were our tools sufficient?
   - Was documentation adequate?

4. **Prevention discussion (15 min)**
   - How can we prevent this in the future?
   - What processes need to change?
   - What tooling is needed?
   - Create action items with owners and due dates

5. **Action item review (5 min)**
   - Summarize action items
   - Assign owners
   - Set due dates
   - Schedule follow-up

**Blameless Culture:**

- Focus on systems and processes, not individuals
- "How can we make it impossible to make this mistake?"
- Not: "Why didn't you follow the checklist?"
- Celebrate learning and improvements
- Share widely for organizational learning

### Incident Metrics

Track these metrics monthly:

```yaml
Incident Volume:
  - Total incidents
  - By severity (SEV1, SEV2, SEV3)
  - By category (deployment, infrastructure, dependencies)

Response Times:
  - Time to acknowledge
  - Time to mitigate
  - Time to resolve
  - Compare against SLAs

Impact:
  - Total downtime minutes
  - Affected user count
  - Revenue impact

Trends:
  - Are incidents increasing or decreasing?
  - Which components have most incidents?
  - Recurring incident patterns?
  - Are action items being completed?
```

**Monthly Incident Review:**

Hold a team meeting to review:
- All incidents from the month
- Metrics and trends
- Action item completion rate
- Process improvements needed

---

## Tools and Resources

### Essential Tools

**Monitoring:**
- UptimeRobot: https://uptimerobot.com
- Render Metrics: https://render.com/docs/metrics
- Status Page: https://status.kamiyo.ai

**Incident Management:**
- PagerDuty: https://www.pagerduty.com
- Opsgenie: https://www.atlassian.com/software/opsgenie

**Communication:**
- Slack: #kamiyo-alerts channel
- Email: ops@kamiyo.ai

**Infrastructure:**
- Render Dashboard: https://dashboard.render.com
- GitHub: https://github.com/kamiyo
- Database: Via Render dashboard

**External Services:**
- Stripe Dashboard: https://dashboard.stripe.com
- Alchemy Dashboard: https://dashboard.alchemy.com
- Helius Dashboard: https://dev.helius.xyz

### Documentation

**Internal Docs:**
- Runbooks: /docs/runbooks/
- Architecture: /docs/ARCHITECTURE.md
- Deployment: /docs/DEPLOYMENT.md
- This guide: /docs/ON_CALL_ROTATION.md

**External Resources:**
- Render Docs: https://render.com/docs
- Stripe API: https://stripe.com/docs/api
- Google SRE Book: https://sre.google/sre-book/

### On-Call Toolkit

**Required on laptop:**
- VPN client (if applicable)
- Terminal/shell access
- Code editor
- Git
- Database client (if direct DB access needed)
- PagerDuty/Opsgenie mobile app
- Slack mobile app

**Browser Bookmarks:**
- Render Dashboard
- PagerDuty/Opsgenie
- Status Page
- UptimeRobot
- GitHub
- Stripe Dashboard
- Alchemy/Helius Dashboards

**Useful Commands:**

```bash
# Quick health check
curl https://api.kamiyo.ai/health | jq
curl https://api.kamiyo.ai/ready | jq

# View recent logs
render logs --service api-kamiyo-ai --tail 100

# Check service status
render services get api-kamiyo-ai

# Restart service (if needed)
render services restart api-kamiyo-ai

# Rollback deployment
render services rollback api-kamiyo-ai

# Check recent deploys
render deploys list --service api-kamiyo-ai --limit 5
```

---

## Support

For questions about on-call procedures:
- Process questions: ops@kamiyo.ai
- Technical questions: engineering@kamiyo.ai
- Urgent incidents: Follow escalation procedure in this document

For updates to this document:
- Submit PR to GitHub repository
- Tag @engineering-lead for review
- Update after each significant incident

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Owner:** Engineering Team
**Review Cycle:** Quarterly or after major incidents
**Next Review:** 2026-01-29
