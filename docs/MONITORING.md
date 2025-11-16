# KAMIYO Production Monitoring Guide

## Overview

This guide covers comprehensive monitoring setup for KAMIYO on Render.com, including health checks, logging, metrics, alerts, and observability best practices.

**Target Audience:** DevOps Engineers, Site Reliability Engineers, Platform Engineers
**Last Updated:** 2025-10-28
**Platform:** Render.com

---

## Table of Contents

1. [Render.com Native Monitoring](#rendercom-native-monitoring)
2. [Health Check Endpoints](#health-check-endpoints)
3. [Logging Strategy](#logging-strategy)
4. [Metrics & Observability](#metrics--observability)
5. [Alerting Configuration](#alerting-configuration)
6. [Performance Monitoring](#performance-monitoring)
7. [Error Tracking](#error-tracking)
8. [Database Monitoring](#database-monitoring)
9. [Cost Monitoring](#cost-monitoring)
10. [Incident Response](#incident-response)

---

## Render.com Native Monitoring

### Service Dashboard

**Access:** [https://dashboard.render.com](https://dashboard.render.com)

Each service provides built-in monitoring:

#### API Service (kamiyo-api)
- **Metrics Tab:**
  - CPU usage (%)
  - Memory usage (MB)
  - Request count
  - Response times (p50, p95, p99)
  - HTTP status codes (2xx, 4xx, 5xx)

- **Logs Tab:**
  - Real-time application logs
  - Search and filter by time range
  - Download logs for analysis

#### Frontend Service (kamiyo-frontend)
- **Build logs:** Track deployment builds
- **Runtime logs:** Next.js application logs
- **Memory/CPU:** Resource utilization

#### Worker Services (kamiyo-aggregator, kamiyo-social-watcher)
- **Logs:** Background job execution
- **Restart count:** Service stability metrics
- **Memory:** Worker memory consumption

### Database Monitoring (kamiyo-postgres)

**Metrics Available:**
- Connection count
- Database size
- Query performance (slow queries)
- CPU and memory usage
- Backup status

**Access Database Metrics:**
```bash
# Via Render dashboard
Dashboard > kamiyo-postgres > Metrics

# Query database directly
psql $DATABASE_URL

# Check database size
SELECT pg_size_pretty(pg_database_size('kamiyo'));

# Active connections
SELECT count(*) FROM pg_stat_activity;

# Slow queries (if pg_stat_statements enabled)
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Render Health Checks

**Configuration in render.yaml:**
```yaml
services:
  - type: web
    name: kamiyo-api
    healthCheckPath: /health
```

**How it Works:**
1. Render pings `/health` endpoint every 30 seconds
2. Expects HTTP 200 response
3. If health check fails 3 consecutive times, service is restarted
4. Zero-downtime deployments wait for health checks to pass

**Custom Health Check Intervals:**
- Not configurable on Render (fixed 30s interval)
- Use `/ready` endpoint for Kubernetes-style readiness checks

---

## Health Check Endpoints

### 1. `/health` - Comprehensive Health Check

**Purpose:** Application-level health monitoring

**Response Example:**
```json
{
  "status": "healthy",
  "database_exploits": 1543,
  "tracked_chains": 12,
  "active_sources": 17,
  "total_sources": 20,
  "timestamp": "2025-10-28T12:00:00Z",
  "version": "1.0.0",
  "python_version": "3.11.7",
  "environment": "production",
  "system": {
    "cpu_percent": 12.5,
    "memory_percent": 45.2,
    "disk_percent": 23.1
  },
  "sources": [...]
}
```

**Monitoring Script:**
```bash
#!/bin/bash
# Monitor KAMIYO health
API_URL="https://api.kamiyo.ai"

# Health check
response=$(curl -s "${API_URL}/health")
status=$(echo $response | jq -r '.status')

if [ "$status" != "healthy" ]; then
  echo "ALERT: API unhealthy!"
  echo $response | jq
  exit 1
fi

# Check key metrics
exploits=$(echo $response | jq -r '.database_exploits')
active_sources=$(echo $response | jq -r '.active_sources')

echo "✓ API healthy - $exploits exploits, $active_sources active sources"
```

### 2. `/ready` - Readiness Probe

**Purpose:** Kubernetes-style readiness check

**Checks:**
- Database connectivity (SELECT 1)
- Redis connectivity (if enabled)
- Critical dependencies

**Response:**
```json
{
  "status": "ready",
  "database": "healthy",
  "redis": "healthy"
}
```

**Use Cases:**
- Load balancer health checks
- Deployment verification
- Auto-scaling readiness

### 3. `/` - Root Endpoint

**Purpose:** Basic availability check

**Response:**
```json
{
  "name": "Kamiyo Exploit Intelligence API",
  "version": "1.0.0",
  "endpoints": {...}
}
```

---

## Logging Strategy

### Structured Logging

**Log Format:** JSON (structured)

**Log Levels:**
- `DEBUG`: Development-only diagnostics
- `INFO`: Normal operations (startup, requests)
- `WARNING`: Degraded performance, non-critical issues
- `ERROR`: Application errors, exceptions
- `CRITICAL`: System failures requiring immediate action

### Accessing Logs on Render

#### Real-Time Logs (Dashboard)
```
Dashboard > Service > Logs Tab
```

- Live tail of logs
- Search by keyword
- Filter by time range (last 7 days max)

#### Download Logs
```bash
# Install Render CLI
npm install -g @render/cli

# Login
render login

# Tail logs
render logs --service kamiyo-api --tail 100

# Download logs to file
render logs --service kamiyo-api --since 24h > kamiyo-api-logs.txt
```

#### Log Retention
- **Free tier:** 7 days
- **Paid tier:** 7 days (default)
- **Recommendation:** Export critical logs to external storage

### Log Aggregation (External)

For production, export logs to centralized logging:

#### Option 1: Datadog Integration
```yaml
# render.yaml
services:
  - type: web
    name: kamiyo-api
    envVars:
      - key: DD_API_KEY
        sync: false
      - key: DD_SITE
        value: datadoghq.com
      - key: DD_SERVICE
        value: kamiyo-api
      - key: DD_ENV
        value: production
```

**Log Forwarding:**
```python
# In application startup
import logging
from ddtrace import tracer

logging.basicConfig(
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    level=logging.INFO
)

# Datadog automatically collects stdout logs
```

#### Option 2: Logtail (Render Partner)
```yaml
envVars:
  - key: LOGTAIL_SOURCE_TOKEN
    sync: false
```

**Setup:**
1. Sign up at [logtail.com](https://logtail.com)
2. Create source token
3. Add to Render environment
4. Logs auto-forwarded

#### Option 3: Sentry (Already Configured)
```yaml
envVars:
  - key: SENTRY_DSN
    sync: false
```

**Benefits:**
- Error aggregation
- Stack traces
- Release tracking
- Performance monitoring

### Log Monitoring Patterns

**Critical Patterns to Alert On:**
```bash
# Database errors
grep -i "database connection failed" logs.txt

# Payment failures
grep -i "stripe.*error" logs.txt

# Security issues
grep -i "csrf.*failed\|authentication.*error" logs.txt

# Performance degradation
grep -i "timeout\|slow query" logs.txt

# Memory issues
grep -i "out of memory\|killed" logs.txt
```

**Useful Log Queries:**
```bash
# Error rate (last hour)
grep "ERROR" logs.txt | wc -l

# Top error messages
grep "ERROR" logs.txt | cut -d' ' -f5- | sort | uniq -c | sort -rn | head -10

# Requests per minute
grep "GET\|POST" logs.txt | cut -d' ' -f1 | uniq -c

# Slow queries (>1s)
grep "duration.*[0-9][0-9][0-9][0-9]ms" logs.txt
```

---

## Metrics & Observability

### Prometheus Metrics (Optional)

**Setup Prometheus Endpoint:**
```python
# api/main.py
from prometheus_client import Counter, Histogram, generate_latest

# Metrics
http_requests_total = Counter(
    'kamiyo_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration = Histogram(
    'kamiyo_http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint']
)

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type="text/plain")
```

**Metrics to Track:**
- `kamiyo_http_requests_total` - Request count by endpoint
- `kamiyo_http_request_duration_seconds` - Response time histogram
- `kamiyo_active_subscriptions` - Current paid users
- `kamiyo_exploits_total` - Total exploits in database
- `kamiyo_aggregator_fetch_duration_seconds` - Source fetch latency
- `kamiyo_database_connections` - Active DB connections
- `kamiyo_cache_hit_rate` - Redis cache efficiency

### Application Performance Monitoring (APM)

#### Recommended: Datadog APM
```python
# Install
pip install ddtrace

# Run with tracing
ddtrace-run uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

**Metrics Collected:**
- Request throughput
- Latency (p50, p95, p99)
- Error rates
- Database query performance
- External API call latency

#### Alternative: New Relic
```bash
# Install
pip install newrelic

# Configure
newrelic-admin generate-config $NEW_RELIC_LICENSE_KEY newrelic.ini

# Run
NEW_RELIC_CONFIG_FILE=newrelic.ini newrelic-admin run-program uvicorn api.main:app
```

### Key Performance Indicators (KPIs)

**API Performance:**
- Request latency (p95): < 500ms
- Error rate: < 0.1%
- Uptime: > 99.9%

**Database Performance:**
- Query time (p95): < 100ms
- Connection pool utilization: < 80%
- Slow queries: 0 per hour

**Worker Performance:**
- Aggregator cycle time: < 5 minutes
- Failed jobs: < 1%
- Queue depth: < 100

---

## Alerting Configuration

### Render Native Alerts

**Setup:**
1. Go to Dashboard > Service > Settings
2. Enable "Notifications"
3. Configure alert channels:
   - Email
   - Slack
   - Discord
   - Webhook

**Alert Types:**
- Service crashes
- Deployment failures
- Build failures
- High resource usage (CPU/memory)

### Custom Alerts with UptimeRobot

**Free tier:**
- 50 monitors
- 5-minute checks
- Email/SMS/Slack alerts

**Setup:**
```
1. Sign up: https://uptimerobot.com
2. Create monitors:
   - HTTPS: https://api.kamiyo.ai/health
   - HTTPS: https://kamiyo.ai
   - Keyword: "healthy" (in /health response)
3. Alert contacts:
   - Email: ops@kamiyo.ai
   - Slack: #alerts channel
```

**Monitor Configuration:**
- **API Health:** Check every 5 minutes, alert if down 2 times
- **Frontend:** Check every 5 minutes, alert if down 2 times
- **Database:** Indirect check via API health

### PagerDuty Integration

**For 24/7 on-call:**
```yaml
# Create escalation policy
1. Primary on-call: Alert immediately
2. Secondary on-call: Alert after 15 minutes
3. Engineering manager: Alert after 30 minutes

# Integration
- Integrate with UptimeRobot
- Integrate with Datadog
- Integrate with Sentry
```

### Alert Runbook

**Critical Alerts (Page Immediately):**
- API down > 5 minutes
- Database unreachable
- Payment processing failures
- Data corruption detected
- Security breach detected

**Warning Alerts (Email/Slack):**
- High error rate (> 1%)
- Slow response times (> 2s)
- High memory usage (> 80%)
- Failed background jobs
- Low cache hit rate (< 50%)

**Info Alerts (Log Only):**
- Deployment completed
- New user signup
- Large exploit detected
- Aggregator cycle completed

---

## Performance Monitoring

### Response Time Tracking

**Using curl:**
```bash
# Create timing template
cat > /tmp/curl-timing.txt << 'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
         time_total:  %{time_total}s\n
EOF

# Test endpoint
curl -w "@/tmp/curl-timing.txt" -o /dev/null -s https://api.kamiyo.ai/exploits?page=1&page_size=10
```

**Automated Performance Tests:**
```bash
#!/bin/bash
# performance-check.sh

ENDPOINTS=(
  "/health"
  "/exploits?page=1&page_size=10"
  "/stats?days=1"
  "/chains"
)

for endpoint in "${ENDPOINTS[@]}"; do
  time_total=$(curl -w '%{time_total}' -o /dev/null -s "https://api.kamiyo.ai${endpoint}")
  echo "$endpoint: ${time_total}s"

  # Alert if > 1 second
  if (( $(echo "$time_total > 1.0" | bc -l) )); then
    echo "ALERT: Slow response on $endpoint"
  fi
done
```

### Load Testing

**Using Apache Bench:**
```bash
# Test API endpoint
ab -n 1000 -c 10 https://api.kamiyo.ai/exploits?page=1&page_size=10

# Expected results:
# - Requests per second: > 100
# - Time per request: < 100ms
# - Failed requests: 0
```

**Using k6 (Recommended):**
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Steady
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% < 500ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

export default function () {
  let response = http.get('https://api.kamiyo.ai/exploits?page=1&page_size=10');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

```bash
# Run load test
k6 run load-test.js
```

---

## Error Tracking

### Sentry Configuration

**Already integrated in KAMIYO:**
```python
# api/main.py startup
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.1,  # 10% of transactions
    integrations=[FastApiIntegration()]
)
```

**Sentry Dashboard:**
- **Issues:** Grouped errors with stack traces
- **Performance:** Transaction monitoring
- **Releases:** Track errors by deployment
- **Alerts:** Real-time error notifications

**Key Metrics to Monitor:**
- Error count (last 24h)
- New issues introduced
- Unresolved issues
- Error rate by endpoint
- Crash-free rate

### Error Rate Monitoring

**Acceptable Error Rates:**
- **Critical endpoints** (auth, payments): < 0.01%
- **API endpoints**: < 0.1%
- **Background jobs**: < 1%

**Alert Thresholds:**
- Spike: +50% error rate in 5 minutes
- Sustained: > 1% error rate for 15 minutes
- Critical: Payment processing errors > 0

---

## Database Monitoring

### PostgreSQL Monitoring

**Key Metrics:**
```sql
-- Connection count
SELECT count(*) as connections
FROM pg_stat_activity;

-- Database size
SELECT pg_size_pretty(pg_database_size('kamiyo')) as size;

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Slow queries (requires pg_stat_statements)
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Cache hit ratio (should be > 95%)
SELECT
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
FROM pg_statio_user_tables;
```

### Database Alerts

**Critical:**
- Connection pool exhaustion (> 95% used)
- Database size > 90% of allocated
- Replication lag > 10 seconds
- Failed backups

**Warning:**
- Slow query detected (> 1s)
- Cache hit ratio < 95%
- Unused indexes detected
- Table bloat > 20%

---

## Cost Monitoring

### Render Cost Tracking

**Service Costs (as of 2025):**
- **Web Services:** $7-25/month per service
- **PostgreSQL Starter:** $7/month
- **PostgreSQL Standard:** $20/month
- **Workers:** $7/month per worker

**Monitor Usage:**
```
Dashboard > Billing > Usage
```

**Cost Optimization:**
- Use shared PostgreSQL for dev/staging
- Scale down non-critical services
- Optimize worker schedules
- Use caching to reduce compute

### Third-Party Service Costs

**Sentry:**
- Free tier: 5K errors/month
- Team: $26/month (50K errors)

**Datadog (Optional):**
- Pro: $15/host/month
- APM: $31/host/month

**Total Estimated Monthly Cost:**
- Render: ~$50-100/month
- Sentry: $0-26/month
- Monitoring (optional): $0-50/month
- **Total: $50-176/month**

---

## Incident Response

### Incident Severity Levels

**SEV-1 (Critical):**
- Complete service outage
- Data loss/corruption
- Security breach
- Payment system down

**Response:**
- Alert on-call immediately
- Start incident response
- Update status page
- Executive notification

**SEV-2 (High):**
- Partial service degradation
- High error rates (> 5%)
- Performance issues affecting users
- Database connection issues

**Response:**
- Alert on-call
- Investigate within 15 minutes
- Begin mitigation
- User communication

**SEV-3 (Medium):**
- Minor service degradation
- Non-critical feature broken
- Isolated user issues

**Response:**
- Create ticket
- Investigate within 1 hour
- Fix in next deployment

**SEV-4 (Low):**
- UI bugs
- Documentation issues
- Minor performance degradation

**Response:**
- Create ticket
- Fix in backlog

### Incident Response Checklist

**1. Detection (0-5 minutes):**
- [ ] Alert received
- [ ] Severity assessed
- [ ] Incident commander assigned
- [ ] War room created (Slack/Discord)

**2. Investigation (5-15 minutes):**
- [ ] Check health endpoints
- [ ] Review error logs
- [ ] Check recent deployments
- [ ] Identify root cause

**3. Mitigation (15-30 minutes):**
- [ ] Apply temporary fix OR
- [ ] Rollback deployment OR
- [ ] Scale resources OR
- [ ] Disable problematic feature

**4. Communication:**
- [ ] Update status page
- [ ] Notify affected users
- [ ] Update stakeholders

**5. Resolution:**
- [ ] Verify fix deployed
- [ ] Confirm services healthy
- [ ] Update status page
- [ ] Close incident

**6. Post-Incident (24-48 hours):**
- [ ] Write incident report
- [ ] Conduct post-mortem
- [ ] Identify action items
- [ ] Update runbooks

### Status Page

**Recommended:** [status.io](https://status.io) or [statuspage.io](https://statuspage.io)

**Components to Track:**
- API (kamiyo-api)
- Website (kamiyo-frontend)
- Database (kamiyo-postgres)
- Aggregator
- Payment Processing

**Incident Updates:**
- Investigating
- Identified
- Monitoring
- Resolved

---

## Monitoring Checklist

### Daily Monitoring
- [ ] Check Render dashboard for service health
- [ ] Review Sentry for new errors
- [ ] Check alert notifications
- [ ] Verify backups completed

### Weekly Monitoring
- [ ] Review performance trends
- [ ] Analyze error patterns
- [ ] Check database size growth
- [ ] Review slow queries
- [ ] Verify monitoring coverage

### Monthly Monitoring
- [ ] Review SLO compliance
- [ ] Analyze cost trends
- [ ] Update monitoring documentation
- [ ] Test incident response
- [ ] Review and update alerts

---

## Key Metrics Dashboard

**Create a simple monitoring dashboard:**

```bash
#!/bin/bash
# monitoring-dashboard.sh

echo "=== KAMIYO Monitoring Dashboard ==="
echo "Generated: $(date)"
echo ""

# Health check
echo "=== Health Status ==="
curl -s https://api.kamiyo.ai/health | jq '{
  status: .status,
  exploits: .database_exploits,
  sources: .active_sources,
  cpu: .system.cpu_percent,
  memory: .system.memory_percent
}'

# Sentry errors (requires API key)
echo ""
echo "=== Sentry Errors (Last 24h) ==="
# Add Sentry API call here

# Database size
echo ""
echo "=== Database Metrics ==="
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('kamiyo')) as size;"

echo ""
echo "=== Recent Deployments ==="
render deployments --service kamiyo-api --limit 5

echo ""
echo "Dashboard complete"
```

Run daily and email results:
```bash
# Add to cron
0 9 * * * /path/to/monitoring-dashboard.sh | mail -s "KAMIYO Daily Health" ops@kamiyo.ai
```

---

## Useful Commands Reference

```bash
# View logs (last 100 lines)
render logs --service kamiyo-api --tail 100

# Check service status
render services list

# Manual deployment
render deploy --service kamiyo-api

# Connect to database
psql $DATABASE_URL

# Check disk usage
render shell --service kamiyo-api
df -h

# Monitor resource usage
render metrics --service kamiyo-api

# View recent deployments
render deployments --service kamiyo-api --limit 10
```

---

## Next Steps

1. **Set up external monitoring:**
   - [ ] UptimeRobot (free tier)
   - [ ] Sentry error tracking
   - [ ] Optional: Datadog APM

2. **Configure alerts:**
   - [ ] Email notifications
   - [ ] Slack integration
   - [ ] PagerDuty (if 24/7 on-call)

3. **Create dashboards:**
   - [ ] Grafana (if using Prometheus)
   - [ ] Datadog dashboard
   - [ ] Internal monitoring dashboard

4. **Document runbooks:**
   - [ ] Incident response procedures
   - [ ] Common issues and fixes
   - [ ] Escalation paths

5. **Test monitoring:**
   - [ ] Trigger test alerts
   - [ ] Verify alert delivery
   - [ ] Practice incident response

---

**Monitoring is critical for production readiness. This guide provides the foundation for reliable KAMIYO operations.**

**For questions or improvements, contact:** DevOps Team
**Document Version:** 1.0.0
**Platform:** Render.com
