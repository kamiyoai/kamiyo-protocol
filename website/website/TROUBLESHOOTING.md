# Kamiyo Troubleshooting Guide

Comprehensive guide for diagnosing and resolving common issues in the Kamiyo platform.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [API Issues](#api-issues)
- [Database Issues](#database-issues)
- [Cache Issues](#cache-issues)
- [Payment Issues](#payment-issues)
- [Aggregator Issues](#aggregator-issues)
- [Performance Issues](#performance-issues)
- [Deployment Issues](#deployment-issues)

---

## Quick Diagnostics

### Run Health Check

```bash
./scripts/health_check.sh
```

### Check Service Status

```bash
docker-compose -f docker-compose.production.yml ps
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.production.yml logs -f

# Specific service
docker-compose -f docker-compose.production.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.production.yml logs --tail=100
```

### Check Resource Usage

```bash
docker stats
```

---

## Common Issues

### Issue: API Not Responding

**Symptoms:**
- HTTP 502/503 errors
- Connection timeouts
- Health check fails

**Diagnosis:**

```bash
# Check if API container is running
docker ps | grep kamiyo-api

# Check API logs
docker logs kamiyo-api --tail=50

# Check if port is listening
netstat -tuln | grep 8000
```

**Solutions:**

1. **Restart API service:**
   ```bash
   docker-compose -f docker-compose.production.yml restart api
   ```

2. **Check environment variables:**
   ```bash
   docker exec kamiyo-api env | grep -E "DATABASE_URL|REDIS_URL|STRIPE"
   ```

3. **Rebuild and restart:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d --build api
   ```

4. **Check firewall:**
   ```bash
   sudo ufw status
   sudo iptables -L -n | grep 8000
   ```

---

### Issue: Database Connection Failed

**Symptoms:**
- "Connection refused" errors
- "Max connections reached"
- Slow queries

**Diagnosis:**

```bash
# Check database container
docker ps | grep postgres

# Check database logs
docker logs postgres --tail=50

# Test database connection
docker exec postgres pg_isready -U kamiyo
```

**Solutions:**

1. **Restart PostgreSQL:**
   ```bash
   docker-compose -f docker-compose.production.yml restart postgres
   ```

2. **Check connection pool:**
   ```bash
   docker exec postgres psql -U kamiyo -d kamiyo_prod -c \
     "SELECT count(*) FROM pg_stat_activity;"
   ```

3. **Increase max connections:**
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   SELECT pg_reload_conf();
   ```

4. **Kill idle connections:**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '1 hour';
   ```

---

### Issue: Redis Cache Not Working

**Symptoms:**
- Slow response times
- Cache miss rate 100%
- Connection errors

**Diagnosis:**

```bash
# Check Redis container
docker ps | grep redis

# Test Redis connection
docker exec redis redis-cli ping

# Check Redis memory
docker exec redis redis-cli INFO memory
```

**Solutions:**

1. **Restart Redis:**
   ```bash
   docker-compose -f docker-compose.production.yml restart redis
   ```

2. **Clear cache:**
   ```bash
   docker exec redis redis-cli FLUSHALL
   ```

3. **Check Redis logs:**
   ```bash
   docker logs redis --tail=100
   ```

4. **Verify Redis password:**
   ```bash
   docker exec redis redis-cli -a $REDIS_PASSWORD ping
   ```

---

## API Issues

### 401 Unauthorized Errors

**Cause:** Invalid or missing API key/token

**Solutions:**

1. **Verify API key:**
   ```bash
   curl -H "X-API-Key: your_api_key" http://localhost:8000/api/v1/exploits
   ```

2. **Check JWT token expiration:**
   ```python
   import jwt
   token = "your_token"
   decoded = jwt.decode(token, options={"verify_signature": False})
   print(decoded)
   ```

3. **Generate new API key:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/api-keys/generate \
     -H "Authorization: Bearer your_token" \
     -H "Content-Type: application/json" \
     -d '{"name": "New Key"}'
   ```

### 429 Rate Limit Exceeded

**Cause:** Too many requests

**Solutions:**

1. **Check rate limit:**
   ```bash
   curl -I http://localhost:8000/api/v1/exploits -H "X-API-Key: key"
   # Look for X-RateLimit headers
   ```

2. **Upgrade tier or wait for reset**

3. **Implement request throttling in client**

### 500 Internal Server Error

**Cause:** Application error

**Diagnosis:**

```bash
# Check application logs
docker logs kamiyo-api --tail=100 | grep ERROR

# Check Sentry for errors
# Visit: https://sentry.io/organizations/your-org/issues/
```

**Solutions:**

1. **Check recent code changes:**
   ```bash
   git log --oneline -10
   ```

2. **Rollback if needed:**
   ```bash
   git revert HEAD
   ./scripts/deploy.sh
   ```

3. **Check database migrations:**
   ```bash
   docker exec kamiyo-api alembic current
   docker exec kamiyo-api alembic history
   ```

---

## Database Issues

### Slow Queries

**Diagnosis:**

```sql
-- Find slow queries
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Find missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;
```

**Solutions:**

1. **Add indexes:**
   ```sql
   CREATE INDEX idx_exploits_chain ON exploits(chain);
   CREATE INDEX idx_exploits_date ON exploits(discovered_at DESC);
   ```

2. **Run VACUUM:**
   ```sql
   VACUUM ANALYZE;
   ```

3. **Update statistics:**
   ```sql
   ANALYZE;
   ```

### Database Disk Full

**Diagnosis:**

```bash
docker exec postgres df -h /var/lib/postgresql/data
```

**Solutions:**

1. **Clean up old data:**
   ```sql
   DELETE FROM exploits WHERE discovered_at < NOW() - INTERVAL '2 years';
   VACUUM FULL;
   ```

2. **Archive old data:**
   ```bash
   pg_dump -t old_table > /backups/old_table.sql
   DROP TABLE old_table;
   ```

3. **Expand disk:**
   ```bash
   # DigitalOcean/AWS: Resize volume through console
   # Then resize filesystem
   sudo resize2fs /dev/sda1
   ```

---

## Cache Issues

### Low Cache Hit Rate

**Diagnosis:**

```bash
docker exec redis redis-cli INFO stats | grep keyspace
docker exec redis redis-cli INFO stats | grep hits
```

**Solutions:**

1. **Increase TTL:**
   ```python
   cache.set(key, value, ttl=3600)  # 1 hour
   ```

2. **Pre-warm cache:**
   ```bash
   curl http://localhost:8000/api/v1/exploits?limit=100
   ```

3. **Optimize cache keys:**
   ```python
   # Bad: Different keys for same data
   cache.set(f"user_{user_id}", data)
   cache.set(f"user-{user_id}", data)

   # Good: Consistent key pattern
   cache.set(f"user:{user_id}", data)
   ```

### Redis Memory Full

**Diagnosis:**

```bash
docker exec redis redis-cli INFO memory
```

**Solutions:**

1. **Set eviction policy:**
   ```bash
   docker exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Increase memory limit:**
   ```bash
   docker exec redis redis-cli CONFIG SET maxmemory 2gb
   ```

3. **Clear old keys:**
   ```bash
   docker exec redis redis-cli --scan --pattern "old:*" | xargs docker exec -i redis redis-cli DEL
   ```

---

## Payment Issues

### Stripe Webhook Not Working

**Symptoms:**
- Subscription status not updating
- Payment confirmations not received

**Diagnosis:**

```bash
# Check webhook logs
docker logs kamiyo-api | grep webhook

# Test webhook endpoint
curl -X POST http://localhost:8000/api/v1/payments/webhook \
  -H "stripe-signature: test" \
  -d '{"type": "test"}'
```

**Solutions:**

1. **Verify webhook secret:**
   ```bash
   echo $STRIPE_WEBHOOK_SECRET
   # Should match Stripe dashboard
   ```

2. **Check webhook URL:**
   - Go to Stripe Dashboard > Developers > Webhooks
   - Ensure URL is: `https://api.kamiyo.ai/api/v1/payments/webhook`
   - Check SSL certificate is valid

3. **Test webhook manually:**
   ```bash
   stripe trigger payment_intent.succeeded
   ```

4. **Check firewall allows Stripe IPs:**
   ```bash
   # Allow Stripe webhook IPs
   sudo ufw allow from 3.18.12.0/24
   sudo ufw allow from 3.130.192.0/25
   ```

### Failed Payment Processing

**Diagnosis:**

```bash
# Check payment logs
docker logs kamiyo-api | grep -i "payment\|stripe"

# Check Stripe dashboard
# Visit: https://dashboard.stripe.com/payments
```

**Solutions:**

1. **Verify Stripe API key:**
   ```python
   import stripe
   stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
   print(stripe.Account.retrieve())
   ```

2. **Check test/live mode mismatch:**
   ```bash
   # Ensure keys match environment
   echo $STRIPE_SECRET_KEY | grep -o "^sk_\w\+"
   # sk_test_ for testing
   # sk_live_ for production
   ```

3. **Handle failed payments:**
   ```python
   try:
       stripe.PaymentIntent.create(...)
   except stripe.error.CardError as e:
       # Card declined
       log.error(f"Card declined: {e.user_message}")
   except stripe.error.RateLimitError:
       # Too many requests
       time.sleep(1)
       retry()
   ```

---

## Aggregator Issues

### No New Exploits Fetched

**Diagnosis:**

```bash
# Check aggregator logs
docker logs kamiyo-aggregator --tail=100

# Check last successful fetch
docker exec postgres psql -U kamiyo -d kamiyo_prod -c \
  "SELECT source, MAX(discovered_at) FROM exploits GROUP BY source;"
```

**Solutions:**

1. **Restart aggregator:**
   ```bash
   docker-compose -f docker-compose.production.yml restart aggregator
   ```

2. **Check source APIs:**
   ```bash
   curl https://rekt.news/feed/
   curl https://api.peckshield.com/alerts
   ```

3. **Verify API keys:**
   ```bash
   docker exec kamiyo-aggregator env | grep -E "TWITTER|GITHUB"
   ```

4. **Check rate limits:**
   - Twitter: 15 requests/15 minutes
   - GitHub: 60 requests/hour (unauthenticated)

### Duplicate Exploits

**Diagnosis:**

```sql
SELECT tx_hash, COUNT(*)
FROM exploits
GROUP BY tx_hash
HAVING COUNT(*) > 1;
```

**Solutions:**

1. **Run deduplication:**
   ```python
   python scripts/deduplicate_exploits.py
   ```

2. **Add unique constraint:**
   ```sql
   ALTER TABLE exploits
   ADD CONSTRAINT unique_tx_hash UNIQUE (tx_hash);
   ```

3. **Update aggregator logic:**
   ```python
   # Check before inserting
   existing = db.query(Exploit).filter_by(tx_hash=tx_hash).first()
   if not existing:
       db.add(new_exploit)
   ```

---

## Performance Issues

### High CPU Usage

**Diagnosis:**

```bash
docker stats
top -p $(docker inspect --format '{{.State.Pid}}' kamiyo-api)
```

**Solutions:**

1. **Optimize queries:**
   ```python
   # Bad: N+1 query
   for exploit in exploits:
       exploit.protocol  # Lazy load

   # Good: Eager load
   exploits = db.query(Exploit).options(joinedload(Exploit.protocol)).all()
   ```

2. **Add caching:**
   ```python
   @cache.memoize(timeout=300)
   def get_exploits():
       return db.query(Exploit).all()
   ```

3. **Scale horizontally:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d --scale api=3
   ```

### High Memory Usage

**Diagnosis:**

```bash
docker stats kamiyo-api
```

**Solutions:**

1. **Implement pagination:**
   ```python
   # Bad: Load all
   exploits = db.query(Exploit).all()

   # Good: Paginate
   exploits = db.query(Exploit).limit(100).offset(page * 100).all()
   ```

2. **Use streaming:**
   ```python
   def stream_exploits():
       for exploit in db.query(Exploit).yield_per(100):
           yield exploit
   ```

3. **Set memory limits:**
   ```yaml
   # docker-compose.production.yml
   services:
     api:
       deploy:
         resources:
           limits:
             memory: 1G
   ```

---

## Deployment Issues

### Deployment Failed

**Diagnosis:**

```bash
# Check deployment logs
cat deployments/deployment_*.json | jq -s 'sort_by(.timestamp) | last'

# Check Docker Compose status
docker-compose -f docker-compose.production.yml ps
```

**Solutions:**

1. **Rollback:**
   ```bash
   git log --oneline -5
   git checkout <previous-commit>
   ./scripts/deploy.sh
   ```

2. **Check migration errors:**
   ```bash
   docker-compose -f docker-compose.production.yml run --rm api alembic current
   docker-compose -f docker-compose.production.yml run --rm api alembic history
   ```

3. **Manual deployment:**
   ```bash
   docker-compose -f docker-compose.production.yml down
   docker-compose -f docker-compose.production.yml up -d --build
   ```

### Docker Build Failed

**Diagnosis:**

```bash
docker-compose -f docker-compose.production.yml build api
```

**Solutions:**

1. **Clear build cache:**
   ```bash
   docker-compose -f docker-compose.production.yml build --no-cache api
   ```

2. **Check Dockerfile:**
   ```bash
   docker build -f Dockerfile.api.prod -t kamiyo-api:test .
   ```

3. **Free up disk space:**
   ```bash
   docker system prune -a
   ```

---

## Emergency Procedures

### Complete System Failure

1. **Switch to maintenance mode:**
   ```bash
   # Update DNS to point to maintenance page
   # Or use Cloudflare page rules
   ```

2. **Restore from backup:**
   ```bash
   ./scripts/backup_restore.sh latest
   ```

3. **Restart all services:**
   ```bash
   docker-compose -f docker-compose.production.yml down
   docker-compose -f docker-compose.production.yml up -d
   ```

4. **Verify health:**
   ```bash
   ./scripts/health_check.sh
   ```

### Data Corruption

1. **Stop writes:**
   ```sql
   REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM kamiyo;
   ```

2. **Create backup:**
   ```bash
   ./scripts/backup_database.sh
   ```

3. **Restore from last known good backup:**
   ```bash
   ./scripts/backup_restore.sh <backup_name>
   ```

4. **Verify data integrity:**
   ```sql
   SELECT COUNT(*) FROM exploits;
   SELECT MAX(id), MIN(id) FROM exploits;
   ```

---

## Getting Help

### Check Logs

```bash
# Application logs
docker logs kamiyo-api --tail=100

# System logs
sudo journalctl -u docker -n 100

# Nginx logs (if applicable)
sudo tail -f /var/log/nginx/error.log
```

### Enable Debug Mode

```bash
# .env.production
LOG_LEVEL=DEBUG

# Restart
docker-compose -f docker-compose.production.yml restart api
```

### Contact Support

- **GitHub Issues:** https://github.com/your-org/kamiyo/issues
- **Discord:** https://discord.gg/kamiyo
- **Email:** support@kamiyo.ai

### Useful Commands

```bash
# Complete system status
./scripts/health_check.sh

# View all services
docker-compose -f docker-compose.production.yml ps

# Follow logs
docker-compose -f docker-compose.production.yml logs -f

# Restart everything
docker-compose -f docker-compose.production.yml restart

# Full rebuild
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --build
```

---

**Last Updated:** October 8, 2025
**Maintainer:** Kamiyo DevOps Team
