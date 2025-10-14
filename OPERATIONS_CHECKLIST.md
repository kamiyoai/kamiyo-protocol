# Kamiyo Operations Checklist

**Version:** 2.0
**Last Updated:** October 14, 2025
**Purpose:** Standardized operational procedures for the Kamiyo platform

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Post-Deployment Validation](#post-deployment-validation)
3. [Daily Operational Checks](#daily-operational-checks)
4. [Weekly Maintenance Tasks](#weekly-maintenance-tasks)
5. [Monthly Review Tasks](#monthly-review-tasks)
6. [Incident Response Checklist](#incident-response-checklist)
7. [Rollback Checklist](#rollback-checklist)
8. [Security Review Checklist](#security-review-checklist)
9. [Performance Audit Checklist](#performance-audit-checklist)
10. [Disaster Recovery Test Checklist](#disaster-recovery-test-checklist)

---

## Pre-Deployment Checklist

### Code Quality

- [ ] **All tests passing**
  ```bash
  pytest tests/ -v --cov
  ```

- [ ] **Code reviewed and approved**
  - PR reviewed by at least 2 engineers
  - All comments addressed
  - CI/CD pipeline green

- [ ] **Linting passing**
  ```bash
  flake8 . --max-line-length=120
  black . --check
  mypy .
  ```

- [ ] **No security vulnerabilities**
  ```bash
  pip-audit
  npm audit
  ```

### Database

- [ ] **Migrations tested in staging**
  ```bash
  docker exec kamiyo-api alembic upgrade head --sql > migration_preview.sql
  cat migration_preview.sql  # Review SQL
  ```

- [ ] **Backup completed**
  ```bash
  ./scripts/backup_database.sh
  ls -lh /backups/database/ | head -5
  ```

- [ ] **Rollback plan documented**
  - Migration rollback tested
  - Data rollback strategy defined
  - Downtime estimate calculated

### Configuration

- [ ] **Environment variables configured**
  ```bash
  # Verify all required variables
  docker exec kamiyo-api env | grep -E "DATABASE|REDIS|STRIPE|JWT" | wc -l
  ```

- [ ] **Secrets rotated (if needed)**
  ```bash
  # Check secret age
  aws secretsmanager describe-secret --secret-id kamiyo/jwt_secret
  ```

- [ ] **Feature flags set**
  - New features behind flags
  - Gradual rollout plan defined

### Infrastructure

- [ ] **Sufficient resources available**
  ```bash
  # Check CPU/Memory/Disk
  docker stats --no-stream
  df -h
  free -h
  ```

- [ ] **Monitoring configured**
  ```bash
  # Verify Grafana dashboards
  curl -s https://metrics.kamiyo.ai/api/health
  ```

- [ ] **Alerts configured for new features**
  - Success rate alerts
  - Error rate alerts
  - Performance alerts

### Communication

- [ ] **Team notified**
  - Deployment window communicated
  - Rollback plan shared
  - On-call engineer identified

- [ ] **Status page updated (if major deployment)**
  - Maintenance window announced
  - Expected impact documented

- [ ] **Changelog prepared**
  - User-facing changes documented
  - API changes documented
  - Breaking changes highlighted

### Final Checks

- [ ] **Deployment time chosen strategically**
  - Low traffic period
  - Team available for monitoring
  - No conflicting deployments

- [ ] **Rollback tested in staging**
  ```bash
  # Staging rollback test
  git checkout HEAD~1
  ./scripts/deploy.sh staging
  ./scripts/health_check.sh staging
  ```

- [ ] **Emergency contacts available**
  - On-call engineer reachable
  - Escalation path clear
  - External support contacts handy

---

## Post-Deployment Validation

### Immediate Validation (0-10 minutes)

- [ ] **Health check passing**
  ```bash
  ./scripts/health_check.sh
  # Expected: All services operational
  ```

- [ ] **All containers running**
  ```bash
  docker-compose -f docker-compose.production.yml ps
  # Expected: All services "Up"
  ```

- [ ] **No errors in logs**
  ```bash
  docker logs kamiyo-api --since 5m | grep -i error
  # Expected: No critical errors
  ```

- [ ] **Database connections healthy**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c "SELECT COUNT(*) FROM pg_stat_activity;"
  # Expected: Within normal range
  ```

### Functional Validation (10-30 minutes)

- [ ] **API endpoints responding**
  ```bash
  # Test critical endpoints
  curl -f https://api.kamiyo.ai/health
  curl -H "X-API-Key: $TEST_API_KEY" https://api.kamiyo.ai/api/v1/exploits
  curl -X POST https://api.kamiyo.ai/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"testpass"}'
  ```

- [ ] **Database queries working**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
    "SELECT COUNT(*) FROM exploits WHERE discovered_at > NOW() - INTERVAL '24 hours';"
  ```

- [ ] **Cache functioning**
  ```bash
  docker exec kamiyo-redis redis-cli ping
  docker exec kamiyo-redis redis-cli info stats | grep keyspace_hits
  ```

- [ ] **Authentication working**
  ```bash
  # Test JWT generation
  curl -X POST https://api.kamiyo.ai/api/v1/auth/login \
    -d '{"email":"test@example.com","password":"test"}' | jq .token
  ```

### Integration Validation (30-60 minutes)

- [ ] **Payment webhooks working**
  ```bash
  # Test Stripe webhook
  stripe trigger payment_intent.succeeded
  docker logs kamiyo-api | grep webhook | tail -5
  ```

- [ ] **Social media posting working**
  ```bash
  # Check last social post
  docker logs kamiyo-social | grep "Successfully posted" | tail -1
  ```

- [ ] **Aggregator fetching data**
  ```bash
  # Check last aggregation
  docker logs kamiyo-aggregator | grep "Fetched" | tail -5
  ```

- [ ] **Alert system working**
  ```bash
  # Test alert
  curl -X POST https://api.kamiyo.ai/api/v1/admin/test-alert
  # Check Slack/PagerDuty
  ```

### Performance Validation

- [ ] **Response times acceptable**
  ```bash
  # Measure p95 response time
  for i in {1..100}; do
    curl -w "%{time_total}\n" -o /dev/null -s https://api.kamiyo.ai/api/v1/exploits
  done | sort -n | tail -5
  # Expected: < 500ms
  ```

- [ ] **No memory leaks**
  ```bash
  # Monitor for 10 minutes
  watch -n 60 'docker stats --no-stream | grep kamiyo-api'
  # Expected: Memory stable
  ```

- [ ] **Database query performance**
  ```sql
  SELECT query, mean_exec_time, calls
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
  -- Expected: No queries > 1000ms
  ```

### Monitoring Validation

- [ ] **Metrics recording**
  ```bash
  curl http://localhost:9090/api/v1/query?query=up | jq '.data.result | length'
  # Expected: All services up
  ```

- [ ] **Grafana dashboards updated**
  - Open https://metrics.kamiyo.ai
  - Verify all panels showing data
  - Check for anomalies

- [ ] **Error tracking active**
  - Open Sentry dashboard
  - Verify events being recorded
  - No new error spikes

### Documentation

- [ ] **Deployment recorded**
  ```bash
  echo "$(date): Deployed v2.0 - [description]" >> deployments/deployment.log
  ```

- [ ] **Changelog updated**
  - User-facing changes documented
  - API changes published
  - Migration guide provided (if needed)

- [ ] **Status page updated**
  - Maintenance window closed
  - "All systems operational" status

---

## Daily Operational Checks

### Morning Checks (09:00 UTC)

- [ ] **System health status**
  ```bash
  ./scripts/health_check.sh
  ```

- [ ] **Review overnight logs**
  ```bash
  docker logs kamiyo-api --since 12h | grep -i -E "error|critical|fatal" | wc -l
  # Expected: < 10 errors
  ```

- [ ] **Check error rates**
  - Open Grafana: https://metrics.kamiyo.ai/d/api
  - Verify error rate < 1%
  - Investigate any spikes

- [ ] **Verify backups**
  ```bash
  ls -lh /backups/database/ | head -3
  # Expected: Fresh backup from 02:00
  ```

- [ ] **Check disk space**
  ```bash
  df -h | grep -E "/$|/var|/backups"
  # Expected: < 85% usage
  ```

### Midday Checks (13:00 UTC)

- [ ] **Monitor active users**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c \
    "SELECT COUNT(DISTINCT user_id) FROM api_logs WHERE timestamp > NOW() - INTERVAL '1 hour';"
  ```

- [ ] **Check API response times**
  ```bash
  curl -w "%{time_total}\n" -o /dev/null -s https://api.kamiyo.ai/api/v1/exploits
  # Expected: < 200ms
  ```

- [ ] **Verify cache hit rate**
  ```bash
  docker exec kamiyo-redis redis-cli info stats | grep keyspace
  # Expected: Hit rate > 70%
  ```

### Evening Checks (18:00 UTC)

- [ ] **Review day's metrics**
  - API requests: Total count
  - Error rate: < 1%
  - New users: Count
  - Active subscriptions: Count

- [ ] **Check social media posts**
  ```bash
  docker logs kamiyo-social --since 12h | grep -c "Successfully posted"
  # Expected: > 0 posts
  ```

- [ ] **Verify aggregator activity**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c \
    "SELECT COUNT(*) FROM exploits WHERE discovered_at > NOW() - INTERVAL '24 hours';"
  # Expected: > 5 new exploits
  ```

### Critical Alerts Check

- [ ] **No PagerDuty incidents**
  - Check PagerDuty dashboard
  - Resolve any lingering incidents

- [ ] **Sentry error review**
  - Open Sentry dashboard
  - Triage new errors
  - Create tickets for recurring issues

- [ ] **User support tickets**
  - Review new support tickets
  - Prioritize critical issues
  - Escalate if needed

---

## Weekly Maintenance Tasks

### Monday: System Review

- [ ] **Review weekly metrics**
  ```bash
  ./scripts/weekly_report.sh
  ```
  - Total API requests
  - Unique users
  - Error rate trend
  - Average response time

- [ ] **Database maintenance**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c "VACUUM ANALYZE;"
  ```

- [ ] **Review slow queries**
  ```sql
  SELECT query, mean_exec_time, calls
  FROM pg_stat_statements
  WHERE mean_exec_time > 1000  -- > 1 second
  ORDER BY mean_exec_time DESC;
  ```

- [ ] **Check for missing indexes**
  ```bash
  ./scripts/analyze_queries.sh
  ```

### Tuesday: Security Review

- [ ] **Review access logs**
  ```bash
  docker logs kamiyo-api --since 7d | grep -E "401|403|429" | tail -100
  ```

- [ ] **Check for suspicious activity**
  - Multiple failed login attempts
  - Unusual API usage patterns
  - Rate limit violations

- [ ] **Verify SSL certificates**
  ```bash
  echo | openssl s_client -connect api.kamiyo.ai:443 2>/dev/null | openssl x509 -noout -dates
  # Check expiration date
  ```

- [ ] **Review API key usage**
  ```sql
  SELECT key_id, user_id, request_count, last_used
  FROM api_keys
  WHERE last_used > NOW() - INTERVAL '7 days'
  ORDER BY request_count DESC
  LIMIT 20;
  ```

### Wednesday: Performance Audit

- [ ] **Analyze response times**
  ```bash
  ./scripts/response_time_analysis.sh
  ```

- [ ] **Check cache efficiency**
  ```bash
  docker exec kamiyo-redis redis-cli info stats | grep -E "hits|misses"
  ```

- [ ] **Review database connection pool**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c \
    "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
  ```

- [ ] **Identify performance bottlenecks**
  - Review Grafana dashboards
  - Check slow query logs
  - Profile hot code paths

### Thursday: Data Quality

- [ ] **Check for duplicate exploits**
  ```sql
  SELECT tx_hash, COUNT(*)
  FROM exploits
  GROUP BY tx_hash
  HAVING COUNT(*) > 1;
  ```

- [ ] **Verify data consistency**
  ```sql
  -- Orphaned records
  SELECT COUNT(*) FROM exploits WHERE protocol_id NOT IN (SELECT id FROM protocols);

  -- Missing required fields
  SELECT COUNT(*) FROM exploits WHERE chain IS NULL OR amount_usd IS NULL;
  ```

- [ ] **Review aggregator performance**
  ```sql
  SELECT source, COUNT(*), MAX(discovered_at) AS last_fetch
  FROM exploits
  WHERE discovered_at > NOW() - INTERVAL '7 days'
  GROUP BY source;
  ```

### Friday: Backup & Recovery

- [ ] **Test backup restoration**
  ```bash
  ./scripts/test_backup_restore.sh
  ```

- [ ] **Verify backup integrity**
  ```bash
  for backup in /backups/database/*.sql.gz; do
    gunzip -t "$backup" || echo "Corrupt: $backup"
  done
  ```

- [ ] **Check backup storage**
  ```bash
  # Local backups
  du -sh /backups/database/

  # S3 backups
  aws s3 ls s3://kamiyo-backups/database/ --recursive --human-readable
  ```

- [ ] **Review backup retention policy**
  - Last 7 days: All backups
  - Last 30 days: Daily backups
  - Last 90 days: Weekly backups
  - Older: Monthly backups

### Saturday: Dependency Updates (Staging)

- [ ] **Check for updates**
  ```bash
  pip list --outdated
  npm outdated
  ```

- [ ] **Update dependencies in staging**
  ```bash
  # In staging environment
  pip install -r requirements.txt --upgrade
  npm update
  ```

- [ ] **Run test suite**
  ```bash
  pytest tests/ -v
  npm test
  ```

- [ ] **Deploy to staging**
  ```bash
  ./scripts/deploy.sh staging
  ```

### Sunday: Capacity Planning

- [ ] **Review resource usage trends**
  - CPU usage over past week
  - Memory usage trends
  - Disk space growth
  - Database size growth

- [ ] **Project capacity needs**
  ```bash
  ./scripts/capacity_report.sh
  ```

- [ ] **Plan for scaling**
  - When to scale horizontally
  - When to scale vertically
  - Cost projections

---

## Monthly Review Tasks

### First Week: Infrastructure Review

- [ ] **Review cloud costs**
  - AWS/DigitalOcean bill
  - Identify optimization opportunities
  - Review reserved instances

- [ ] **Update infrastructure documentation**
  - Architecture diagrams
  - Network topology
  - Security configurations

- [ ] **Review and test disaster recovery plan**
  ```bash
  ./scripts/test_disaster_recovery.sh
  ```

- [ ] **Audit user access**
  ```sql
  SELECT email, role, last_login, created_at
  FROM users
  WHERE role IN ('admin', 'moderator')
  ORDER BY last_login DESC;
  ```

### Second Week: Security Audit

- [ ] **Rotate credentials**
  ```bash
  ./scripts/rotate_credentials.sh
  ```

- [ ] **Review security logs**
  ```bash
  docker logs kamiyo-api --since 30d | grep -E "unauthorized|forbidden|suspicious"
  ```

- [ ] **Update security policies**
  - Review password requirements
  - Check 2FA enforcement
  - Review API key permissions

- [ ] **Vulnerability scan**
  ```bash
  pip-audit
  npm audit
  docker scan kamiyo/api:latest
  ```

- [ ] **Penetration testing (quarterly)**
  - Schedule external pentest
  - Review findings
  - Implement fixes

### Third Week: Performance Optimization

- [ ] **Analyze query performance**
  ```sql
  SELECT query, calls, mean_exec_time, total_exec_time
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC
  LIMIT 50;
  ```

- [ ] **Optimize slow queries**
  - Add indexes
  - Refactor queries
  - Implement caching

- [ ] **Review cache strategy**
  - Cache hit rates
  - TTL optimization
  - Cache key patterns

- [ ] **Load testing**
  ```bash
  k6 run tests/load/api_load_test.js
  ```

### Fourth Week: Documentation & Training

- [ ] **Update runbooks**
  - Review PRODUCTION_RUNBOOK.md
  - Update troubleshooting guides
  - Add new procedures

- [ ] **Update API documentation**
  - OpenAPI spec up to date
  - Examples current
  - Breaking changes noted

- [ ] **Team training session**
  - New features walkthrough
  - Incident response drill
  - Tool updates

- [ ] **Post-mortem reviews**
  - Review month's incidents
  - Identify trends
  - Implement preventive measures

### End of Month: Reporting

- [ ] **Generate monthly report**
  ```bash
  ./scripts/monthly_report.sh
  ```
  - Uptime: Target 99.9%
  - API requests: Total & trend
  - New users: Count & trend
  - Revenue: MRR & growth
  - Incidents: Count & MTTR

- [ ] **Review SLA compliance**
  - Uptime SLA
  - Response time SLA
  - Support response time

- [ ] **Capacity planning review**
  - Resource usage trends
  - Growth projections
  - Scaling recommendations

---

## Incident Response Checklist

### Detection & Acknowledgment (0-5 minutes)

- [ ] **Acknowledge alert**
  - PagerDuty acknowledgment
  - Slack notification
  - Team awareness

- [ ] **Initial assessment**
  ```bash
  ./scripts/health_check.sh
  docker-compose -f docker-compose.production.yml ps
  ```

- [ ] **Determine severity**
  - P0: Complete outage
  - P1: Major feature broken
  - P2: Degraded performance
  - P3: Minor issue

### Communication (5-10 minutes)

- [ ] **Internal notification**
  ```
  🚨 INCIDENT DECLARED
  Severity: [P0/P1/P2/P3]
  Issue: [Brief description]
  Impact: [User impact]
  On-Call: @[engineer]
  ```

- [ ] **Update status page** (if P0 or P1)
  - Set status to "Investigating"
  - Describe issue
  - Provide updates every 15 minutes

- [ ] **Notify stakeholders** (if major impact)
  - Engineering leadership
  - Customer support team
  - Key customers (if needed)

### Investigation (10-30 minutes)

- [ ] **Check recent changes**
  ```bash
  git log --oneline -10
  cat deployments/deployment.log | tail -5
  ```

- [ ] **Review logs**
  ```bash
  docker logs kamiyo-api --tail=500 | grep -i error
  docker logs kamiyo-postgres --tail=100
  docker logs kamiyo-redis --tail=100
  ```

- [ ] **Check external dependencies**
  ```bash
  curl -I https://api.stripe.com
  curl -I https://rekt.news
  ```

- [ ] **Review metrics**
  - Open Grafana dashboards
  - Check error rates
  - Review response times
  - Check resource usage

### Mitigation (Varies)

- [ ] **Choose mitigation strategy**
  - [ ] Option A: Rollback deployment
  - [ ] Option B: Quick fix
  - [ ] Option C: Scale resources
  - [ ] Option D: Failover to backup

- [ ] **Execute mitigation**
  ```bash
  # Example: Rollback
  git checkout HEAD~1
  ./scripts/deploy.sh
  ```

- [ ] **Verify mitigation**
  ```bash
  ./scripts/health_check.sh
  # Test critical paths
  ```

### Resolution & Post-Incident

- [ ] **Confirm resolution**
  - Health checks passing
  - Metrics normalized
  - User reports positive

- [ ] **Update status page**
  ```
  ✅ INCIDENT RESOLVED
  Duration: [X minutes]
  Root cause: [Brief explanation]
  ```

- [ ] **Schedule post-mortem** (within 24-48 hours)
  - Incident timeline
  - Root cause analysis
  - Action items
  - Prevention measures

---

## Rollback Checklist

### Pre-Rollback

- [ ] **Confirm rollback necessary**
  - Issue severity warrants rollback
  - Quick fix not viable
  - Team consensus

- [ ] **Identify rollback target**
  ```bash
  git log --oneline -10
  git tag -l
  ```

- [ ] **Backup current state**
  ```bash
  ./scripts/backup_database.sh
  docker images | grep kamiyo
  ```

- [ ] **Communicate rollback plan**
  - Notify team
  - Update status page
  - Estimate downtime

### Execute Rollback

- [ ] **Stop affected services**
  ```bash
  docker-compose -f docker-compose.production.yml stop api aggregator social
  ```

- [ ] **Checkout previous version**
  ```bash
  git checkout [previous-stable-commit]
  ```

- [ ] **Rollback database migrations** (if needed)
  ```bash
  docker exec kamiyo-api alembic current
  docker exec kamiyo-api alembic downgrade -1
  ```

- [ ] **Rebuild and deploy**
  ```bash
  docker-compose -f docker-compose.production.yml build
  docker-compose -f docker-compose.production.yml up -d
  ```

### Post-Rollback Validation

- [ ] **Health checks passing**
  ```bash
  ./scripts/health_check.sh
  ```

- [ ] **Test critical functionality**
  ```bash
  curl -f https://api.kamiyo.ai/health
  curl -H "X-API-Key: $TEST_API_KEY" https://api.kamiyo.ai/api/v1/exploits
  ```

- [ ] **Monitor logs**
  ```bash
  docker-compose -f docker-compose.production.yml logs -f --tail=100
  ```

- [ ] **Update status page**
  ```
  Service restored via rollback
  Investigating root cause
  ```

### Post-Rollback Tasks

- [ ] **Document rollback**
  - What was rolled back
  - Why rollback was necessary
  - What was lost (if anything)

- [ ] **Create incident report**
  - Timeline of events
  - Root cause
  - Prevention measures

- [ ] **Plan fix forward**
  - Identify root cause
  - Develop fix
  - Test thoroughly
  - Schedule re-deployment

---

## Security Review Checklist

### Access Control

- [ ] **Review user permissions**
  ```sql
  SELECT email, role, is_active, last_login
  FROM users
  WHERE role IN ('admin', 'moderator')
  ORDER BY last_login DESC;
  ```

- [ ] **Audit API key usage**
  ```sql
  SELECT key_id, user_id, last_used, request_count
  FROM api_keys
  WHERE is_active = true
  ORDER BY last_used DESC
  LIMIT 50;
  ```

- [ ] **Review SSH access**
  ```bash
  # Check who has SSH access
  cat ~/.ssh/authorized_keys
  ```

- [ ] **Check database permissions**
  ```sql
  \du  -- List database users and roles
  ```

### Vulnerability Management

- [ ] **Scan dependencies**
  ```bash
  pip-audit
  npm audit
  ```

- [ ] **Check for exposed secrets**
  ```bash
  grep -r -i "api_key\|password\|secret" . --exclude-dir=node_modules --exclude-dir=.git
  ```

- [ ] **Review security headers**
  ```bash
  curl -I https://api.kamiyo.ai | grep -E "Strict-Transport|X-Frame|Content-Security"
  ```

- [ ] **Docker image scan**
  ```bash
  docker scan kamiyo/api:latest
  ```

### Compliance

- [ ] **SSL/TLS certificate valid**
  ```bash
  echo | openssl s_client -connect api.kamiyo.ai:443 2>/dev/null | openssl x509 -noout -dates
  ```

- [ ] **PCI compliance check** (if processing payments)
  - Stripe integration secure
  - No card data stored
  - Logs sanitized

- [ ] **GDPR compliance**
  - Data retention policy followed
  - User data exportable
  - Deletion requests honored

### Logging & Monitoring

- [ ] **Security logs reviewed**
  ```bash
  docker logs kamiyo-api --since 7d | grep -E "unauthorized|forbidden|suspicious"
  ```

- [ ] **Failed login attempts**
  ```bash
  docker logs kamiyo-api | grep "failed login" | tail -20
  ```

- [ ] **Rate limit violations**
  ```bash
  docker logs kamiyo-api | grep "rate limit exceeded" | wc -l
  ```

---

## Performance Audit Checklist

### API Performance

- [ ] **Response time analysis**
  ```bash
  # Test p95 response time
  for i in {1..100}; do
    curl -w "%{time_total}\n" -o /dev/null -s https://api.kamiyo.ai/api/v1/exploits
  done | sort -n | tail -5
  # Expected: < 500ms
  ```

- [ ] **Error rate check**
  ```bash
  # Calculate error rate
  TOTAL=$(docker logs kamiyo-api --since 1h | grep "HTTP" | wc -l)
  ERRORS=$(docker logs kamiyo-api --since 1h | grep -E "HTTP/.*[45][0-9]{2}" | wc -l)
  echo "Error rate: $(($ERRORS * 100 / $TOTAL))%"
  # Expected: < 1%
  ```

- [ ] **Throughput measurement**
  ```bash
  # Requests per minute
  docker logs kamiyo-api --since 1h | grep "HTTP" | wc -l
  ```

### Database Performance

- [ ] **Slow query analysis**
  ```sql
  SELECT query, mean_exec_time, calls, total_exec_time
  FROM pg_stat_statements
  WHERE mean_exec_time > 1000
  ORDER BY mean_exec_time DESC
  LIMIT 20;
  ```

- [ ] **Index usage**
  ```sql
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  ORDER BY idx_scan ASC
  LIMIT 20;
  -- Identify unused indexes
  ```

- [ ] **Connection pool status**
  ```bash
  docker exec kamiyo-postgres psql -U kamiyo -c \
    "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
  ```

- [ ] **Cache hit ratio**
  ```sql
  SELECT
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit) as heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
  FROM pg_statio_user_tables;
  -- Expected: > 0.99 (99% cache hits)
  ```

### Cache Performance

- [ ] **Redis hit rate**
  ```bash
  docker exec kamiyo-redis redis-cli info stats | grep keyspace
  # Calculate hit rate
  ```

- [ ] **Memory usage**
  ```bash
  docker exec kamiyo-redis redis-cli info memory
  # Check for memory pressure
  ```

- [ ] **Eviction rate**
  ```bash
  docker exec kamiyo-redis redis-cli info stats | grep evicted_keys
  # High evictions indicate insufficient memory
  ```

### Resource Utilization

- [ ] **CPU usage**
  ```bash
  docker stats --no-stream
  # Check all services < 80%
  ```

- [ ] **Memory usage**
  ```bash
  docker stats --no-stream
  free -h
  # Check for memory pressure
  ```

- [ ] **Disk I/O**
  ```bash
  iostat -x 1 5
  # Check for high I/O wait
  ```

- [ ] **Network throughput**
  ```bash
  iftop -i eth0
  # Monitor network utilization
  ```

---

## Disaster Recovery Test Checklist

### Preparation

- [ ] **Schedule test window**
  - Low traffic period
  - Team available
  - Stakeholders notified

- [ ] **Document test plan**
  - Scenarios to test
  - Expected outcomes
  - Rollback procedures

- [ ] **Create baseline metrics**
  ```bash
  ./scripts/baseline_metrics.sh
  ```

### Backup Testing

- [ ] **Verify backup exists**
  ```bash
  ls -lh /backups/database/ | head -3
  ```

- [ ] **Test backup restoration**
  ```bash
  # In test environment
  ./scripts/backup_restore.sh latest
  ```

- [ ] **Verify data integrity**
  ```sql
  SELECT COUNT(*) FROM exploits;
  SELECT MAX(id), MIN(id) FROM exploits;
  SELECT COUNT(DISTINCT chain) FROM exploits;
  ```

### Failover Testing

- [ ] **Simulate primary failure**
  ```bash
  docker-compose -f docker-compose.production.yml stop postgres
  ```

- [ ] **Failover to replica**
  ```bash
  # Promote replica
  docker exec kamiyo-postgres-replica pg_ctl promote
  ```

- [ ] **Verify application connectivity**
  ```bash
  docker-compose -f docker-compose.production.yml restart api
  ./scripts/health_check.sh
  ```

### Recovery Time Testing

- [ ] **Measure RTO (Recovery Time Objective)**
  - Start timer at failure
  - End timer when service restored
  - Compare to SLA (target: < 1 hour)

- [ ] **Measure RPO (Recovery Point Objective)**
  - Check last backup timestamp
  - Calculate potential data loss
  - Compare to SLA (target: < 1 hour)

### Post-Test Validation

- [ ] **Restore production state**
  ```bash
  docker-compose -f docker-compose.production.yml up -d
  ```

- [ ] **Verify all services operational**
  ```bash
  ./scripts/health_check.sh
  ```

- [ ] **Document findings**
  - RTO achieved
  - RPO achieved
  - Issues encountered
  - Improvements needed

---

## Appendix: Quick Reference

### Daily Commands

```bash
# Morning health check
./scripts/health_check.sh

# Check errors
docker logs kamiyo-api --since 12h | grep -i error

# Check disk space
df -h

# Verify backups
ls -lh /backups/database/ | head -3
```

### Weekly Commands

```bash
# Database maintenance
docker exec kamiyo-postgres psql -U kamiyo -c "VACUUM ANALYZE;"

# Check slow queries
./scripts/analyze_queries.sh

# Review security logs
docker logs kamiyo-api --since 7d | grep -E "401|403"
```

### Monthly Commands

```bash
# Rotate credentials
./scripts/rotate_credentials.sh

# Security audit
./scripts/security_audit.sh

# Capacity report
./scripts/capacity_report.sh

# Monthly report
./scripts/monthly_report.sh
```

### Emergency Commands

```bash
# Emergency health check
./scripts/health_check.sh

# Rollback
git checkout HEAD~1 && ./scripts/deploy.sh

# Restore backup
./scripts/backup_restore.sh latest

# Restart everything
docker-compose -f docker-compose.production.yml restart
```

---

**Last Updated:** October 14, 2025
**Version:** 2.0
**Next Review:** January 14, 2026

**Remember: Consistent operational practices prevent incidents. Use this checklist religiously.**
