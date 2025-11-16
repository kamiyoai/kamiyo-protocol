# On-Call Handbook - Kamiyo Platform

**Version:** 1.0
**Last Updated:** 2025-10-13
**Platform:** Kamiyo Exploit Intelligence Aggregator

---

## CRITICAL: Complete Contact Information Before Going On-Call

⚠️ **ACTION REQUIRED:** This section MUST be filled out before starting any on-call rotation. An incomplete contact list during a P0 incident can cost hours of downtime.

---

## Escalation Contacts

### Level 1: On-Call Engineer (You)
**When to self-resolve:**
- Database connection issues (Runbook 01)
- Service restart scenarios
- Stripe webhook failures (Runbook 02)
- Standard operational issues covered in runbooks

**Tools you need:**
- SSH access to production server
- Access to monitoring dashboards
- Stripe dashboard access
- Docker command access

---

### Level 2: Senior Engineer

**Contact Information:** (UPDATE BEFORE ON-CALL SHIFT)

```
Name:          ______________________ (UPDATE THIS!)
Phone:         ______________________ (UPDATE THIS!)
Slack:         @_____________________ (UPDATE THIS!)
Email:         ______________________ (UPDATE THIS!)
Timezone:      ______________________ (UPDATE THIS!)
Availability:  □ 24/7  □ Business hours only  □ Weekdays only
```

**When to escalate to Level 2:**
- Runbook recovery steps fail after 15-30 minutes
- Unknown error patterns not covered in documentation
- Multiple simultaneous failures
- Suspected security incident
- Need approval for risky recovery action

**Escalation SLA:** Respond within 15 minutes

---

### Level 3: Infrastructure Lead

**Contact Information:** (UPDATE BEFORE ON-CALL SHIFT)

```
Name:          ______________________ (UPDATE THIS!)
Phone:         ______________________ (UPDATE THIS!)
Slack:         @_____________________ (UPDATE THIS!)
Email:         ______________________ (UPDATE THIS!)
Timezone:      ______________________ (UPDATE THIS!)
Availability:  □ 24/7  □ Business hours only  □ Weekdays only
```

**When to escalate to Level 3:**
- Hardware/infrastructure failures
- Network connectivity issues
- Disk/storage problems
- Need to provision new resources
- Cloud provider outages
- Issues persisting after Level 2 involvement

**Escalation SLA:** Respond within 30 minutes

---

### Level 4: CTO / Incident Commander

**Contact Information:** (UPDATE BEFORE ON-CALL SHIFT)

```
Name:          ______________________ (UPDATE THIS!)
Phone:         ______________________ (UPDATE THIS!)
Slack:         @_____________________ (UPDATE THIS!)
Email:         ______________________ (UPDATE THIS!)
Timezone:      ______________________ (UPDATE THIS!)
Availability:  □ 24/7  □ Emergency only
```

**When to escalate to Level 4:**
- Extended outage (> 2 hours)
- Security breach confirmed
- Data loss suspected
- Major revenue impact
- Need executive decision on tradeoffs
- Major customer complaints

**Escalation SLA:** Respond within 1 hour

---

### External Vendors

#### Stripe Support
- **Dashboard:** https://dashboard.stripe.com
- **Support:** https://support.stripe.com
- **Phone:** Available in dashboard under "Contact Support"
- **When to contact:** Payment processing issues, webhook problems persisting > 30 min
- **Have ready:** Account ID, incident time, affected webhooks

#### Cloud Provider: Render.com
- **Dashboard:** https://dashboard.render.com
- **Support:** support@render.com
- **Status:** https://status.render.com
- **When to contact:** Platform issues, deployment failures
- **Have ready:** Service name, logs, error messages

#### Domain/DNS Provider
```
Provider:      ______________________ (UPDATE THIS!)
Support URL:   ______________________ (UPDATE THIS!)
Phone:         ______________________ (UPDATE THIS!)
Account ID:    ______________________ (UPDATE THIS!)
```

---

## Pre-Shift Checklist

Complete this checklist at the START of your on-call shift:

### Access Verification (Test these NOW, not during an incident)

```bash
# 1. SSH Access
ssh $SSH_USER@$SERVER_HOST
# Can you login? □ Yes  □ No

# 2. Docker Commands
docker ps
# Do you see containers? □ Yes  □ No

# 3. Health Check Script
./scripts/health_check.sh
# Does it run? □ Yes  □ No

# 4. Logs Access
docker logs kamiyo --tail=10
# Can you read logs? □ Yes  □ No

# 5. Database Access
docker exec kamiyo sqlite3 /app/data/kamiyo.db "SELECT COUNT(*) FROM exploits;"
# Returns a number? □ Yes  □ No
```

### Dashboards & Tools

Verify you can access:

- [ ] Monitoring Dashboard (if configured): http://SERVER_IP:3000
- [ ] Prometheus (if configured): http://SERVER_IP:9090
- [ ] Stripe Dashboard: https://dashboard.stripe.com
- [ ] GitHub Repository: https://github.com/[your-org]/kamiyo
- [ ] Cloud Provider Dashboard (Render/AWS/etc)

### Documentation

Verify you have local copies of:

- [ ] All runbooks in `/docs/runbooks/`
- [ ] TROUBLESHOOTING.md
- [ ] DEPLOYMENT_GUIDE.md
- [ ] This ON_CALL.md file

**Pro tip:** Print or save PDFs of runbooks. WiFi might fail during an incident.

### Contact List Verification

- [ ] All escalation contacts are filled in (not placeholders)
- [ ] Tested phone numbers are reachable
- [ ] Slack usernames are correct
- [ ] Timezone differences are noted

### Emergency Preparation

- [ ] Phone is charged
- [ ] Laptop is charged
- [ ] Know where laptop charger is
- [ ] Have backup internet (mobile hotspot)
- [ ] Wear clothes appropriate for video call at 3am

---

## Incident Response Workflow

### Step 1: Acknowledge Alert (within 5 minutes)

```
# Acknowledge in monitoring system
# Post in Slack #incidents channel:
"🚨 P[severity] Alert acknowledged. Investigating: [brief description]"
```

### Step 2: Assess Severity

| Severity | Impact | Response Time | Example |
|----------|--------|---------------|---------|
| **P0** | Complete outage | Immediate | API down, database crashed |
| **P1** | Major degradation | 15 min | Webhooks failing, slow responses |
| **P2** | Minor issues | 1 hour | Single feature broken |
| **P3** | Cosmetic | Next business day | UI typo, minor logs |

### Step 3: Follow Runbook

1. Find matching runbook in `/docs/runbooks/`
2. Start "Diagnosis Steps" section
3. Document each step result
4. Proceed to "Recovery Steps"
5. Verify fix with "Verification" section

### Step 4: Escalate if Needed

**Escalate if:**
- Runbook steps don't resolve issue after 15-30 minutes
- You're unsure of next step
- Multiple systems failing
- Data loss risk
- Customer impact severe

**How to escalate:**

```
# Phone call (preferred for P0/P1)
Call Level 2 contact

# Slack message format:
@[engineer] P[severity] escalation needed

Incident: [Brief title]
Started: [Time]
Impact: [What's broken]
Tried: [Recovery steps attempted]
Current state: [Status now]
Need: [What you need help with]

Dashboard: [monitoring URL if available]
Logs: [paste last 10 lines or attach file]
```

### Step 5: Document Everything

Keep a running log (in Slack thread or text file):

```
[HH:MM] Alert triggered - API health check failing
[HH:MM] Checked logs - database connection error
[HH:MM] Ran: docker compose restart kamiyo
[HH:MM] Service restarted, waiting 30s
[HH:MM] Health check passed - incident resolved
[HH:MM] Total downtime: 8 minutes
```

### Step 6: Post-Incident

After resolution:

```
# Post in Slack #incidents:
"✅ P[severity] Resolved - [brief description]

Cause: [what happened]
Fix: [what you did]
Downtime: [duration]
Followup: [ticket number for prevention]"
```

Create post-incident ticket:
- Root cause analysis
- Prevention steps
- Runbook updates needed
- Monitoring improvements

---

## Quick Command Reference

### Container is not running

```bash
docker ps -a | grep kamiyo  # Check if exists
docker compose up -d kamiyo  # Start it
docker logs kamiyo --tail=50  # Check why it stopped
```

### Service is slow/unresponsive

```bash
./scripts/health_check.sh  # Overall health
docker stats kamiyo  # Resource usage
docker logs kamiyo --tail=100 | grep -i error  # Recent errors
```

### Database issues

```bash
# Check database file
docker exec kamiyo ls -lh /app/data/kamiyo.db

# Test query
docker exec kamiyo sqlite3 /app/data/kamiyo.db "SELECT COUNT(*) FROM exploits;"

# Check integrity
docker exec kamiyo sqlite3 /app/data/kamiyo.db "PRAGMA integrity_check;"
```

### Stripe webhook issues

```bash
# Check webhook logs
docker logs kamiyo | grep -i webhook

# Verify secret is set
docker exec kamiyo env | grep STRIPE_WEBHOOK_SECRET

# Test endpoint
curl -X POST http://localhost:8000/api/v1/payments/webhook
```

### Need to restart

```bash
# Graceful restart
docker compose restart kamiyo

# Hard restart (if frozen)
docker compose down && docker compose up -d

# Full rebuild (if container is corrupted)
docker compose down
docker compose build --no-cache kamiyo
docker compose up -d
```

### Get help

```bash
# Check documentation
ls /Users/dennisgoslar/Projekter/kamiyo/website/docs/runbooks/

# Check troubleshooting guide
cat /Users/dennisgoslar/Projekter/kamiyo/website/docs/TROUBLESHOOTING.md | less
```

---

## Common Pitfalls

### Don't Panic
- Take 30 seconds to breathe
- Read the runbook fully before acting
- It's okay to escalate
- Users prefer 5 min wait over broken fix

### Don't Skip Steps
- Always run diagnosis before recovery
- Document what you tried
- Verify fix before declaring resolved
- Save logs before restarting

### Don't Go Rogue
- Follow runbooks (they're tested)
- Escalate rather than guessing
- Don't run destructive commands without backup
- Ask for help early

### Do Communicate
- Post in #incidents channel
- Update every 15 minutes on P0
- Tell users via status page (if available)
- Document everything

---

## After Your Shift

### Handoff Checklist

- [ ] No active incidents
- [ ] All incidents documented
- [ ] Post-incident tickets created
- [ ] Any temporary fixes documented
- [ ] Next on-call engineer notified
- [ ] Runbooks updated if needed

### Shift Report Template

```
On-Call Shift Report
Period: [start] to [end]

Incidents: [count]
- P0: [count] - [list]
- P1: [count] - [list]
- P2: [count] - [list]

Escalations: [count]
- Level 2: [count]
- Level 3: [count]

Lessons Learned:
- [What went well]
- [What could improve]
- [Documentation gaps]

Action Items:
- [Followup tickets created]
```

---

## Getting Help

### During Incident
1. Check runbooks first
2. Check TROUBLESHOOTING.md
3. Escalate per contact list above
4. Post in #incidents Slack channel

### Non-Urgent Questions
- Post in #devops Slack channel
- Email: devops@kamiyo.ai
- Create GitHub issue

### Improving This Document
- Found a mistake? Update it immediately
- Found a gap? Document it in post-incident
- Have a better process? Propose a PR

---

## Important File Locations

```
/Users/dennisgoslar/Projekter/kamiyo/website/
├── docs/
│   ├── runbooks/
│   │   ├── 01_database_connection_loss.md
│   │   ├── 02_stripe_webhook_failure.md
│   │   └── [more runbooks]
│   ├── TROUBLESHOOTING.md
│   ├── DEPLOYMENT_GUIDE.md
│   └── ON_CALL.md (this file)
├── scripts/
│   ├── health_check.sh
│   ├── backup_database.sh
│   └── deploy.sh
└── docker-compose.yml
```

---

## Legal & Compliance

- **PII Access:** Database contains user emails - handle with care
- **Payment Data:** We don't store credit cards - Stripe does
- **Logs:** May contain sensitive data - don't share publicly
- **Backups:** Stored locally - don't lose them

---

**Remember:** It's 3am. You're tired. The on-call phone rang. Take a breath. Open the runbook. Follow the steps. You've got this. And if you don't - that's what the escalation list is for. No heroes. Just working processes.

**End of On-Call Handbook**
