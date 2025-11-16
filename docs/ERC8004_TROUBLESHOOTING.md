# ERC-8004 Troubleshooting Guide

## Common Issues

### Slow Query Performance

**Symptoms**:
- API responses taking >500ms
- Database CPU high
- Timeout errors

**Diagnosis**:
```bash
# Check materialized view freshness
psql -c "SELECT MAX(last_feedback_at),
         EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at))) as age_seconds
         FROM mv_erc8004_agent_reputation;"

# Check query execution plans
psql -c "EXPLAIN ANALYZE SELECT * FROM v_erc8004_agent_stats WHERE status = 'active' LIMIT 50;"
```

**Resolution**:
1. Refresh materialized views:
   ```sql
   SELECT refresh_erc8004_stats();
   ```

2. Verify indexes exist:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename LIKE 'erc8004%';
   ```

3. Run ANALYZE:
   ```sql
   ANALYZE erc8004_agents;
   ANALYZE erc8004_reputation;
   ```

4. Check cache hit rate:
   ```bash
   redis-cli INFO stats | grep keyspace_hits
   ```

---

### Cache Issues

**Symptoms**:
- Stale data returned
- Cache misses high
- Redis connection errors

**Diagnosis**:
```bash
# Check Redis connection
redis-cli PING

# Check cache keys
redis-cli KEYS "erc8004:*" | head -20

# Check memory usage
redis-cli INFO memory
```

**Resolution**:
1. Clear specific agent cache:
   ```python
   from api.erc8004.cache import ERC8004Cache
   cache = ERC8004Cache()
   await cache.invalidate_agent("agent-uuid")
   ```

2. Clear all ERC-8004 caches:
   ```bash
   redis-cli KEYS "erc8004:*" | xargs redis-cli DEL
   ```

3. Restart Redis if needed:
   ```bash
   sudo systemctl restart redis
   ```

---

### Rate Limiting Errors

**Symptoms**:
- 429 errors
- "Rate limit exceeded" messages

**Diagnosis**:
Check rate limit status:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -I https://kamiyo.ai/api/v1/agents/

# Look for headers:
# X-RateLimit-Limit: 1000
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1642176000
```

**Resolution**:
1. Wait for rate limit reset
2. Upgrade API tier for higher limits
3. Implement exponential backoff:
   ```python
   async def with_retry(func, max_retries=3):
       for i in range(max_retries):
           try:
               return await func()
           except RateLimitError as e:
               if i == max_retries - 1:
                   raise
               await asyncio.sleep(2 ** i)
   ```

---

### Authentication Failures

**Symptoms**:
- 401 Unauthorized errors
- "Invalid API key" messages

**Diagnosis**:
```bash
# Test API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://kamiyo.ai/api/v1/agents/

# Check API key status in database
psql -c "SELECT status, created_at FROM api_keys WHERE key = 'YOUR_API_KEY';"
```

**Resolution**:
1. Verify API key is correct
2. Check API key is active
3. Regenerate API key if compromised
4. Check for trailing whitespace in header

---

### Transaction Rollback Errors

**Symptoms**:
- "Transaction failed" in logs
- Partial data writes
- Inconsistent state

**Diagnosis**:
```bash
# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log | grep erc8004

# Check for long-running transactions
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query
         FROM pg_stat_activity
         WHERE state != 'idle'
         ORDER BY duration DESC;"
```

**Resolution**:
1. Transaction automatically rolls back on error
2. Check application logs for root cause
3. Retry operation if transient error
4. Contact support if persistent

---

### Materialized View Staleness

**Symptoms**:
- Stats not updating
- Old feedback not appearing
- Incorrect reputation scores

**Diagnosis**:
```sql
-- Check view age
SELECT EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at)))::int as age_seconds
FROM mv_erc8004_agent_reputation;

-- Should be < 300 seconds (5 minutes)
```

**Resolution**:
```sql
-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_reputation;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_payment_stats;

-- Or use helper function
SELECT refresh_erc8004_stats();
```

Set up automated refresh (cron):
```bash
*/5 * * * * psql -c "SELECT refresh_erc8004_stats();"
```

---

### High Memory Usage

**Symptoms**:
- Redis OOM errors
- Application memory leaks
- Slow response times

**Diagnosis**:
```bash
# Check Redis memory
redis-cli INFO memory

# Check cache evictions
redis-cli INFO stats | grep evicted

# Check application memory
ps aux | grep uvicorn
```

**Resolution**:
1. Increase Redis maxmemory:
   ```bash
   redis-cli CONFIG SET maxmemory 2gb
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. Clear old cache entries:
   ```bash
   redis-cli --scan --pattern "erc8004:*" |
   xargs -L 100 redis-cli DEL
   ```

3. Restart application:
   ```bash
   sudo systemctl restart kamiyo-api
   ```

---

### Database Connection Pool Exhaustion

**Symptoms**:
- "Too many connections" errors
- Timeout on database queries
- Connection refused errors

**Diagnosis**:
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity
WHERE datname = 'kamiyo';

-- Check connection limit
SHOW max_connections;
```

**Resolution**:
1. Increase pool size:
   ```python
   DATABASE_POOL_SIZE=20
   DATABASE_MAX_OVERFLOW=40
   ```

2. Find and kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'kamiyo'
   AND state = 'idle'
   AND state_change < now() - interval '5 minutes';
   ```

3. Restart application

---

### Monitoring Alerts

#### High Error Rate
```bash
# Check error metrics
curl http://localhost:8000/metrics | grep erc8004.*error

# Check Sentry for exceptions
# https://sentry.io/kamiyo/
```

#### Slow Response Times
```bash
# Check P95 latency
curl http://localhost:8000/metrics | grep erc8004.*duration

# Should be < 500ms for most endpoints
```

#### Low Cache Hit Rate
```bash
# Check cache effectiveness
redis-cli INFO stats | grep keyspace
# Hit rate should be > 80%
```

---

## Performance Tuning

### Database Optimization

1. Run VACUUM regularly:
   ```sql
   VACUUM ANALYZE erc8004_agents;
   ```

2. Check for missing indexes:
   ```sql
   SELECT schemaname, tablename, attname, n_distinct
   FROM pg_stats
   WHERE schemaname = 'public'
   AND tablename LIKE 'erc8004%'
   AND n_distinct > 100;
   ```

3. Monitor slow queries:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   WHERE query LIKE '%erc8004%'
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

### Redis Optimization

1. Enable persistence:
   ```bash
   redis-cli CONFIG SET save "900 1 300 10 60 10000"
   ```

2. Set appropriate eviction policy:
   ```bash
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

3. Monitor key expiration:
   ```bash
   redis-cli INFO keyspace
   ```

---

## Getting Help

### Logs to Provide

When requesting support, include:

1. Application logs:
   ```bash
   journalctl -u kamiyo-api -n 1000 --no-pager
   ```

2. PostgreSQL logs:
   ```bash
   tail -1000 /var/log/postgresql/postgresql-*.log
   ```

3. Redis info:
   ```bash
   redis-cli INFO all > redis-info.txt
   ```

4. Metrics snapshot:
   ```bash
   curl http://localhost:8000/metrics > metrics.txt
   ```

### Support Channels

- GitHub Issues: https://github.com/kamiyo/erc8004
- Discord: https://discord.gg/kamiyo
- Email: support@kamiyo.ai
- Emergency: +1-XXX-XXX-XXXX

---

## Maintenance

### Regular Tasks

**Daily**:
- Monitor error rates in Sentry
- Check API response times
- Review rate limit hits

**Weekly**:
- VACUUM database tables
- Review slow query logs
- Update indexes if needed

**Monthly**:
- Review and rotate logs
- Update dependencies
- Performance review
