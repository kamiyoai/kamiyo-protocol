# Kamiyo Production Runbook

**Version:** 2.0
**Last Updated:** October 14, 2025
**Owner:** Platform Engineering Team
**On-Call Rotation:** See [Contact Information](#contact-information)

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [System Architecture](#system-architecture)
3. [Deployment Procedures](#deployment-procedures)
4. [Common Operations](#common-operations)
5. [Monitoring & Health Checks](#monitoring--health-checks)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Incident Response](#incident-response)
8. [Rollback Procedures](#rollback-procedures)
9. [Maintenance Tasks](#maintenance-tasks)
10. [Emergency Procedures](#emergency-procedures)
11. [Performance Tuning](#performance-tuning)
12. [Scaling Guidelines](#scaling-guidelines)
13. [Backup & Recovery](#backup--recovery)
14. [Security Procedures](#security-procedures)
15. [Contact Information](#contact-information)

---

## Quick Reference

### Essential Commands

```bash
# Health check
./scripts/health_check.sh

# View all services
docker-compose -f docker-compose.production.yml ps

# Restart service
docker-compose -f docker-compose.production.yml restart <service>

# View logs
docker-compose -f docker-compose.production.yml logs -f <service>

# Deploy latest code
./scripts/deploy.sh

# Backup database
./scripts/backup_database.sh

# Restore from backup
./scripts/backup_restore.sh <backup_name>
```

### Service URLs

- **API:** https://api.kamiyo.ai
- **API Docs:** https://api.kamiyo.ai/docs
- **Website:** https://kamiyo.ai
- **Grafana:** https://metrics.kamiyo.ai
- **Prometheus:** https://prometheus.kamiyo.ai
- **Sentry:** https://sentry.io/kamiyo

### Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| API Response Time (p95) | > 500ms | Investigate, scale if needed |
| Error Rate | > 1% | Immediate investigation |
| Database Connections | > 80% of max | Scale or optimize |
| Redis Memory | > 80% | Increase limit or evict |
| Disk Usage | > 85% | Clean up or expand |
| CPU Usage | > 80% sustained | Scale horizontally |

---

## System Architecture

### Services Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Load Balancer                         │
│                    (Nginx / Cloudflare)                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   API (x3)   │   │  Aggregator  │   │Social Engine │
│  Port: 8000  │   │   Workers    │   │  Autonomous  │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                   │
       └──────────────────┼───────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      ┌──────────────┐       ┌──────────────┐
      │  PostgreSQL  │       │    Redis     │
      │  Port: 5432  │       │  Port: 6379  │
      └──────────────┘       └──────────────┘
```

### Container Inventory

| Container | Purpose | CPU | Memory | Restart Policy |
|-----------|---------|-----|--------|----------------|
| kamiyo-api | REST API endpoints | 2 cores | 2GB | always |
| kamiyo-aggregator | Exploit data collection | 1 core | 1GB | always |
| kamiyo-social | Autonomous growth engine | 1 core | 1GB | always |
| kamiyo-discord-bot | Discord notifications | 0.5 core | 512MB | always |
| kamiyo-telegram-bot | Telegram notifications | 0.5 core | 512MB | always |
| kamiyo-postgres | Primary database | 4 cores | 8GB | always |
| kamiyo-redis | Cache & rate limiting | 2 cores | 4GB | always |
| kamiyo-nginx | Reverse proxy | 1 core | 512MB | always |
| kamiyo-prometheus | Metrics collection | 1 core | 2GB | always |
| kamiyo-grafana | Metrics visualization | 1 core | 1GB | always |

---

## Deployment Procedures

### Standard Deployment (Docker Compose)

**Pre-deployment Checklist:**
- [ ] Code reviewed and approved
- [ ] Tests passing (pytest)
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] Backup completed
- [ ] Team notified

**Deployment Steps:**

```bash
# 1. Backup current state
./scripts/backup_database.sh

# 2. Pull latest code
git pull origin main

# 3. Build new images
docker-compose -f docker-compose.production.yml build

# 4. Run database migrations
docker-compose -f docker-compose.production.yml run --rm api alembic upgrade head

# 5. Deploy with zero-downtime
docker-compose -f docker-compose.production.yml up -d --no-deps --build api

# 6. Wait for health checks
sleep 10
./scripts/health_check.sh

# 7. Roll out to all services
docker-compose -f docker-compose.production.yml up -d

# 8. Verify deployment
curl -f https://api.kamiyo.ai/health || echo "Health check failed!"

# 9. Monitor logs
docker-compose -f docker-compose.production.yml logs -f --tail=100

# 10. Record deployment
echo "Deployed at $(date)" >> deployments/deployment.log
```

**Post-deployment Validation:**

```bash
# Test critical paths
curl -H "X-API-Key: $TEST_API_KEY" https://api.kamiyo.ai/api/v1/exploits
curl -X POST https://api.kamiyo.ai/api/v1/auth/login -d '{"email":"test@example.com"}'

# Check error rates
docker logs kamiyo-api --since 5m | grep -i error

# Monitor metrics
open https://metrics.kamiyo.ai
```

### Kubernetes Deployment

**Pre-deployment:**

```bash
# Verify cluster access
kubectl cluster-info

# Check resource availability
kubectl top nodes
kubectl top pods -n kamiyo

# Backup current state
./scripts/backup_database.sh
```

**Deployment:**

```bash
# 1. Apply configuration changes
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/secrets.yaml

# 2. Update deployments (rolling update)
kubectl set image deployment/kamiyo-api \
  api=kamiyo/api:v2.0 -n kamiyo --record

# 3. Watch rollout status
kubectl rollout status deployment/kamiyo-api -n kamiyo

# 4. Verify pods
kubectl get pods -n kamiyo -l app=kamiyo-api

# 5. Check logs
kubectl logs -f deployment/kamiyo-api -n kamiyo --tail=100
```

**Rollout strategies:**

```yaml
# Blue-Green Deployment
apiVersion: v1
kind: Service
metadata:
  name: kamiyo-api
spec:
  selector:
    app: kamiyo-api
    version: blue  # Switch to 'green' when ready

# Canary Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kamiyo-api-canary
spec:
  replicas: 1  # 10% of traffic
```

### SystemD Deployment

**Setup (one-time):**

```bash
# 1. Copy service files
sudo cp deploy/kamiyo-*.service /etc/systemd/system/

# 2. Reload systemd
sudo systemctl daemon-reload

# 3. Enable services
sudo systemctl enable kamiyo-api
sudo systemctl enable kamiyo-aggregator
sudo systemctl enable kamiyo-social
```

**Deployment:**

```bash
# 1. Pull latest code
cd /opt/kamiyo
git pull origin main

# 2. Install dependencies
pip install -r requirements.txt --upgrade

# 3. Run migrations
alembic upgrade head

# 4. Restart services
sudo systemctl restart kamiyo-api
sudo systemctl restart kamiyo-aggregator
sudo systemctl restart kamiyo-social

# 5. Check status
sudo systemctl status kamiyo-*

# 6. View logs
sudo journalctl -u kamiyo-api -f
```

---

## Common Operations

### Start Services

```bash
# Docker Compose
docker-compose -f docker-compose.production.yml up -d

# Kubernetes
kubectl scale deployment kamiyo-api --replicas=3 -n kamiyo

# SystemD
sudo systemctl start kamiyo-api
```

### Stop Services

```bash
# Docker Compose (graceful)
docker-compose -f docker-compose.production.yml stop

# Docker Compose (immediate)
docker-compose -f docker-compose.production.yml down

# Kubernetes
kubectl scale deployment kamiyo-api --replicas=0 -n kamiyo

# SystemD
sudo systemctl stop kamiyo-api
```

### Restart Services

```bash
# Restart specific service
docker-compose -f docker-compose.production.yml restart api

# Restart all services
docker-compose -f docker-compose.production.yml restart

# Rolling restart (Kubernetes)
kubectl rollout restart deployment/kamiyo-api -n kamiyo

# SystemD
sudo systemctl restart kamiyo-api
```

### Scale Services

**Horizontal Scaling (Docker Compose):**

```bash
# Scale API to 5 instances
docker-compose -f docker-compose.production.yml up -d --scale api=5

# Verify
docker-compose -f docker-compose.production.yml ps
```

**Horizontal Scaling (Kubernetes):**

```bash
# Manual scaling
kubectl scale deployment kamiyo-api --replicas=5 -n kamiyo

# Auto-scaling
kubectl autoscale deployment kamiyo-api \
  --min=3 --max=10 --cpu-percent=70 -n kamiyo

# Check HPA status
kubectl get hpa -n kamiyo
```

**Vertical Scaling:**

```yaml
# docker-compose.production.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
```

### View Logs

```bash
# Real-time logs (all services)
docker-compose -f docker-compose.production.yml logs -f

# Specific service logs
docker-compose -f docker-compose.production.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.production.yml logs --tail=100 api

# Filter errors
docker logs kamiyo-api | grep -i error

# Kubernetes logs
kubectl logs -f deployment/kamiyo-api -n kamiyo --tail=100

# SystemD logs
sudo journalctl -u kamiyo-api -f
```

### Execute Commands in Containers

```bash
# Docker
docker exec -it kamiyo-api bash
docker exec kamiyo-postgres psql -U kamiyo

# Kubernetes
kubectl exec -it deployment/kamiyo-api -n kamiyo -- bash
kubectl exec -it deployment/kamiyo-postgres -n kamiyo -- psql -U kamiyo
```

---

## Monitoring & Health Checks

### Automated Health Checks

**Run comprehensive health check:**

```bash
./scripts/health_check.sh
```

**Output example:**
```
Kamiyo Production Health Check
================================

API Health: OK (200)
Database: OK (234 exploits, 89 users)
Redis: OK (15234 keys)
Aggregator: OK (last run: 2 minutes ago)
Social Engine: OK (3 platforms active)
Discord Bot: OK
Telegram Bot: OK

All systems operational
```

### Manual Health Checks

**API Health:**
```bash
curl -f https://api.kamiyo.ai/health
# Expected: {"status": "healthy", "version": "2.0"}
```

**Database Health:**
```bash
docker exec kamiyo-postgres pg_isready -U kamiyo
# Expected: accepting connections
```

**Redis Health:**
```bash
docker exec kamiyo-redis redis-cli ping
# Expected: PONG
```

**Service Status:**
```bash
docker-compose -f docker-compose.production.yml ps
# All services should be "Up"
```

### Metrics Endpoints

**Prometheus Metrics:**
```bash
curl http://localhost:9090/api/v1/query?query=up
curl http://localhost:9090/api/v1/query?query=http_requests_total
curl http://localhost:9090/api/v1/query?query=http_request_duration_seconds
```

**Custom Metrics:**
```python
# Available metrics
http_requests_total
http_request_duration_seconds
database_queries_total
database_query_duration_seconds
cache_hits_total
cache_misses_total
social_posts_total
social_post_failures_total
api_keys_total
active_users_total
```

**Grafana Dashboards:**
- **System Overview:** https://metrics.kamiyo.ai/d/system
- **API Performance:** https://metrics.kamiyo.ai/d/api
- **Database:** https://metrics.kamiyo.ai/d/database
- **Cache:** https://metrics.kamiyo.ai/d/cache
- **Social Media:** https://metrics.kamiyo.ai/d/social

### Alert Configuration

**Critical Alerts (PagerDuty):**
- API down (3 consecutive failures)
- Database unreachable
- Disk space > 90%
- Error rate > 5%

**Warning Alerts (Slack):**
- Response time p95 > 500ms
- Cache hit rate < 70%
- Failed social posts > 10/hour
- Database connections > 80%

**Alert silence:**
```bash
# Silence alerts during maintenance
curl -X POST https://prometheus.kamiyo.ai/api/v1/alerts \
  -d '{"matchers":[{"name":"alertname","value":".*"}],"startsAt":"2025-10-14T10:00:00Z","endsAt":"2025-10-14T12:00:00Z"}'
```

---

## Troubleshooting Guide

### Issue 1: API Not Responding

**Symptoms:**
- HTTP 502/503 errors
- Timeout on requests
- Health check fails

**Diagnosis:**
```bash
# Check if container is running
docker ps | grep kamiyo-api

# Check logs
docker logs kamiyo-api --tail=100

# Check port
netstat -tuln | grep 8000

# Check resource usage
docker stats kamiyo-api
```

**Solutions:**

1. **Restart API:**
   ```bash
   docker-compose -f docker-compose.production.yml restart api
   ```

2. **Check environment variables:**
   ```bash
   docker exec kamiyo-api env | grep -E "DATABASE|REDIS|STRIPE"
   ```

3. **Rebuild if code issue:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d --build api
   ```

4. **Check dependencies:**
   ```bash
   # Database connection
   docker exec kamiyo-postgres pg_isready

   # Redis connection
   docker exec kamiyo-redis redis-cli ping
   ```

### Issue 2: Database Connection Pool Exhausted

**Symptoms:**
- "Too many connections" errors
- Slow query responses
- Connection timeouts

**Diagnosis:**
```bash
# Check active connections
docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
  "SELECT count(*) FROM pg_stat_activity;"

# Check max connections
docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
  "SHOW max_connections;"
```

**Solutions:**

1. **Kill idle connections:**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
     AND state_change < NOW() - INTERVAL '1 hour';
   ```

2. **Increase max connections:**
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   SELECT pg_reload_conf();
   ```

3. **Implement connection pooling (PgBouncer):**
   ```yaml
   # docker-compose.production.yml
   pgbouncer:
     image: pgbouncer/pgbouncer
     environment:
       - DATABASES_HOST=postgres
       - DATABASES_PORT=5432
       - POOL_MODE=transaction
       - MAX_CLIENT_CONN=100
   ```

### Issue 3: Redis Memory Full

**Symptoms:**
- OOM errors
- Cache writes fail
- Slow performance

**Diagnosis:**
```bash
docker exec kamiyo-redis redis-cli INFO memory
docker exec kamiyo-redis redis-cli INFO stats
```

**Solutions:**

1. **Set eviction policy:**
   ```bash
   docker exec kamiyo-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Increase memory limit:**
   ```bash
   docker exec kamiyo-redis redis-cli CONFIG SET maxmemory 4gb
   ```

3. **Clear old keys:**
   ```bash
   docker exec kamiyo-redis redis-cli --scan --pattern "old:*" | \
     xargs -L 100 docker exec -i kamiyo-redis redis-cli DEL
   ```

### Issue 4: Slow API Response Times

**Symptoms:**
- Response time > 1 second
- User complaints
- Timeout errors

**Diagnosis:**
```bash
# Check response time
curl -w "@curl-format.txt" -o /dev/null -s https://api.kamiyo.ai/api/v1/exploits

# Slow queries
docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Cache hit rate
docker exec kamiyo-redis redis-cli INFO stats | grep keyspace_hits
```

**Solutions:**

1. **Add database indexes:**
   ```sql
   CREATE INDEX CONCURRENTLY idx_exploits_chain ON exploits(chain);
   CREATE INDEX CONCURRENTLY idx_exploits_date ON exploits(discovered_at DESC);
   ```

2. **Increase cache TTL:**
   ```python
   # In code
   cache.set(key, value, ttl=3600)  # 1 hour instead of 300s
   ```

3. **Scale API horizontally:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d --scale api=5
   ```

4. **Enable query caching:**
   ```python
   @cache.memoize(timeout=300)
   def get_exploits(chain=None):
       return db.query(Exploit).filter_by(chain=chain).all()
   ```

### Issue 5: Aggregator Not Fetching New Exploits

**Symptoms:**
- No new exploits in last hour
- Source health checks fail
- Aggregator logs show errors

**Diagnosis:**
```bash
# Check aggregator logs
docker logs kamiyo-aggregator --tail=100

# Check last fetch
docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
  "SELECT source, MAX(discovered_at) FROM exploits GROUP BY source;"

# Test external sources
curl -I https://rekt.news/feed/
curl -I https://api.defillama.com/hacks
```

**Solutions:**

1. **Restart aggregator:**
   ```bash
   docker-compose -f docker-compose.production.yml restart aggregator
   ```

2. **Check API keys:**
   ```bash
   docker exec kamiyo-aggregator env | grep -E "TWITTER|GITHUB|DEFILLAMA"
   ```

3. **Verify rate limits:**
   ```bash
   # Check Twitter rate limit status
   curl -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \
     https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10
   ```

4. **Manual trigger:**
   ```bash
   docker exec kamiyo-aggregator python -c "from aggregators.orchestrator import fetch_all; fetch_all()"
   ```

### Issue 6: Social Media Posts Failing

**Symptoms:**
- Posts not appearing on platforms
- Social engine logs show errors
- Platform API errors

**Diagnosis:**
```bash
# Check social engine logs
docker logs kamiyo-social --tail=100

# Check platform status
./social/monitoring/health.py --check-platforms

# Test credentials
docker exec kamiyo-social python -c "from social.platforms.x_twitter import XTwitterPoster; XTwitterPoster().test_connection()"
```

**Solutions:**

1. **Verify credentials:**
   ```bash
   docker exec kamiyo-social env | grep -E "REDDIT|DISCORD|TELEGRAM|X_"
   ```

2. **Check rate limits:**
   ```bash
   # Review rate limit headers
   docker logs kamiyo-social | grep -i "rate limit"
   ```

3. **Restart social engine:**
   ```bash
   docker-compose -f docker-compose.production.yml restart social
   ```

4. **Test individual platform:**
   ```bash
   docker exec kamiyo-social python social/platforms/discord.py --test
   ```

### Issue 7: Payment Webhook Failures

**Symptoms:**
- Subscriptions not activating
- Payment confirmations delayed
- Stripe webhook errors

**Diagnosis:**
```bash
# Check webhook logs
docker logs kamiyo-api | grep webhook

# Verify webhook secret
echo $STRIPE_WEBHOOK_SECRET

# Test webhook endpoint
curl -X POST https://api.kamiyo.ai/api/v1/payments/webhook \
  -H "stripe-signature: test" \
  -d '{"type": "test"}'
```

**Solutions:**

1. **Verify webhook configuration:**
   - Go to Stripe Dashboard > Developers > Webhooks
   - Ensure URL is correct: `https://api.kamiyo.ai/api/v1/payments/webhook`
   - Check signing secret matches environment variable

2. **Test webhook manually:**
   ```bash
   stripe trigger payment_intent.succeeded
   ```

3. **Re-sync payments:**
   ```bash
   docker exec kamiyo-api python scripts/resync_stripe_payments.py --since="1 hour ago"
   ```

### Issue 8: High CPU Usage

**Symptoms:**
- CPU usage > 80%
- Slow performance
- Increased response times

**Diagnosis:**
```bash
docker stats
top -p $(docker inspect --format '{{.State.Pid}}' kamiyo-api)
```

**Solutions:**

1. **Identify hot code paths:**
   ```python
   # Add profiling
   import cProfile
   cProfile.run('expensive_function()')
   ```

2. **Optimize queries:**
   ```python
   # Bad: N+1 query
   for exploit in exploits:
       print(exploit.protocol.name)

   # Good: Eager loading
   exploits = db.query(Exploit).options(joinedload(Exploit.protocol)).all()
   ```

3. **Add caching:**
   ```python
   @cache.memoize(timeout=300)
   def expensive_computation():
       return result
   ```

4. **Scale horizontally:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d --scale api=5
   ```

### Issue 9: Disk Space Full

**Symptoms:**
- "No space left on device" errors
- Log rotation fails
- Database writes fail

**Diagnosis:**
```bash
df -h
docker system df
```

**Solutions:**

1. **Clean up Docker:**
   ```bash
   # Remove unused images
   docker image prune -a

   # Remove unused volumes
   docker volume prune

   # System cleanup
   docker system prune -a --volumes
   ```

2. **Rotate logs:**
   ```bash
   # Truncate log files
   truncate -s 0 /var/log/nginx/access.log

   # Configure log rotation
   logrotate -f /etc/logrotate.conf
   ```

3. **Archive old data:**
   ```bash
   # Backup and remove old exploits
   pg_dump -t old_exploits > /backups/old_exploits.sql
   docker exec kamiyo-postgres psql -U kamiyo -d kamiyo_prod -c \
     "DELETE FROM exploits WHERE discovered_at < NOW() - INTERVAL '2 years';"
   ```

### Issue 10: SSL Certificate Expired

**Symptoms:**
- HTTPS errors
- Browser warnings
- API calls fail with SSL errors

**Diagnosis:**
```bash
# Check certificate expiration
echo | openssl s_client -connect api.kamiyo.ai:443 2>/dev/null | \
  openssl x509 -noout -dates
```

**Solutions:**

1. **Renew Let's Encrypt certificate:**
   ```bash
   certbot renew --nginx
   ```

2. **Force renewal:**
   ```bash
   certbot renew --force-renewal
   ```

3. **Restart nginx:**
   ```bash
   docker-compose -f docker-compose.production.yml restart nginx
   ```

### Issue 11: Memory Leak

**Symptoms:**
- Memory usage continuously increases
- OOM kills
- Swap usage high

**Diagnosis:**
```bash
# Monitor memory over time
watch -n 5 'docker stats --no-stream | grep kamiyo-api'

# Check memory leaks (Python)
docker exec kamiyo-api pip install memory_profiler
docker exec kamiyo-api python -m memory_profiler main.py
```

**Solutions:**

1. **Restart service (temporary):**
   ```bash
   docker-compose -f docker-compose.production.yml restart api
   ```

2. **Set memory limits:**
   ```yaml
   # docker-compose.production.yml
   services:
     api:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

3. **Profile and fix code:**
   ```python
   # Find memory leaks
   import tracemalloc
   tracemalloc.start()
   # ... code ...
   snapshot = tracemalloc.take_snapshot()
   top_stats = snapshot.statistics('lineno')
   for stat in top_stats[:10]:
       print(stat)
   ```

### Issue 12: Database Replication Lag

**Symptoms:**
- Read replica data outdated
- Replication errors in logs
- Inconsistent query results

**Diagnosis:**
```bash
# Check replication lag
docker exec kamiyo-postgres-replica psql -U kamiyo -c \
  "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"
```

**Solutions:**

1. **Check replication status:**
   ```sql
   SELECT * FROM pg_stat_replication;
   ```

2. **Restart replication:**
   ```bash
   docker-compose -f docker-compose.production.yml restart postgres-replica
   ```

3. **Increase WAL sender processes:**
   ```sql
   ALTER SYSTEM SET max_wal_senders = 10;
   SELECT pg_reload_conf();
   ```

### Issue 13: WebSocket Disconnections

**Symptoms:**
- Real-time updates not working
- WebSocket connection drops
- Clients unable to connect

**Diagnosis:**
```bash
# Check WebSocket endpoint
wscat -c wss://api.kamiyo.ai/ws

# Check nginx WebSocket config
docker exec kamiyo-nginx cat /etc/nginx/nginx.conf | grep upgrade
```

**Solutions:**

1. **Configure nginx for WebSockets:**
   ```nginx
   location /ws {
       proxy_pass http://api:8000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_read_timeout 86400;
   }
   ```

2. **Increase WebSocket timeout:**
   ```python
   # In FastAPI app
   websocket_timeout = 3600  # 1 hour
   ```

3. **Implement reconnection logic:**
   ```javascript
   // Client-side
   function connectWebSocket() {
       const ws = new WebSocket('wss://api.kamiyo.ai/ws');
       ws.onclose = () => setTimeout(connectWebSocket, 1000);
   }
   ```

### Issue 14: Rate Limiting Too Aggressive

**Symptoms:**
- Legitimate users blocked
- 429 errors increasing
- User complaints

**Diagnosis:**
```bash
# Check rate limit logs
docker logs kamiyo-api | grep "rate limit"

# Check Redis rate limit keys
docker exec kamiyo-redis redis-cli --scan --pattern "rate_limit:*" | wc -l
```

**Solutions:**

1. **Adjust rate limits:**
   ```python
   # In config
   RATE_LIMITS = {
       'free': {'minute': 10, 'hour': 100, 'day': 1000},
       'pro': {'minute': 100, 'hour': 10000, 'day': 100000}
   }
   ```

2. **Whitelist IP addresses:**
   ```python
   RATE_LIMIT_WHITELIST = [
       '1.2.3.4',  # Office IP
       '5.6.7.8'   # Partner API
   ]
   ```

3. **Clear rate limit counters:**
   ```bash
   docker exec kamiyo-redis redis-cli --scan --pattern "rate_limit:user:123:*" | \
     xargs docker exec -i kamiyo-redis redis-cli DEL
   ```

### Issue 15: Prometheus Metrics Not Recording

**Symptoms:**
- Grafana dashboards empty
- No metrics in Prometheus
- Scrape targets down

**Diagnosis:**
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check metrics endpoint
curl http://localhost:8000/metrics

# Check Prometheus logs
docker logs kamiyo-prometheus
```

**Solutions:**

1. **Verify Prometheus configuration:**
   ```yaml
   # monitoring/prometheus.yml
   scrape_configs:
     - job_name: 'kamiyo-api'
       static_configs:
         - targets: ['api:8000']
   ```

2. **Restart Prometheus:**
   ```bash
   docker-compose -f docker-compose.production.yml restart prometheus
   ```

3. **Check firewall rules:**
   ```bash
   # Ensure metrics port accessible
   curl http://localhost:8000/metrics
   ```

---

## Incident Response

**See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) for complete procedures.**

### Quick Incident Response

1. **Acknowledge (0-5 min):**
   ```bash
   ./scripts/health_check.sh
   git log --oneline -5
   ```

2. **Communicate (5-10 min):**
   - Post to #incidents Slack channel
   - Update status page
   - Notify team

3. **Investigate (10-30 min):**
   ```bash
   docker logs kamiyo-api --tail=100 | grep ERROR
   docker stats
   ```

4. **Mitigate (30-60 min):**
   - Rollback if recent deployment
   - Scale if resource issue
   - Fix configuration if needed

5. **Resolve & Document:**
   - Verify fix
   - Update status page
   - Write post-mortem

---

## Rollback Procedures

### Rollback Last Deployment

```bash
# 1. Identify last deployment
git log --oneline -5

# 2. Checkout previous commit
git checkout HEAD~1

# 3. Rebuild and deploy
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d

# 4. Run migrations rollback (if needed)
docker exec kamiyo-api alembic downgrade -1

# 5. Verify
./scripts/health_check.sh
```

### Rollback Database Migration

```bash
# 1. Check current migration
docker exec kamiyo-api alembic current

# 2. Rollback one migration
docker exec kamiyo-api alembic downgrade -1

# 3. Verify
docker exec kamiyo-postgres psql -U kamiyo -c "\dt"

# 4. Restart API
docker-compose -f docker-compose.production.yml restart api
```

### Rollback to Specific Version

```bash
# 1. Find stable version
git tag -l
git log --oneline

# 2. Checkout version
git checkout v1.9.0

# 3. Deploy
./scripts/deploy.sh

# 4. Verify
./scripts/health_check.sh
```

### Emergency Rollback (Kubernetes)

```bash
# Rollback to previous revision
kubectl rollout undo deployment/kamiyo-api -n kamiyo

# Rollback to specific revision
kubectl rollout undo deployment/kamiyo-api --to-revision=3 -n kamiyo

# Check rollout status
kubectl rollout status deployment/kamiyo-api -n kamiyo
```

---

## Maintenance Tasks

### Daily Tasks

**Automated (via cron):**
```bash
# /etc/cron.daily/kamiyo-maintenance
0 2 * * * /opt/kamiyo/scripts/backup_database.sh
0 3 * * * /opt/kamiyo/scripts/health_check.sh
```

**Manual:**
```bash
# Check system health
./scripts/health_check.sh

# Review error logs
docker logs kamiyo-api --since 24h | grep -i error

# Monitor metrics
open https://metrics.kamiyo.ai
```

### Weekly Tasks

```bash
# Rotate logs
logrotate -f /etc/logrotate.conf

# Update dependencies (dev environment first)
pip list --outdated
pip install -r requirements.txt --upgrade

# Review database performance
docker exec kamiyo-postgres psql -U kamiyo -c \
  "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Clean up old Docker images
docker image prune -a

# Review security logs
docker logs kamiyo-api | grep -i "unauthorized\|forbidden"
```

### Monthly Tasks

```bash
# Credential rotation
./scripts/rotate_credentials.sh

# Database VACUUM
docker exec kamiyo-postgres psql -U kamiyo -c "VACUUM ANALYZE;"

# Update SSL certificates
certbot renew

# Review and archive old logs
tar -czf logs-$(date +%Y%m).tar.gz /var/log/kamiyo/
mv logs-*.tar.gz /backups/logs/

# Security audit
./scripts/security_audit.sh

# Performance review
./scripts/analyze_queries.sh

# Capacity planning
./scripts/capacity_report.sh
```

### Quarterly Tasks

```bash
# Major dependency updates
pip install -r requirements.txt --upgrade
npm update

# Security penetration test
./scripts/security_scan.sh

# Disaster recovery test
./scripts/test_disaster_recovery.sh

# Review and update runbooks
# Review and update incident response procedures
# Team training on new procedures
```

---

## Emergency Procedures

### Complete System Outage

**Immediate Actions:**

1. **Enable maintenance mode:**
   ```bash
   # Update DNS to maintenance page
   # Or use Cloudflare page rule
   ```

2. **Assess damage:**
   ```bash
   docker-compose -f docker-compose.production.yml ps
   docker logs kamiyo-api --tail=100
   df -h
   ```

3. **Restore from backup:**
   ```bash
   ./scripts/backup_restore.sh latest
   ```

4. **Restart all services:**
   ```bash
   docker-compose -f docker-compose.production.yml down
   docker-compose -f docker-compose.production.yml up -d
   ```

5. **Verify and disable maintenance mode:**
   ```bash
   ./scripts/health_check.sh
   # Update DNS back to normal
   ```

### Platform Bans (Social Media)

**Twitter/X Ban:**

1. **Switch to backup account:**
   ```bash
   # Update credentials
   export X_API_KEY=$X_BACKUP_API_KEY
   docker-compose -f docker-compose.production.yml restart social
   ```

2. **Appeal ban:**
   - Go to Twitter Developer Portal
   - Submit appeal with explanation
   - Document use case

3. **Implement rate limiting:**
   ```python
   # Reduce posting frequency
   RATE_LIMITS = {
       'twitter': {'posts_per_hour': 5, 'posts_per_day': 50}
   }
   ```

**Reddit Ban:**

1. **Review Reddit API rules:**
   - Check user agent string
   - Verify rate limiting compliance
   - Review subreddit rules

2. **Contact moderators:**
   - Explain bot purpose
   - Provide transparency
   - Request whitelist

3. **Implement cooldown:**
   ```python
   REDDIT_COOLDOWN_SECONDS = 600  # 10 minutes between posts
   ```

### API Key Compromise

**Immediate Actions:**

1. **Revoke compromised key:**
   ```bash
   docker exec kamiyo-api python -c \
     "from api.auth import revoke_api_key; revoke_api_key('compromised_key_id')"
   ```

2. **Block suspicious activity:**
   ```bash
   # Block IP addresses
   docker exec kamiyo-nginx nginx -s reload

   # Update firewall
   sudo ufw deny from <attacker_ip>
   ```

3. **Notify affected users:**
   ```python
   python scripts/notify_users.py --template=security_incident
   ```

4. **Rotate all credentials:**
   ```bash
   ./scripts/rotate_credentials.sh --force
   ```

5. **Review access logs:**
   ```bash
   docker logs kamiyo-api | grep "API_KEY:compromised_key" | \
     awk '{print $1, $7}' | sort | uniq
   ```

### Database Corruption

**Critical Procedure:**

1. **STOP ALL WRITES:**
   ```sql
   REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM kamiyo;
   ```

2. **Create emergency backup:**
   ```bash
   pg_dump -U kamiyo kamiyo_prod > /emergency_backup/$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Assess corruption:**
   ```bash
   # Check integrity
   docker exec kamiyo-postgres pg_dump -U kamiyo kamiyo_prod -f /tmp/test.sql

   # Identify corrupted tables
   docker exec kamiyo-postgres psql -U kamiyo -c "REINDEX DATABASE kamiyo_prod;"
   ```

4. **Restore from last known good backup:**
   ```bash
   # List backups
   ls -lh /backups/database/

   # Restore
   ./scripts/backup_restore.sh backup_20251014_020000.sql
   ```

5. **Verify integrity:**
   ```bash
   docker exec kamiyo-postgres psql -U kamiyo -c \
     "SELECT COUNT(*) FROM exploits;"
   ```

### Mass Service Failures

**When multiple services fail simultaneously:**

1. **Check infrastructure:**
   ```bash
   # CPU, Memory, Disk
   docker stats
   df -h
   free -h

   # Network
   ping -c 3 8.8.8.8
   curl -I https://google.com
   ```

2. **Check external dependencies:**
   ```bash
   # Stripe
   curl -I https://api.stripe.com

   # AWS
   curl -I https://status.aws.amazon.com

   # Cloudflare
   curl -I https://cloudflare-status.com
   ```

3. **Restart in dependency order:**
   ```bash
   # 1. Database & Redis
   docker-compose -f docker-compose.production.yml up -d postgres redis
   sleep 10

   # 2. API
   docker-compose -f docker-compose.production.yml up -d api
   sleep 10

   # 3. Supporting services
   docker-compose -f docker-compose.production.yml up -d aggregator social

   # 4. Bots
   docker-compose -f docker-compose.production.yml up -d discord-bot telegram-bot
   ```

4. **Verify each service:**
   ```bash
   ./scripts/health_check.sh
   ```

---

## Performance Tuning

### Database Optimization

**Query Optimization:**

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_exploits_chain_date
  ON exploits(chain, discovered_at DESC);

CREATE INDEX CONCURRENTLY idx_users_email
  ON users(email);

CREATE INDEX CONCURRENTLY idx_api_keys_key_hash
  ON api_keys(key_hash);

-- Analyze tables
ANALYZE exploits;
ANALYZE users;

-- Update statistics
ALTER TABLE exploits ALTER COLUMN chain SET STATISTICS 1000;
```

**Connection Pooling:**

```python
# Use SQLAlchemy connection pooling
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600
)
```

**Query Caching:**

```python
@cache.memoize(timeout=300)
def get_popular_exploits():
    return db.query(Exploit)\
        .filter(Exploit.loss_amount_usd > 1000000)\
        .order_by(Exploit.loss_amount_usd.desc())\
        .limit(100)\
        .all()
```

### Cache Optimization

**Redis Configuration:**

```conf
# redis.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
maxmemory-samples 5
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
```

**Cache Strategy:**

```python
# Short TTL for frequently changing data
cache.set('trending_exploits', data, ttl=300)  # 5 minutes

# Long TTL for static data
cache.set('chain_list', chains, ttl=86400)  # 24 hours

# Permanent cache for reference data
cache.set('attack_types', types, ttl=0)  # Never expire
```

### API Performance

**Response Compression:**

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

**Pagination:**

```python
@app.get("/api/v1/exploits")
def get_exploits(
    page: int = 1,
    page_size: int = 100,  # Default
    max_page_size: int = 500  # Maximum
):
    offset = (page - 1) * page_size
    exploits = db.query(Exploit).limit(page_size).offset(offset).all()
    return exploits
```

**Async Operations:**

```python
@app.get("/api/v1/exploits")
async def get_exploits():
    # Use async database driver
    async with db.session() as session:
        result = await session.execute(select(Exploit))
        return result.scalars().all()
```

### Network Optimization

**CDN Configuration:**

```nginx
# Cloudflare page rules
/*
  Cache Level: Cache Everything
  Edge Cache TTL: 1 hour
  Browser Cache TTL: 4 hours
```

**HTTP/2 & HTTP/3:**

```nginx
server {
    listen 443 ssl http2;
    listen 443 quic;

    # HTTP/3
    add_header Alt-Svc 'h3=":443"; ma=86400';
}
```

---

## Scaling Guidelines

### When to Scale

**Horizontal Scaling Triggers:**
- CPU usage > 70% sustained for 10+ minutes
- Response time p95 > 500ms
- Request queue length > 100
- Active users > 80% of capacity

**Vertical Scaling Triggers:**
- Memory usage > 85%
- Disk I/O wait > 30%
- Database queries > 80% of max connections

### Horizontal Scaling

**API Scaling:**

```bash
# Docker Compose
docker-compose -f docker-compose.production.yml up -d --scale api=5

# Kubernetes
kubectl scale deployment kamiyo-api --replicas=10 -n kamiyo

# Auto-scaling (Kubernetes)
kubectl autoscale deployment kamiyo-api \
  --min=3 --max=20 --cpu-percent=70 -n kamiyo
```

**Load Balancer Configuration:**

```nginx
upstream api_backend {
    least_conn;  # Route to least busy server

    server api-1:8000 max_fails=3 fail_timeout=30s;
    server api-2:8000 max_fails=3 fail_timeout=30s;
    server api-3:8000 max_fails=3 fail_timeout=30s;

    keepalive 32;
}
```

### Vertical Scaling

**Increase Container Resources:**

```yaml
# docker-compose.production.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

**Database Scaling:**

```bash
# Increase PostgreSQL resources
docker-compose -f docker-compose.production.yml stop postgres
# Edit docker-compose.yml to increase memory/CPU
docker-compose -f docker-compose.production.yml up -d postgres

# Optimize PostgreSQL settings
docker exec kamiyo-postgres psql -U kamiyo -c \
  "ALTER SYSTEM SET shared_buffers = '2GB';"
docker exec kamiyo-postgres psql -U kamiyo -c \
  "ALTER SYSTEM SET effective_cache_size = '6GB';"
```

### Database Scaling

**Read Replicas:**

```yaml
# docker-compose.production.yml
postgres-replica:
  image: postgres:15-alpine
  environment:
    POSTGRES_REPLICATION_MODE: replica
    POSTGRES_MASTER_HOST: postgres
  volumes:
    - postgres_replica_data:/var/lib/postgresql/data
```

**Connection Pooling (PgBouncer):**

```yaml
pgbouncer:
  image: pgbouncer/pgbouncer
  environment:
    DATABASES_HOST: postgres
    POOL_MODE: transaction
    DEFAULT_POOL_SIZE: 20
    MAX_CLIENT_CONN: 1000
```

### Cache Scaling

**Redis Cluster:**

```yaml
redis-cluster:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes
  deploy:
    replicas: 6
```

**Redis Sentinel (HA):**

```yaml
redis-sentinel:
  image: redis:7-alpine
  command: redis-sentinel /etc/redis/sentinel.conf
  depends_on:
    - redis
```

---

## Backup & Recovery

### Automated Backups

**Daily Database Backup (Cron):**

```bash
# /etc/cron.daily/kamiyo-backup
0 2 * * * /opt/kamiyo/scripts/backup_database.sh
```

**Backup Script:**

```bash
#!/bin/bash
# scripts/backup_database.sh

BACKUP_DIR="/backups/database"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kamiyo_backup_$DATE.sql.gz"

# Create backup
docker exec kamiyo-postgres pg_dump -U kamiyo kamiyo_prod | gzip > "$BACKUP_FILE"

# Verify backup
gunzip -t "$BACKUP_FILE" && echo "Backup verified: $BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" s3://kamiyo-backups/database/

# Keep last 30 days locally
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

# Keep last 90 days in S3
aws s3 ls s3://kamiyo-backups/database/ | \
  awk '{if (NR>90) print $4}' | \
  xargs -I {} aws s3 rm s3://kamiyo-backups/database/{}

echo "Backup completed: $BACKUP_FILE"
```

### Manual Backup

```bash
# Full database backup
docker exec kamiyo-postgres pg_dump -U kamiyo kamiyo_prod > backup_$(date +%Y%m%d).sql

# Specific table backup
docker exec kamiyo-postgres pg_dump -U kamiyo -t exploits kamiyo_prod > exploits_backup.sql

# Compressed backup
docker exec kamiyo-postgres pg_dump -U kamiyo kamiyo_prod | gzip > backup.sql.gz
```

### Restore from Backup

**Full Restore:**

```bash
# 1. Stop services
docker-compose -f docker-compose.production.yml stop api aggregator social

# 2. Drop existing database
docker exec kamiyo-postgres psql -U postgres -c "DROP DATABASE kamiyo_prod;"

# 3. Create new database
docker exec kamiyo-postgres psql -U postgres -c "CREATE DATABASE kamiyo_prod OWNER kamiyo;"

# 4. Restore backup
gunzip < backup.sql.gz | docker exec -i kamiyo-postgres psql -U kamiyo kamiyo_prod

# 5. Verify
docker exec kamiyo-postgres psql -U kamiyo kamiyo_prod -c "SELECT COUNT(*) FROM exploits;"

# 6. Restart services
docker-compose -f docker-compose.production.yml start api aggregator social
```

**Point-in-Time Recovery:**

```bash
# Enable WAL archiving
docker exec kamiyo-postgres psql -U postgres -c \
  "ALTER SYSTEM SET wal_level = replica;"
docker exec kamiyo-postgres psql -U postgres -c \
  "ALTER SYSTEM SET archive_mode = on;"
docker exec kamiyo-postgres psql -U postgres -c \
  "ALTER SYSTEM SET archive_command = 'cp %p /backups/wal/%f';"

# Restore to specific time
docker exec kamiyo-postgres pg_restore -U kamiyo \
  --target-time="2025-10-14 10:30:00" backup.dump
```

### Disaster Recovery Test

**Monthly DR Test:**

```bash
#!/bin/bash
# scripts/test_disaster_recovery.sh

echo "Starting disaster recovery test..."

# 1. Create test backup
./scripts/backup_database.sh

# 2. Simulate failure
docker-compose -f docker-compose.production.yml stop postgres

# 3. Restore from backup
./scripts/backup_restore.sh latest

# 4. Verify data integrity
COUNT=$(docker exec kamiyo-postgres psql -U kamiyo -t -c "SELECT COUNT(*) FROM exploits;")
echo "Exploit count after restore: $COUNT"

# 5. Test API
curl -f https://api.kamiyo.ai/health || echo "API health check failed!"

echo "Disaster recovery test completed"
```

---

## Security Procedures

### Credential Rotation

**Automated Rotation (Quarterly):**

```bash
#!/bin/bash
# scripts/rotate_credentials.sh

echo "Starting credential rotation..."

# 1. Generate new secrets
NEW_JWT_SECRET=$(openssl rand -hex 32)
NEW_DB_PASSWORD=$(openssl rand -base64 32)
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)

# 2. Update secrets in secrets manager
aws secretsmanager update-secret \
  --secret-id kamiyo/jwt_secret \
  --secret-string "$NEW_JWT_SECRET"

# 3. Deploy with new credentials
export JWT_SECRET=$NEW_JWT_SECRET
docker-compose -f docker-compose.production.yml up -d --no-deps api

# 4. Verify
curl -f https://api.kamiyo.ai/health || echo "Health check failed!"

echo "Credential rotation completed"
```

### Security Audit

**Monthly Security Check:**

```bash
#!/bin/bash
# scripts/security_audit.sh

echo "Starting security audit..."

# 1. Check for exposed secrets
grep -r "api_key\|password\|secret" . --exclude-dir=node_modules --exclude-dir=.git

# 2. Check for vulnerable dependencies
pip-audit
npm audit

# 3. Check SSL certificate
echo | openssl s_client -connect api.kamiyo.ai:443 2>/dev/null | openssl x509 -noout -dates

# 4. Check for open ports
nmap localhost

# 5. Review access logs for suspicious activity
docker logs kamiyo-api | grep -E "401|403|429" | tail -100

# 6. Check database permissions
docker exec kamiyo-postgres psql -U postgres -c "\du"

echo "Security audit completed"
```

### Access Control

**User Access Review:**

```bash
# List all admin users
docker exec kamiyo-postgres psql -U kamiyo -c \
  "SELECT email, role, last_login FROM users WHERE role = 'admin';"

# Revoke access
docker exec kamiyo-postgres psql -U kamiyo -c \
  "UPDATE users SET is_active = false WHERE email = 'user@example.com';"

# Review API key usage
docker exec kamiyo-postgres psql -U kamiyo -c \
  "SELECT api_key, user_id, last_used, request_count FROM api_keys ORDER BY last_used DESC;"
```

### SSL/TLS Management

**Certificate Renewal:**

```bash
# Check expiration
certbot certificates

# Renew certificates
certbot renew --nginx

# Force renewal (if needed)
certbot renew --force-renewal

# Restart nginx
docker-compose -f docker-compose.production.yml restart nginx
```

---

## Contact Information

### On-Call Engineers

| Week | Engineer | Phone | Email | Backup |
|------|----------|-------|-------|--------|
| 1-2 | Engineer A | +1-555-0001 | engineer-a@kamiyo.ai | Engineer B |
| 3-4 | Engineer B | +1-555-0002 | engineer-b@kamiyo.ai | Engineer C |

### Escalation Path

1. **L1 - On-Call Engineer** (0-30 min)
2. **L2 - Senior Engineer** (30-60 min)
3. **L3 - Engineering Lead** (60+ min)
4. **L4 - CTO** (Critical incidents only)

### External Support

- **Stripe Support:** support@stripe.com | +1-888-926-2289
- **AWS Support:** [AWS Console](https://console.aws.amazon.com/support)
- **Cloudflare Support:** [Cloudflare Dashboard](https://dash.cloudflare.com)
- **DigitalOcean Support:** [Support Portal](https://cloud.digitalocean.com/support)

### Internal Channels

- **Slack:** #incidents (critical), #ops (operational)
- **PagerDuty:** https://kamiyo.pagerduty.com
- **Status Page:** https://status.kamiyo.ai
- **Runbook Repository:** https://github.com/kamiyo/runbooks

---

## Appendix

### A. Environment Variables Reference

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `STRIPE_API_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

**Optional:**
- `SENTRY_DSN` - Error tracking
- `LOG_LEVEL` - Logging verbosity (DEBUG, INFO, WARNING, ERROR)
- `ENVIRONMENT` - Environment name (production, staging, development)
- `ALLOWED_ORIGINS` - CORS allowed origins

### B. Common File Locations

- **Logs:** `/var/log/kamiyo/`
- **Backups:** `/backups/`
- **SSL Certificates:** `/etc/letsencrypt/live/`
- **Configuration:** `/opt/kamiyo/.env.production`
- **Scripts:** `/opt/kamiyo/scripts/`

### C. Useful Commands Cheat Sheet

```bash
# Quick health check
curl -f https://api.kamiyo.ai/health

# View all logs
docker-compose -f docker-compose.production.yml logs -f

# Restart everything
docker-compose -f docker-compose.production.yml restart

# Scale API
docker-compose -f docker-compose.production.yml up -d --scale api=5

# Database backup
./scripts/backup_database.sh

# Security audit
./scripts/security_audit.sh
```

---

**Last Updated:** October 14, 2025
**Version:** 2.0
**Next Review:** January 14, 2026
**Maintainer:** Platform Engineering Team

**Remember: When in doubt, document first, then act. Communication is key during incidents.**
