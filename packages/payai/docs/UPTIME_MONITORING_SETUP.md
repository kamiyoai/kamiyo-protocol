# KAMIYO Uptime Monitoring Setup Guide

## Overview

This guide provides step-by-step instructions for setting up comprehensive uptime monitoring for the KAMIYO production environment. Uptime monitoring ensures immediate notification when services become unavailable or experience degraded performance.

## Table of Contents

1. [UptimeRobot Setup (Recommended)](#uptimerobot-setup-recommended)
2. [Alternative Monitoring Services](#alternative-monitoring-services)
3. [Status Page Configuration](#status-page-configuration)
4. [Alert Channels](#alert-channels)
5. [Maintenance Windows](#maintenance-windows)
6. [Troubleshooting](#troubleshooting)

---

## UptimeRobot Setup (Recommended)

UptimeRobot offers a free tier with 50 monitors at 5-minute intervals, making it ideal for production monitoring.

### Step 1: Create an Account

1. Visit [https://uptimerobot.com](https://uptimerobot.com)
2. Click "Sign Up Free"
3. Complete registration with your production email
4. Verify your email address

### Step 2: Configure Monitors

Create the following four monitors to cover all critical endpoints:

#### Monitor 1: API Health Check

**Purpose:** Verify the API backend is responsive and healthy

- **Monitor Type:** HTTP(s)
- **Friendly Name:** `KAMIYO API - Health`
- **URL:** `https://api.kamiyo.ai/health`
- **Monitoring Interval:** 5 minutes
- **Monitor Timeout:** 30 seconds
- **HTTP Method:** GET
- **Expected Status Code:** 200
- **Keyword Monitoring:** Enable
  - **Keyword Type:** Should exist
  - **Keyword Value:** `"status": "healthy"`

**Screenshots to capture:**
- Monitor creation form
- Monitor details page showing "Up" status

#### Monitor 2: API Ready Check

**Purpose:** Verify the API backend and all dependencies (database, external services) are operational

- **Monitor Type:** HTTP(s)
- **Friendly Name:** `KAMIYO API - Ready`
- **URL:** `https://api.kamiyo.ai/ready`
- **Monitoring Interval:** 5 minutes
- **Monitor Timeout:** 30 seconds
- **HTTP Method:** GET
- **Expected Status Code:** 200
- **Keyword Monitoring:** Enable
  - **Keyword Type:** Should exist
  - **Keyword Value:** `"status": "ready"`

**Advanced Settings:**
- Enable SSL certificate validation
- Follow redirects: Yes
- Alert when SSL certificate expires in: 7 days

#### Monitor 3: Frontend (Root Domain)

**Purpose:** Verify the main website is accessible

- **Monitor Type:** HTTP(s)
- **Friendly Name:** `KAMIYO Frontend - Root`
- **URL:** `https://kamiyo.ai`
- **Monitoring Interval:** 5 minutes
- **Monitor Timeout:** 30 seconds
- **HTTP Method:** GET
- **Expected Status Code:** 200
- **Keyword Monitoring:** Enable
  - **Keyword Type:** Should exist
  - **Keyword Value:** `KAMIYO` (website title or unique content)

**Advanced Settings:**
- Enable SSL certificate validation
- Follow redirects: Yes
- Alert when SSL certificate expires in: 7 days

#### Monitor 4: Frontend (WWW Subdomain)

**Purpose:** Verify the www subdomain is accessible and properly configured

- **Monitor Type:** HTTP(s)
- **Friendly Name:** `KAMIYO Frontend - WWW`
- **URL:** `https://www.kamiyo.ai`
- **Monitoring Interval:** 5 minutes
- **Monitor Timeout:** 30 seconds
- **HTTP Method:** GET
- **Expected Status Code:** 200
- **Keyword Monitoring:** Enable
  - **Keyword Type:** Should exist
  - **Keyword Value:** `KAMIYO`

**Advanced Settings:**
- Enable SSL certificate validation
- Follow redirects: Yes
- Alert when SSL certificate expires in: 7 days

### Step 3: Configure Alert Contacts

Set up multiple notification channels for redundancy:

#### Email Alerts

1. Navigate to "My Settings" > "Alert Contacts"
2. Click "Add Alert Contact"
3. Select "E-mail"
4. Enter: `ops@kamiyo.ai` (or your operations email)
5. Click "Create Alert Contact"
6. Verify the email address via confirmation email

**Recommended Email Addresses:**
- Primary: `ops@kamiyo.ai`
- Secondary: `engineering@kamiyo.ai`
- Executive: `cto@kamiyo.ai` (for critical alerts only)

#### Slack Integration

1. In Slack, create a dedicated channel: `#kamiyo-alerts`
2. In UptimeRobot, click "Add Alert Contact"
3. Select "Slack"
4. Click "Authorize UptimeRobot"
5. Select the `#kamiyo-alerts` channel
6. Complete authorization
7. Test the integration

**Slack Channel Configuration:**
```
Channel: #kamiyo-alerts
Purpose: Production monitoring alerts for KAMIYO services
Notifications: @channel for critical alerts
Members: On-call engineers, DevOps team, Engineering leads
```

#### PagerDuty Integration (Critical Alerts)

1. In PagerDuty, create a new service:
   - **Name:** KAMIYO Production Monitoring
   - **Integration Type:** Email
   - **Escalation Policy:** Follow your on-call rotation
2. Copy the integration email (e.g., `kamiyo@yourcompany.pagerduty.com`)
3. In UptimeRobot, add this as an email alert contact
4. Configure to only trigger for SEV1 incidents

**PagerDuty Service Configuration:**
```
Service Name: KAMIYO Production Monitoring
Integration: Email
Escalation Policy: KAMIYO On-Call Rotation
Incident Urgency: High
Auto-Resolution: 15 minutes after recovery
```

### Step 4: Configure Alert Settings

For each monitor, configure when alerts should trigger:

1. Click on a monitor
2. Go to "Alert Contacts To Notify"
3. Configure notifications:

**For API Health and Ready monitors:**
- Send notification when: Down
- Send notification after: 1 minute (to avoid false positives)
- Re-send notification: Every 5 minutes until resolved
- Send notification when back up: Yes

**For Frontend monitors:**
- Send notification when: Down
- Send notification after: 2 minutes (allow for brief outages)
- Re-send notification: Every 10 minutes until resolved
- Send notification when back up: Yes

**Alert Thresholds:**
```yaml
API Endpoints:
  - Alert after: 1 consecutive failure
  - Re-alert: Every 5 minutes
  - Recovery notification: Yes

Frontend:
  - Alert after: 2 consecutive failures (10 minutes)
  - Re-alert: Every 10 minutes
  - Recovery notification: Yes

SSL Certificates:
  - Alert when: 7 days before expiry
  - Re-alert: Daily until renewed
```

---

## Alternative Monitoring Services

While UptimeRobot is recommended, here are alternative services with their key features:

### Pingdom

**Best for:** Advanced performance monitoring and real user monitoring (RUM)

**Pricing:** Starts at $10/month

**Setup Steps:**
1. Sign up at [https://www.pingdom.com](https://www.pingdom.com)
2. Create "Uptime Check" for each endpoint
3. Configure transaction monitoring for critical user flows
4. Set up alerting via email, SMS, Slack, or PagerDuty

**Unique Features:**
- Real User Monitoring (RUM)
- Page speed monitoring
- Transaction monitoring (multi-step user flows)
- Root cause analysis
- Global monitoring locations

**Configuration Example:**
```yaml
Check Type: HTTP
Name: KAMIYO API Health
URL: https://api.kamiyo.ai/health
Check Interval: 1 minute
Check Locations:
  - US East
  - US West
  - Europe
  - Asia Pacific
Alert Policy: After 1 minute down
Contact Methods: Email, Slack, PagerDuty
```

### StatusCake

**Best for:** Budget-conscious teams needing many monitors

**Pricing:** Free tier available, paid plans start at $24.49/month

**Setup Steps:**
1. Sign up at [https://www.statuscake.com](https://www.statuscake.com)
2. Create "Uptime Test" for each endpoint
3. Configure page speed tests
4. Set up contact groups for alerts

**Unique Features:**
- Generous free tier
- Domain monitoring
- Server monitoring agent
- Virus scanning
- SSL monitoring

**Configuration Example:**
```yaml
Test Type: HTTP
Website Name: KAMIYO API Health
Website URL: https://api.kamiyo.ai/health
Check Rate: 5 minutes
Test Locations:
  - New York
  - London
  - Singapore
Confirmation: 2 servers
Contact Groups: [DevOps, Engineering]
```

### Better Uptime

**Best for:** Modern teams wanting beautiful status pages and incident management

**Pricing:** Starts at $18/month

**Setup Steps:**
1. Sign up at [https://betteruptime.com](https://betteruptime.com)
2. Create monitors for each endpoint
3. Set up on-call calendar
4. Configure status page
5. Integrate with incident management tools

**Unique Features:**
- Beautiful, customizable status pages
- Integrated on-call management
- Incident timeline and postmortems
- Phone call alerts
- Integrates with 100+ tools

**Configuration Example:**
```yaml
Monitor Type: HTTP
Name: KAMIYO API Health
URL: https://api.kamiyo.ai/health
Check Frequency: 30 seconds (on paid plans)
Expected Status Code: 200
Call Policy: On-call engineer
Escalation: After 5 minutes
Status Page: Public display
```

### Comparison Matrix

| Feature | UptimeRobot | Pingdom | StatusCake | Better Uptime |
|---------|-------------|---------|------------|---------------|
| **Free Tier** | 50 monitors | 14-day trial | Limited | 10 monitors |
| **Check Interval** | 5 min (free) | 1 min | 5 min | 30 sec (paid) |
| **Status Page** | Yes | Yes | Yes | Yes (beautiful) |
| **SMS Alerts** | Paid | Yes | Yes | Yes |
| **Phone Calls** | No | Paid | No | Yes |
| **API Access** | Yes | Yes | Yes | Yes |
| **Multi-step Monitoring** | No | Yes | No | Yes |
| **On-call Management** | No | No | No | Yes |
| **Best For** | Budget | Enterprise | Mid-size | Modern teams |

---

## Status Page Configuration

A public status page keeps users informed during incidents and builds trust.

### UptimeRobot Status Page

1. Navigate to "Status Pages"
2. Click "Add Status Page"
3. Configure:

**Basic Settings:**
```yaml
Status Page Name: KAMIYO Status
URL Slug: kamiyo-status
Custom Domain: status.kamiyo.ai (optional)
Timezone: UTC
```

**Monitors to Include:**
- [x] KAMIYO API - Health
- [x] KAMIYO API - Ready
- [x] KAMIYO Frontend - Root
- [x] KAMIYO Frontend - WWW

**Display Settings:**
- Show monitor names: Yes
- Show uptime percentages: Yes
- Uptime calculation: Last 30 days
- Show response times: Yes
- Custom logo: Upload KAMIYO logo
- Custom CSS: Match brand colors

**Incident History:**
- Display past incidents: Yes
- Incident history period: 90 days
- Allow subscribers: Yes

**Custom Domain Setup (Optional):**

If using `status.kamiyo.ai`:

1. In your DNS provider, add:
   ```
   Type: CNAME
   Name: status
   Value: stats.uptimerobot.com
   TTL: 3600
   ```

2. In UptimeRobot status page settings:
   - Custom Domain: `status.kamiyo.ai`
   - SSL: Automatic (provided by UptimeRobot)

3. Wait for DNS propagation (up to 48 hours)

### Status Page Content Template

**Welcome Message:**
```markdown
# KAMIYO Service Status

Welcome to the KAMIYO status page. Here you can view the real-time status of our
services and subscribe to updates.

For support inquiries, please contact: support@kamiyo.ai
```

**Service Descriptions:**
```yaml
API Health:
  Description: "Core API backend health check"
  Impact: "API requests may fail if this is down"

API Ready:
  Description: "Full API stack including database and external dependencies"
  Impact: "Some API features may be unavailable if this is degraded"

Frontend - Root:
  Description: "Main website (kamiyo.ai)"
  Impact: "Website may be inaccessible if this is down"

Frontend - WWW:
  Description: "WWW subdomain (www.kamiyo.ai)"
  Impact: "WWW links may not work if this is down"
```

### Incident Communication Template

When posting incidents to the status page:

**Investigating:**
```
We are currently investigating connectivity issues with [Service Name].
Our team has been notified and is working to identify the root cause.

Last updated: [Timestamp]
```

**Identified:**
```
We have identified the issue as [brief technical description].
Our team is implementing a fix.

Impact: [Description of user impact]
Estimated resolution: [Time estimate]

Last updated: [Timestamp]
```

**Monitoring:**
```
A fix has been implemented and we are monitoring the results.
[Service Name] should now be operational.

Last updated: [Timestamp]
```

**Resolved:**
```
This incident has been resolved. All services are operating normally.

Root cause: [Brief explanation]
Duration: [Total downtime]
Impact: [Services affected]

We apologize for any inconvenience caused.

Last updated: [Timestamp]
```

---

## Alert Channels

### Email Configuration

**Primary Operations Email:**
```yaml
Address: ops@kamiyo.ai
Forwards to:
  - on-call engineer (via PagerDuty)
  - engineering-team@kamiyo.ai
Filters:
  - Label: [KAMIYO-ALERT]
  - High priority
Auto-response: Off during incidents
```

**Gmail Filters (if using Gmail):**

1. Create filter for UptimeRobot emails:
   ```
   From: (alert@uptimerobot.com)
   Subject: ([KAMIYO])
   ```

2. Apply labels:
   - Label: KAMIYO-Alerts
   - Star the message
   - Never send to Spam

3. Set up mobile notifications for this label

### Slack Channel Setup

**Channel: #kamiyo-alerts**

**Purpose:**
```
Real-time monitoring alerts for KAMIYO production services.
For incidents, create threads to discuss resolution.
```

**Channel Settings:**
- Notifications: @channel mentions allowed (for critical only)
- Posting permissions: Admins and Apps
- Retention: Keep all messages

**Pinned Message Template:**
```markdown
## KAMIYO Alerts Channel

**What gets posted here:**
- Production service outages
- Degraded performance alerts
- SSL certificate expiry warnings
- Recovery notifications

**Severity Levels:**
- 🔴 SEV1: Service down - Page on-call immediately
- 🟡 SEV2: Degraded performance - Alert within 15min
- 🔵 SEV3: Non-critical - Alert within 1hr

**Response Protocol:**
1. On-call engineer acknowledges with 👀
2. Create thread for updates
3. Post resolution when resolved ✅

**Runbooks:** https://docs.kamiyo.ai/runbooks
**Status Page:** https://status.kamiyo.ai
```

**Slack Workflow (Optional):**

Create a Slack workflow to standardize incident response:

1. Trigger: New message in #kamiyo-alerts
2. If message contains "DOWN" or "CRITICAL":
   - Send @channel notification
   - Create incident thread
   - Post link to runbook
   - Tag on-call engineer

### PagerDuty Configuration

**Service Configuration:**
```yaml
Service Name: KAMIYO Production
Integration: Email (from UptimeRobot)
Escalation Policy: KAMIYO On-Call
Incident Urgency Rules:
  - If severity SEV1: High urgency
  - If severity SEV2: High urgency
  - If severity SEV3: Low urgency

Alert Grouping:
  - Group by: Service
  - Time window: 5 minutes

Auto-Resolution:
  - Timeout: 15 minutes after last update
```

**Notification Rules:**
```yaml
High Urgency:
  1. Push notification (immediate)
  2. SMS (after 5 minutes)
  3. Phone call (after 10 minutes)

Low Urgency:
  1. Push notification (immediate)
  2. SMS (after 30 minutes)
```

**Integration Setup:**

1. In PagerDuty, go to Services
2. Click "New Service"
3. Configure as above
4. Copy integration email
5. Add to UptimeRobot as alert contact
6. Test with a manual incident

### SMS Alerts (via Twilio - Optional)

For critical alerts without PagerDuty:

**Setup:**
1. Create Twilio account
2. Purchase phone number
3. Configure webhook in UptimeRobot (paid tier required)
4. Set up Twilio function to send SMS:

```javascript
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.MessagingResponse();

  const monitorName = event.monitorName || 'Unknown';
  const alertType = event.alertType || 'DOWN';
  const monitorURL = event.monitorURL || 'N/A';

  const message = `[KAMIYO ALERT] ${monitorName} is ${alertType}. URL: ${monitorURL}`;

  twiml.message(message);
  callback(null, twiml);
};
```

---

## Maintenance Windows

Schedule maintenance windows to prevent false alerts during planned work.

### UptimeRobot Maintenance Windows

**Creating a Maintenance Window:**

1. Navigate to "Maintenance Windows"
2. Click "Add Maintenance Window"
3. Configure:

```yaml
Type: Once / Weekly / Monthly
Start Date: [Date]
Start Time: [Time in UTC]
Duration: [Hours]
Monitors: [Select affected monitors]
Reason: [Brief description]
```

**Example Maintenance Windows:**

**Database Upgrade:**
```yaml
Type: Once
Start: 2025-11-01 02:00 UTC (off-peak hours)
Duration: 2 hours
Monitors:
  - KAMIYO API - Health
  - KAMIYO API - Ready
Reason: PostgreSQL version upgrade
Notifications: Announce 48 hours in advance
```

**Weekly Backup Window:**
```yaml
Type: Weekly
Day: Sunday
Start: 03:00 UTC
Duration: 30 minutes
Monitors:
  - KAMIYO API - Ready (database backup running)
Reason: Weekly full database backup
Notifications: Not required (routine maintenance)
```

**Deploy Window:**
```yaml
Type: Once
Start: [Deploy time] UTC
Duration: 15 minutes
Monitors: All
Reason: Production deployment - v1.2.3
Notifications: Post in #engineering 1 hour before
```

### Maintenance Communication

**Internal Notification (1 week before):**
```markdown
Subject: Upcoming Maintenance - Database Upgrade

Team,

We will be performing a database upgrade on:
Date: November 1, 2025
Time: 02:00-04:00 UTC (10 PM - 12 AM EST)
Expected downtime: 30 minutes
Total window: 2 hours

Services affected:
- API will be unavailable during database upgrade
- Frontend will show maintenance page
- No data loss expected

Rollback plan: Documented in runbook #DB-UPGRADE-001

Please acknowledge receipt and block your calendars for the on-call window.
```

**External Notification (48 hours before):**
```markdown
Subject: Scheduled Maintenance - November 1

Dear KAMIYO Users,

We will be performing scheduled maintenance to improve performance and reliability.

Scheduled Time: November 1, 2025 at 02:00 UTC
Duration: Approximately 30 minutes
Impact: KAMIYO services will be temporarily unavailable

We apologize for any inconvenience and appreciate your patience.

Status updates: https://status.kamiyo.ai
Questions: support@kamiyo.ai
```

**Status Page Announcement:**

Post to status page 24 hours before and update during maintenance:

```markdown
# Scheduled Maintenance

We will be performing scheduled maintenance on November 1, 2025 at 02:00 UTC.

Expected duration: 30 minutes
Expected impact: All services temporarily unavailable

Subscribe to updates to receive notifications when maintenance begins and ends.
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: False Positive Alerts

**Symptoms:**
- Monitor reports DOWN but service is actually accessible
- Intermittent DOWN alerts that resolve immediately

**Solutions:**

1. **Increase timeout value:**
   - Current: 30 seconds
   - Try: 60 seconds for slower endpoints

2. **Add confirmation servers:**
   - UptimeRobot can check from multiple locations
   - Only alert if 2+ locations report down

3. **Adjust alert timing:**
   - Wait for 2 consecutive failures before alerting
   - Current: Alert after 1 minute
   - Try: Alert after 2-3 minutes

4. **Check keyword monitoring:**
   - Ensure keyword exists in healthy responses
   - Keyword is case-sensitive
   - Use a stable keyword that won't change

#### Issue: Monitor Not Triggering Alerts

**Symptoms:**
- Service is down but no alert received
- Monitor shows DOWN in dashboard but no notifications

**Solutions:**

1. **Verify alert contacts are active:**
   - Check email delivery (spam folder)
   - Verify Slack integration is authorized
   - Test PagerDuty integration

2. **Check alert settings:**
   - Ensure "Alert Contacts To Notify" is configured
   - Verify notification thresholds
   - Check if monitor is paused

3. **Test alert manually:**
   - Pause the monitor
   - Wait for it to show DOWN
   - Unpause and verify alert

4. **Check UptimeRobot logs:**
   - Navigate to monitor details
   - View "Logs" tab
   - Look for notification delivery status

#### Issue: SSL Certificate Alerts Not Working

**Symptoms:**
- Certificate expired without warning
- No alerts before expiry

**Solutions:**

1. **Enable SSL monitoring:**
   - Edit monitor
   - Advanced Settings
   - Enable "Alert when SSL expires in: 7 days"

2. **Verify certificate chain:**
   - Use SSL Labs: https://www.ssllabs.com/ssltest/
   - Ensure intermediate certificates are included
   - Check for certificate transparency issues

3. **Set up redundant monitoring:**
   - Use multiple services (UptimeRobot + SSL Labs)
   - Set calendar reminder 15 days before expiry
   - Configure Render.com to alert on certificate issues

#### Issue: High Alert Fatigue

**Symptoms:**
- Too many alerts
- Team ignoring alerts
- Genuine incidents missed

**Solutions:**

1. **Adjust alert thresholds:**
   - Increase "down" confirmation time
   - Reduce re-alert frequency for non-critical monitors
   - Use different channels for different severities

2. **Implement alert aggregation:**
   - Use PagerDuty to group similar alerts
   - Set up incident timelines
   - Create summary notifications

3. **Review and tune monitors:**
   - Remove redundant monitors
   - Adjust keyword monitoring to be less sensitive
   - Use status code checking only where appropriate

4. **Create alert priority system:**
   ```yaml
   Critical (immediate page):
     - API down
     - Database unreachable

   High (15 min alert):
     - Degraded performance
     - Elevated error rates

   Low (1 hour alert):
     - SSL expiring soon
     - Status page issues
   ```

#### Issue: Status Page Not Updating

**Symptoms:**
- Monitors are down but status page shows green
- Status page is cached or stale

**Solutions:**

1. **Check status page configuration:**
   - Ensure monitors are added to status page
   - Verify status page is published (not draft)
   - Check if maintenance window is active

2. **Clear cache:**
   - Hard refresh browser (Ctrl+F5 or Cmd+Shift+R)
   - Check from incognito/private window
   - Verify DNS if using custom domain

3. **Verify monitor settings:**
   - Ensure monitor is not paused
   - Check if monitor is in maintenance mode
   - Verify alert settings are active

4. **Check UptimeRobot status:**
   - Visit https://status.uptimerobot.com
   - Verify UptimeRobot itself is operational
   - Check for platform-wide issues

### Monitor Performance Optimization

**Response Time Monitoring:**

If monitors show high response times:

1. **Identify bottlenecks:**
   - Check Render.com metrics
   - Review database query performance
   - Check external API dependencies

2. **Set up response time alerts:**
   ```yaml
   Warning threshold: > 2000ms average over 5 minutes
   Critical threshold: > 5000ms average over 5 minutes
   ```

3. **Optimize endpoints:**
   - Add caching headers to /health and /ready
   - Minimize database queries in health checks
   - Use lightweight health check logic

**Example Optimized Health Check:**

```python
@app.get("/health")
async def health_check():
    """Lightweight health check - no DB queries"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

@app.get("/ready")
async def readiness_check():
    """Full readiness check including dependencies"""
    try:
        # Quick DB check
        db.execute("SELECT 1")
        return {
            "status": "ready",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": str(e)}
        )
```

### Escalation to Support

If issues persist after troubleshooting:

**UptimeRobot Support:**
- Email: support@uptimerobot.com
- Response time: 24-48 hours
- Include: Monitor ID, timestamp, error logs

**Render.com Support:**
- Dashboard: https://render.com/support
- Response time: Based on plan (hours to days)
- Include: Service logs, timestamp, error messages

---

## Monitoring Checklist

Use this checklist to verify your monitoring setup:

### Initial Setup
- [ ] Account created and email verified
- [ ] All 4 monitors created and active
- [ ] Keyword monitoring configured for all monitors
- [ ] SSL monitoring enabled for all HTTPS monitors
- [ ] Email alert contact added and verified
- [ ] Slack integration configured and tested
- [ ] PagerDuty integration configured (if applicable)
- [ ] Alert thresholds set appropriately
- [ ] Status page created and published
- [ ] Status page monitors added
- [ ] Status page custom branding applied

### Weekly Maintenance
- [ ] Review monitor uptime percentages
- [ ] Check for any missed alerts
- [ ] Verify alert channels are working
- [ ] Review response time trends
- [ ] Update status page if needed

### Monthly Review
- [ ] Analyze downtime incidents
- [ ] Review and adjust alert thresholds
- [ ] Test alert escalation procedures
- [ ] Update monitor configurations if needed
- [ ] Review SSL certificate expiry dates
- [ ] Document any monitoring gaps

### Quarterly Audit
- [ ] Full test of all alert channels
- [ ] Review monitoring coverage
- [ ] Update runbooks based on incidents
- [ ] Evaluate alternative monitoring services
- [ ] Update contact information
- [ ] Review and optimize costs

---

## Additional Resources

### Documentation
- UptimeRobot API: https://uptimerobot.com/api/
- Render.com Health Checks: https://render.com/docs/health-checks
- KAMIYO Runbooks: See `docs/ON_CALL_ROTATION.md`

### Tools
- SSL Labs: https://www.ssllabs.com/ssltest/
- DNS Checker: https://dnschecker.org
- Uptime Calculator: https://uptime.is

### Monitoring Best Practices
- Google SRE Book: https://sre.google/sre-book/monitoring-distributed-systems/
- Incident Response: https://response.pagerduty.com/

---

## Support

For questions about this setup guide:
- Technical issues: engineering@kamiyo.ai
- Process questions: ops@kamiyo.ai
- Urgent incidents: Follow on-call rotation in `docs/ON_CALL_ROTATION.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Owner:** DevOps Team
**Review Cycle:** Quarterly
