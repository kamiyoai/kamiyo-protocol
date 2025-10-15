# Kamiyo Incident Response Guide

Comprehensive guide for handling production incidents.

## Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P0 - Critical** | Complete service outage | < 15 minutes | API down, Database inaccessible |
| **P1 - High** | Major feature broken | < 1 hour | Payments failing, No new exploits |
| **P2 - Medium** | Degraded performance | < 4 hours | Slow response times, Cache issues |
| **P3 - Low** | Minor issues | < 24 hours | UI bugs, Documentation errors |

---

## Incident Response Process

### 1. Detection & Alert (0-5 minutes)

**Detection Methods:**
- Automated monitoring alerts (Prometheus/Grafana)
- User reports
- Error tracking (Sentry)
- Health check failures

**Initial Actions:**
```bash
# Acknowledge alert
# Notify on-call engineer

# Quick assessment
./scripts/health_check.sh

# Check recent changes
git log --oneline -10
cat deployments/deployment_*.json | jq -s 'sort_by(.timestamp) | last'
```

### 2. Triage & Assessment (5-15 minutes)

**Questions to Answer:**
- What is broken?
- How many users are affected?
- When did it start?
- What changed recently?

**Assessment Commands:**
```bash
# Check service status
docker-compose -f docker-compose.production.yml ps

# Check error rates
docker logs kamiyo-api --tail=100 | grep -i error | wc -l

# Check metrics
curl http://localhost:9090/api/v1/query?query=up

# Check user impact
docker exec postgres psql -U kamiyo -c \
  "SELECT COUNT(DISTINCT user_id) FROM api_logs WHERE timestamp > NOW() - INTERVAL '5 minutes';"
```

### 3. Communication (0-15 minutes)

**Internal Communication (Slack/Discord):**
```
🚨 INCIDENT DECLARED

Severity: P0 - Critical
Issue: API returning 500 errors
Impact: All users cannot access exploit data
Start Time: 2025-10-08 14:32 UTC
On-Call: @engineer-name

Investigating...
```

**External Communication (Status Page):**
```
⚠️ Service Disruption

We are currently investigating issues with our API service.
Users may experience errors when accessing exploit data.

Status: Investigating
Updates will be posted every 15 minutes.
```

### 4. Investigation (15-45 minutes)

**Investigation Checklist:**

- [ ] **Check Recent Deployments**
  ```bash
  git log --oneline --since="2 hours ago"
  cat deployments/deployment_*.json | jq
  ```

- [ ] **Review Application Logs**
  ```bash
  docker logs kamiyo-api --tail=500 | grep -E "ERROR|CRITICAL|FATAL"
  ```

- [ ] **Check Database Health**
  ```bash
  docker exec postgres pg_isready
  docker exec postgres psql -U kamiyo -c "SELECT COUNT(*) FROM pg_stat_activity;"
  ```

- [ ] **Check Redis Cache**
  ```bash
  docker exec redis redis-cli ping
  docker exec redis redis-cli info stats
  ```

- [ ] **Check External Dependencies**
  ```bash
  curl -I https://api.stripe.com/v1/events
  curl -I https://rekt.news/feed/
  ```

- [ ] **Check Resource Usage**
  ```bash
  docker stats --no-stream
  df -h
  free -h
  ```

- [ ] **Check Network**
  ```bash
  netstat -tuln | grep -E "8000|5432|6379"
  ping -c 3 8.8.8.8
  ```

### 5. Mitigation (Varies by issue)

#### Option A: Immediate Rollback
```bash
# If recent deployment caused issue
git checkout <previous-stable-commit>
./scripts/deploy.sh
```

#### Option B: Quick Fix
```bash
# If simple configuration issue
# Fix the config
docker-compose -f docker-compose.production.yml restart api
```

#### Option C: Scale Resources
```bash
# If resource constraint
docker-compose -f docker-compose.production.yml up -d --scale api=3
```

#### Option D: Failover
```bash
# Switch to backup database
export DATABASE_URL=$READ_REPLICA_URL
docker-compose -f docker-compose.production.yml restart api
```

### 6. Resolution & Verification (Varies)

**Verification Steps:**
```bash
# Run health checks
./scripts/health_check.sh

# Test critical paths
curl -H "X-API-Key: test" http://localhost:8000/api/v1/exploits
curl -X POST http://localhost:8000/api/v1/auth/login

# Monitor error rates
watch -n 5 'docker logs kamiyo-api --tail=20 | grep -i error'

# Check metrics
curl http://localhost:9090/api/v1/query?query=http_requests_total
```

**Resolution Communication:**
```
✅ INCIDENT RESOLVED

The issue has been resolved.

Issue: API 500 errors
Root Cause: Database connection pool exhausted
Fix: Increased max connections from 100 to 200
Duration: 42 minutes
Impact: ~500 users affected

We're continuing to monitor the situation.
Post-mortem to follow within 24 hours.
```

### 7. Post-Incident Review (Within 24-48 hours)

**Create Incident Report:**
```markdown
# Incident Report: [Date] - [Brief Description]

## Summary
[2-3 sentence overview]

## Timeline
- **14:32 UTC** - Alerts triggered, API error rate spike
- **14:35 UTC** - On-call engineer acknowledged
- **14:40 UTC** - Root cause identified (DB connection pool)
- **14:50 UTC** - Fix deployed
- **15:14 UTC** - Service restored, monitoring

## Impact
- **Duration:** 42 minutes
- **Affected Users:** ~500
- **Failed Requests:** ~2,400
- **Revenue Impact:** $0 (no payment failures)

## Root Cause
Database connection pool was exhausted due to:
1. Increased traffic from new feature launch
2. Long-running queries not being closed
3. Connection pool set to default (100)

## Resolution
1. Increased max_connections to 200
2. Added connection timeout of 30s
3. Fixed connection leak in aggregator code

## Prevention
- [ ] Implement connection pool monitoring
- [ ] Add alerts for connection pool usage > 80%
- [ ] Review all queries for proper connection handling
- [ ] Load test before major feature launches

## Lessons Learned
1. Need better capacity planning
2. Should have staged rollout for new features
3. Connection pool monitoring gaps

## Action Items
- [ ] @dev: Fix connection leaks (#123)
- [ ] @devops: Add connection pool alerts (#124)
- [ ] @all: Review capacity planning process
```

---

## Incident Playbooks

### Playbook: API Down / Not Responding

**Symptoms:**
- 502/503 errors
- Health check failures
- Timeout errors

**Response:**
1. Check if container is running:
   ```bash
   docker ps | grep kamiyo-api
   ```

2. Check recent logs:
   ```bash
   docker logs kamiyo-api --tail=100
   ```

3. Restart API:
   ```bash
   docker-compose -f docker-compose.production.yml restart api
   ```

4. If restart fails, rollback:
   ```bash
   git checkout <previous-commit>
   ./scripts/deploy.sh
   ```

**Prevention:**
- Implement readiness/liveness probes
- Add auto-restart policy
- Monitor memory/CPU usage

---

### Playbook: Database Connection Failures

**Symptoms:**
- "Connection refused" errors
- "Max connections reached"
- Query timeouts

**Response:**
1. Check database status:
   ```bash
   docker exec postgres pg_isready
   ```

2. Check active connections:
   ```bash
   docker exec postgres psql -U kamiyo -c \
     "SELECT count(*) FROM pg_stat_activity;"
   ```

3. Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '1 hour';
   ```

4. Increase max connections:
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   SELECT pg_reload_conf();
   ```

**Prevention:**
- Implement connection pooling (PgBouncer)
- Set connection timeouts
- Monitor connection pool usage

---

### Playbook: Payment Processing Failures

**Symptoms:**
- Stripe errors
- Failed subscriptions
- Webhook failures

**Response:**
1. Check Stripe status:
   ```bash
   curl https://status.stripe.com/api/v2/status.json
   ```

2. Check webhook logs:
   ```bash
   docker logs kamiyo-api | grep webhook
   ```

3. Verify webhook secret:
   ```bash
   echo $STRIPE_WEBHOOK_SECRET
   # Should match Stripe dashboard
   ```

4. Re-sync failed payments:
   ```python
   python scripts/resync_stripe_payments.py --since="1 hour ago"
   ```

**Prevention:**
- Implement payment retry logic
- Add webhook signature verification
- Monitor Stripe API status

---

### Playbook: High Error Rate

**Symptoms:**
- Increased 5xx errors
- Sentry alert flood
- User complaints

**Response:**
1. Identify error pattern:
   ```bash
   docker logs kamiyo-api --tail=1000 | grep ERROR | sort | uniq -c | sort -rn
   ```

2. Check recent deploys:
   ```bash
   git log --oneline -5
   ```

3. If related to recent deploy, rollback:
   ```bash
   git revert HEAD
   ./scripts/deploy.sh
   ```

4. If not deployment-related, check dependencies:
   ```bash
   curl -I https://api.stripe.com
   curl -I https://rekt.news
   ```

**Prevention:**
- Implement canary deployments
- Add error rate alerts
- Use feature flags for risky changes

---

### Playbook: Slow Response Times

**Symptoms:**
- Increased latency
- Timeout errors
- Poor user experience

**Response:**
1. Check current response times:
   ```bash
   curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8000/api/v1/exploits
   ```

2. Check database query performance:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

3. Check cache hit rate:
   ```bash
   docker exec redis redis-cli info stats | grep keyspace
   ```

4. Scale horizontally:
   ```bash
   docker-compose -f docker-compose.production.yml up -d --scale api=3
   ```

**Prevention:**
- Implement query optimization
- Add database indexes
- Increase cache TTL
- Use CDN for static content

---

### Playbook: Data Corruption

**Symptoms:**
- Inconsistent data
- Missing records
- Duplicate entries

**Response:**
1. **STOP WRITES IMMEDIATELY:**
   ```sql
   REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM kamiyo;
   ```

2. Create emergency backup:
   ```bash
   ./scripts/backup_database.sh
   ```

3. Assess corruption scope:
   ```sql
   -- Check for duplicates
   SELECT tx_hash, COUNT(*) FROM exploits GROUP BY tx_hash HAVING COUNT(*) > 1;

   -- Check for orphans
   SELECT COUNT(*) FROM exploits WHERE protocol_id NOT IN (SELECT id FROM protocols);
   ```

4. Restore from backup:
   ```bash
   ./scripts/backup_restore.sh <last-known-good-backup>
   ```

**Prevention:**
- Implement database constraints
- Add data validation
- Test migrations thoroughly
- Maintain regular backups

---

## Escalation Paths

### Level 1: On-Call Engineer (0-30 minutes)
- Acknowledge incident
- Initial investigation
- Attempt quick fix

### Level 2: Senior Engineer (30-60 minutes)
- Complex debugging
- Architecture decisions
- Coordinate with team

### Level 3: Engineering Lead (60+ minutes)
- Major incidents
- Multi-system failures
- Customer communication

### Level 4: CTO (Critical business impact)
- Complete service outage
- Data breach
- Legal/compliance issues

---

## Communication Channels

### Internal
- **Slack:** #incidents (real-time updates)
- **PagerDuty:** Alert on-call engineers
- **Email:** incidents@kamiyo.ai

### External
- **Status Page:** status.kamiyo.ai
- **Twitter:** @kamiyo_status
- **Email:** Users with email alerts enabled

### Templates

**Initial Notification:**
```
Subject: [INCIDENT] API Service Disruption

We are currently investigating issues with our API service.

Status: Investigating
Impact: Users may experience errors
Start Time: 14:32 UTC

Updates: https://status.kamiyo.ai
```

**Update:**
```
Subject: [UPDATE] API Service Disruption

We have identified the root cause and are implementing a fix.

Status: Implementing Fix
Expected Resolution: 15:00 UTC
```

**Resolution:**
```
Subject: [RESOLVED] API Service Disruption

The issue has been resolved. All services are operational.

Duration: 42 minutes
Root Cause: Database connection pool exhausted
Next Steps: Post-mortem within 24 hours
```

---

## Tools & Resources

### Monitoring
- **Grafana:** http://grafana.kamiyo.ai
- **Prometheus:** http://prometheus.kamiyo.ai
- **Sentry:** https://sentry.io/kamiyo

### Logs
```bash
# Application logs
docker logs kamiyo-api -f

# Database logs
docker logs postgres -f

# Aggregator logs
docker logs kamiyo-aggregator -f
```

### Metrics
```bash
# Prometheus queries
curl 'http://localhost:9090/api/v1/query?query=up'
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
```

### Health Checks
```bash
./scripts/health_check.sh
curl http://localhost:8000/health
```

---

## Contact Information

### On-Call Rotation
- **Week 1-2:** Engineer A - [phone] - [email]
- **Week 3-4:** Engineer B - [phone] - [email]

### Escalation
- **Engineering Lead:** [phone] - [email]
- **CTO:** [phone] - [email]

### External Support
- **Stripe:** support@stripe.com - [phone]
- **AWS:** [support portal] - [phone]
- **Cloudflare:** [support portal] - [phone]

---

## Incident Log

Maintain log of all incidents:

```markdown
| Date | Severity | Duration | Issue | Resolution |
|------|----------|----------|-------|------------|
| 2025-10-08 | P0 | 42 min | API 500 errors | Increased DB connections |
| 2025-10-05 | P2 | 15 min | Slow queries | Added index |
```

---

**Last Updated:** October 8, 2025
**Next Review:** Monthly
**Owner:** DevOps Team

**Remember: Communication is as important as the fix. Keep stakeholders informed.**
