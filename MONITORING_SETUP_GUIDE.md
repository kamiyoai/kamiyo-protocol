# Monitoring & Alerting Setup Guide
## KAMIYO x402 Infrastructure

**Last Updated**: November 9, 2025
**Status**: Ready for configuration

---

## Overview

Comprehensive monitoring stack for production deployment:
- **Sentry**: Error tracking and performance monitoring
- **UptimeRobot**: Uptime monitoring and health checks
- **Email Alerts**: Critical incident notifications
- **Health Checks**: Service status endpoints

---

## 1. Sentry Error Tracking

### Setup (10 minutes)

1. **Create Sentry Account**:
   - Go to https://sentry.io/signup/
   - Create organization: "KAMIYO"
   - Create project: "x402-infrastructure"
   - Select platform: "Next.js"

2. **Get DSN**:
   - Copy DSN from project settings
   - Format: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`

3. **Install Sentry SDK**:
   ```bash
   npm install --save @sentry/nextjs
   ```

4. **Configure Environment Variables**:
   ```bash
   # Add to .env and Render dashboard
   SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

5. **Initialize Sentry** (already implemented):
   - `lib/monitoring/sentry.js` - Main configuration
   - Auto-filters sensitive data (API keys, tokens)
   - Captures exceptions with context
   - Performance monitoring enabled

### Usage

The Sentry integration is already added to critical paths:

```javascript
import { captureException } from '../lib/monitoring/sentry';

try {
  // Your code
} catch (error) {
  captureException(error, {
    tenantId: tenant.id,
    endpoint: '/api/v1/x402/verify',
    chain: 'solana'
  });
  throw error;
}
```

### What Gets Tracked

- ✅ All API endpoint errors
- ✅ Payment verification failures
- ✅ Database connection issues
- ✅ Python verifier downtime
- ✅ Stripe webhook errors
- ✅ Authentication failures

### Sensitive Data Filtering

Automatically redacted:
- Authorization headers
- API keys
- Internal keys
- Session tokens
- Query string secrets

### Validation

Test error tracking:
```bash
# Trigger test error
curl https://kamiyo.ai/api/test-error

# Check Sentry dashboard
# Should see error with context
```

---

## 2. UptimeRobot Monitoring

### Setup (15 minutes)

1. **Create Account**:
   - Go to https://uptimerobot.com/signUp
   - Free plan includes 50 monitors

2. **Add Main Application Monitor**:
   - Name: "KAMIYO x402 - Main App"
   - Monitor Type: HTTP(s)
   - URL: `https://kamiyo.ai/api/v1/x402/health`
   - Monitoring Interval: 5 minutes
   - Monitor Timeout: 30 seconds
   - Alert When Down For: 2 minutes (2 failed checks)

3. **Add Python Verifier Monitor**:
   - Name: "KAMIYO x402 - Python Verifier"
   - Monitor Type: HTTP(s)
   - URL: `https://kamiyo-x402-verifier.onrender.com/health`
   - Monitoring Interval: 5 minutes
   - Alert When Down For: 2 minutes

4. **Add Database Monitor**:
   - Name: "KAMIYO x402 - PostgreSQL"
   - Monitor Type: Port
   - Host: Your Render PostgreSQL host
   - Port: 5432
   - Monitoring Interval: 10 minutes

5. **Configure Alert Contacts**:
   - Add email: dev@kamiyo.ai
   - Add SMS (optional): Your phone number
   - Add webhook (optional): Slack/Discord

### Health Check Endpoints

**Main App**: `/api/v1/x402/health`
```json
{
  "status": "healthy",
  "timestamp": "2025-11-09T10:30:00.000Z",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 45
    },
    "verifier": {
      "status": "healthy",
      "mode": "http_api",
      "endpoint": "https://kamiyo-x402-verifier.onrender.com"
    }
  },
  "recentErrors": 0
}
```

**Python Verifier**: `/health`
```json
{
  "status": "ok",
  "service": "x402-verifier",
  "supported_chains": ["base", "ethereum", "solana"]
}
```

### Expected Response Times

- Main App Health: < 200ms
- Verifier Health: < 100ms
- Database Latency: < 50ms

### Alert Thresholds

Configure alerts for:
- ⚠️ Response time > 1000ms
- 🔴 Service down (2 consecutive failures)
- 🔴 HTTP status != 200

---

## 3. Email Alert System

### Setup

1. **Get Resend API Key**:
   - Go to https://resend.com/signup
   - Create API key
   - Verify sending domain (or use test mode)

2. **Configure Environment Variables**:
   ```bash
   RESEND_API_KEY=re_xxxxx
   ALERT_EMAIL=dev@kamiyo.ai
   FROM_EMAIL=alerts@kamiyo.ai  # Must be verified in Resend
   ```

3. **Test Email Alerts**:
   ```bash
   node scripts/test_monitoring.js
   ```

### Alert Types (already implemented)

**Critical Alerts** (immediate action required):
- 🔴 Service down (main app or verifier)
- 🔴 High error rate (> 50%)
- 🔴 Python verifier unreachable
- 🔴 Database connection failed
- 🔴 Quota exceeded (100%)

**Warning Alerts** (action needed soon):
- ⚠️ High error rate (> 10%)
- ⚠️ Quota warning (> 80%)
- ⚠️ Payment failed
- ⚠️ Slow query detected
- ⚠️ Suspicious activity

**Info Alerts** (informational):
- ℹ️ New tenant signup
- ℹ️ Subscription upgraded
- ℹ️ Large payment verified

### Alert Format

All emails include:
- Severity level (CRITICAL/WARNING/INFO)
- Timestamp
- Detailed error message
- Stack trace (if applicable)
- Recommended actions
- Links to dashboards

---

## 4. Health Check Implementation

### Enhanced Health Endpoint

Location: `/api/v1/x402/health`

Checks:
1. **Database**: Connection + latency
2. **Python Verifier**: Reachability + response time
3. **Recent Errors**: Count from Sentry integration

Response Codes:
- `200 OK`: All systems healthy
- `503 Service Unavailable`: Critical system down

### Monitoring Dashboard

Create monitoring dashboard:
```bash
# View real-time health
curl https://kamiyo.ai/api/v1/x402/health | jq

# Check verifier
curl https://kamiyo-x402-verifier.onrender.com/health | jq
```

---

## 5. Production Monitoring Checklist

### Pre-Deployment

- [ ] Sentry DSN configured in all services
- [ ] UptimeRobot monitors created (main + verifier)
- [ ] Email alerts configured with Resend
- [ ] Alert email verified and tested
- [ ] Health endpoints returning 200 OK
- [ ] Database latency < 100ms
- [ ] Verifier response time < 200ms

### Post-Deployment

- [ ] Verify UptimeRobot monitors are up
- [ ] Check Sentry receives test errors
- [ ] Confirm email alerts deliver
- [ ] Monitor for 24 hours
- [ ] Review error patterns
- [ ] Tune alert thresholds if needed

---

## 6. Monitoring Best Practices

### Error Rate Thresholds

- **Normal**: < 1% errors
- **Warning**: 1-10% errors
- **Critical**: > 10% errors

### Response Time Targets

- **API Requests**: < 500ms (p95)
- **Health Checks**: < 200ms
- **Database Queries**: < 50ms
- **Verifier Calls**: < 1000ms

### Uptime Targets

- **Main Application**: 99.9% (< 43 min/month downtime)
- **Python Verifier**: 99.9%
- **Database**: 99.95% (Render SLA)

---

## 7. Alert Response Procedures

### Service Down (CRITICAL)

1. Check Render dashboard for service status
2. Review error logs in Sentry
3. Check recent deployments (possible bad deploy)
4. Verify environment variables set correctly
5. Restart service if needed
6. Rollback deployment if issue persists
7. Update status page (if applicable)

### High Error Rate (WARNING)

1. Check Sentry for error patterns
2. Identify affected endpoints
3. Review recent code changes
4. Check for quota/rate limit issues
5. Monitor database performance
6. Scale resources if needed

### Payment Verification Failing

1. Check Python verifier status
2. Verify RPC endpoints accessible
3. Check blockchain RPC rate limits
4. Review transaction hashes in logs
5. Test with known good transaction
6. Alert affected customers if widespread

---

## 8. Monitoring Scripts

### Test All Monitors

```bash
# Run comprehensive monitoring test
node scripts/test_monitoring.js

# Expected output:
# ✓ Sentry error tracking
# ✓ UptimeRobot health checks
# ✓ Email alert delivery
# ✓ Database latency check
# ✓ Verifier connectivity
```

### Manual Health Check

```bash
# Check all services
./scripts/health_check.sh

# Output:
# Main App: ✓ HEALTHY (120ms)
# Verifier: ✓ HEALTHY (80ms)
# Database: ✓ HEALTHY (35ms)
```

---

## 9. Dashboard Access

### Monitoring Dashboards

- **Sentry**: https://sentry.io/organizations/kamiyo/
- **UptimeRobot**: https://uptimerobot.com/dashboard
- **Render**: https://dashboard.render.com
- **Stripe**: https://dashboard.stripe.com

### Credentials

Store securely in password manager:
- Sentry login
- UptimeRobot login
- Render dashboard access
- Resend API key

---

## 10. Cost Breakdown

### Free Tier Limits

- **Sentry**: 5,000 errors/month (free)
- **UptimeRobot**: 50 monitors, 5-min intervals (free)
- **Resend**: 100 emails/day (free)

### Paid Upgrades (Optional)

- **Sentry Team**: $26/month (50K errors)
- **UptimeRobot Pro**: $7/month (1-min intervals)
- **Resend Pro**: $20/month (unlimited emails)

**Recommended**: Start with free tier, upgrade as needed

---

## 11. Incident Response

### Severity Levels

**P0 - Critical** (respond within 15 min):
- Total service outage
- Data loss or corruption
- Security breach
- Payment processing stopped

**P1 - High** (respond within 1 hour):
- Partial service degradation
- High error rate (> 10%)
- Database slow queries
- Verifier intermittent failures

**P2 - Medium** (respond within 4 hours):
- Single endpoint failing
- Elevated latency
- Quota warnings
- Failed payments (< 5%)

**P3 - Low** (respond within 24 hours):
- Minor bugs
- Cosmetic issues
- Documentation updates
- Performance optimization

### On-Call Rotation

If team > 1 person:
- Set up PagerDuty or similar
- Define on-call schedule
- Document escalation procedures
- Test alerting quarterly

---

## 12. Next Steps

After monitoring is configured:

1. ✅ Test all alert types
2. ✅ Verify 24-hour monitoring data
3. ✅ Tune alert thresholds based on baseline
4. ✅ Document any false positives
5. → Proceed to production deployment (Task 5)

---

**Document Version**: 1.0
**Author**: KAMIYO Development Team
**Status**: Ready for Configuration
