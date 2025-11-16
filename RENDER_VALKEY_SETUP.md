# Render Valkey Setup for ERC-8004

**Date:** 2025-01-14
**Service:** Render Key-Value Store (Valkey)
**Purpose:** Rate limiting and caching for ERC-8004 API

---

## What is Render Valkey?

Render's managed Redis-compatible service (Valkey):
- Redis-compatible API
- Managed service (no maintenance)
- Automatic backups
- High availability
- SSL/TLS by default

**Pricing:** Free tier available with 25MB storage

---

## Setup Steps

### 1. Create Valkey Instance on Render

**Via Render Dashboard:**
1. Go to https://dashboard.render.com
2. Click "New +" → "Key-Value Store"
3. Configure:
   - Name: `kamiyo-erc8004-cache`
   - Plan: Free (25MB) or Starter ($7/month)
   - Region: Singapore (same as database)
   - Max Memory Policy: `allkeys-lru` (recommended for cache)

**Via Render Blueprint (if exists):**
```yaml
# render.yaml
databases:
  - name: kamiyo-erc8004-cache
    type: redis
    plan: free  # or starter
    region: singapore
    maxmemoryPolicy: allkeys-lru
```

### 2. Get Connection URL

After creation, Render provides:
```
Internal Redis URL (recommended):
redis://red-xxxxxxxxxxxxx:6379

External Redis URL (if needed):
redis://red-xxxxxxxxxxxxx.singapore-redis.render.com:6379
```

**Format:**
```
redis://:<password>@<host>:<port>
```

### 3. Add to Environment Variables

**On Render Dashboard:**
1. Go to your web service (kamiyo)
2. Environment → Add Environment Variable
3. Add:
   ```
   REDIS_URL=redis://:<password>@red-xxxxx.singapore-redis.render.com:6379
   ```

**Local Development (.env):**
```bash
# Render Valkey (production)
REDIS_URL=redis://:<password>@red-xxxxx.singapore-redis.render.com:6379

# Or local Redis (development)
# REDIS_URL=redis://localhost:6379
```

---

## Code Configuration

### Current Implementation ✅

The ERC-8004 code already supports Redis via environment variable:

**rate_limiter.py:**
```python
async def init_redis_client():
    client = redis.from_url(
        os.getenv('REDIS_URL', 'redis://localhost:6379'),
        encoding="utf-8",
        decode_responses=True
    )
    await client.ping()
    return client
```

**cache.py:**
```python
class ERC8004Cache:
    def __init__(self):
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.redis = redis.from_url(redis_url)
```

### SSL/TLS Support

Render Valkey uses TLS by default. Update if needed:

```python
# For TLS connections (Render default)
client = redis.from_url(
    os.getenv('REDIS_URL'),
    ssl_cert_reqs=None,  # Disable cert verification for managed service
    encoding="utf-8",
    decode_responses=True
)
```

---

## What Uses Redis/Valkey?

### 1. Rate Limiting (SlowAPI)

**Endpoints with rate limits:**
- `POST /api/v1/agents/register` - 10/minute
- `POST /api/v1/agents/feedback` - 100/minute
- `POST /api/v1/agents/link-payment` - 50/minute
- `GET /api/v1/agents/` (search) - 300/minute
- `GET /api/v1/agents/{uuid}` - 1000/minute

**Storage:** Rate limit counters (expire after window)

### 2. Caching

**Cached endpoints:**
- `GET /api/v1/agents/{uuid}/stats` - 5 minute TTL
- Agent reputation summaries
- Payment statistics

**Storage:** Cached JSON responses

### 3. Session Storage (if implemented)

- User sessions
- Temporary authentication tokens

---

## Testing Without Redis

### Graceful Degradation

The code has error handling but will fail without Redis:

```python
try:
    await client.ping()
    logger.info("Redis connection established")
    return client
except Exception as e:
    logger.error(f"Redis connection failed: {e}")
    raise ConnectionError(f"Failed to connect to Redis: {e}")
```

**Result:** Tests fail if Redis not available

### Mock Redis for Tests (Alternative)

**Option 1: Use fakeredis**
```bash
pip install fakeredis
```

```python
# conftest.py
import pytest
from fakeredis import aioredis

@pytest.fixture
async def redis_client():
    client = aioredis.FakeRedis()
    yield client
    await client.close()
```

**Option 2: pytest-redis**
```bash
pip install pytest-redis
```

---

## Estimated Costs

### Render Valkey Pricing

**Free Tier:**
- 25MB storage
- 1 connection
- Good for: Testing, low-traffic APIs
- **Cost:** $0/month

**Starter:**
- 256MB storage
- 100 connections
- Good for: Production, moderate traffic
- **Cost:** $7/month

**Standard:**
- 1GB storage
- 500 connections
- High availability
- **Cost:** $25/month

### Current ERC-8004 Usage Estimate

**Rate Limit Counters:**
- ~100 bytes per counter
- ~1000 active users = 100KB
- Expire after 1 minute to 1 hour

**Cache Storage:**
- Agent stats: ~1KB per agent
- 1000 agents cached = 1MB
- 5 minute TTL

**Total Estimate:** ~2-5MB for moderate usage
**Recommended:** Free tier (25MB) is sufficient initially

---

## Setup Checklist

### On Render Dashboard

- [ ] Create Valkey instance
- [ ] Choose region (Singapore recommended)
- [ ] Set max memory policy to `allkeys-lru`
- [ ] Copy internal Redis URL
- [ ] Add REDIS_URL to web service environment
- [ ] Restart web service

### In Code

- [x] Code already supports REDIS_URL env var
- [x] Redis client initialization implemented
- [x] Error handling in place
- [x] Rate limiting configured
- [x] Caching configured

### For Testing

- [ ] Add REDIS_URL to local .env
- [ ] Verify connection with test script
- [ ] Run test suite
- [ ] Check rate limiting works
- [ ] Check caching works

---

## Verification Script

```python
import asyncio
import redis.asyncio as redis
import os

async def test_valkey():
    url = os.getenv('REDIS_URL', 'redis://localhost:6379')
    print(f'Connecting to: {url[:30]}...')

    client = redis.from_url(url, decode_responses=True)

    # Test connection
    pong = await client.ping()
    print(f'✓ PING: {pong}')

    # Test set/get
    await client.set('test:erc8004', 'working', ex=60)
    value = await client.get('test:erc8004')
    print(f'✓ SET/GET: {value}')

    # Test increment (for rate limiting)
    count = await client.incr('test:counter')
    print(f'✓ INCR: {count}')

    # Test expiry
    ttl = await client.ttl('test:erc8004')
    print(f'✓ TTL: {ttl} seconds')

    await client.close()
    print('\n✓ Valkey connection working!')

asyncio.run(test_valkey())
```

**Run:**
```bash
export REDIS_URL="redis://:<password>@red-xxxxx.singapore-redis.render.com:6379"
python3 test_valkey.py
```

---

## Impact on Tests

### Before Valkey Setup

**Test Results:**
- 2 PASSED / 14 FAILED (12.5%)
- Failures: "Connection refused [Errno 61]"

### After Valkey Setup

**Expected Results:**
- 10-12 PASSED / 4-6 FAILED (62-75%)
- Rate limiting tests: ✅ PASS
- Caching tests: ✅ PASS
- Remaining failures: Test fixture issues

### After Full Setup (Valkey + Fixtures)

**Expected Results:**
- 14-15 PASSED / 1-2 FAILED (87-93%)

---

## Security Considerations

### Connection Security

**Render Valkey:**
- TLS by default ✅
- Password authentication ✅
- Private network option ✅
- IP whitelisting available ✅

**Environment Variables:**
- Never commit REDIS_URL to git
- Use .env files (gitignored)
- Rotate passwords periodically

### Data Sensitivity

**Stored in Redis:**
- Rate limit counters (non-sensitive)
- Cached API responses (public data)
- No user credentials
- No payment information

**Risk Level:** Low
**Encryption:** TLS in transit, not needed at rest

---

## Troubleshooting

### Connection Refused

**Error:** `ConnectionRefusedError: [Errno 61]`

**Solutions:**
1. Check REDIS_URL is set: `echo $REDIS_URL`
2. Verify Valkey instance is running on Render
3. Check region matches web service
4. Verify password is correct

### SSL Certificate Errors

**Error:** `ssl.SSLError: [SSL: CERTIFICATE_VERIFY_FAILED]`

**Solution:** Add SSL configuration:
```python
client = redis.from_url(
    redis_url,
    ssl_cert_reqs=None,
    decode_responses=True
)
```

### Rate Limit Not Working

**Error:** Rate limits not enforced

**Solutions:**
1. Check Redis connection successful
2. Verify SlowAPI initialized
3. Check rate limit keys generated correctly
4. Verify Redis INCR commands working

---

## Migration Plan

### Step 1: Create Valkey (5 minutes)

1. Render Dashboard → New Key-Value Store
2. Copy Redis URL
3. Add to environment variables

### Step 2: Update Environment (2 minutes)

```bash
# Render Dashboard
REDIS_URL=redis://:<password>@red-xxxxx.singapore-redis.render.com:6379

# Local .env
REDIS_URL=redis://:<password>@red-xxxxx.singapore-redis.render.com:6379
```

### Step 3: Verify Connection (5 minutes)

```bash
python3 test_valkey.py
```

### Step 4: Re-run Tests (10 minutes)

```bash
export REDIS_URL="..."
cd /Users/dennisgoslar/Projekter/kamiyo/website
python3 -m pytest tests/erc8004/test_e2e.py -v
```

### Step 5: Deploy (5 minutes)

Render will auto-deploy on next push with new env var

---

## Next Steps

**Immediate:**
1. Create Valkey instance on Render
2. Add REDIS_URL to environment
3. Run verification script

**Testing:**
4. Re-run test suite
5. Verify rate limiting works
6. Verify caching works

**Production:**
7. Monitor Redis memory usage
8. Set up alerts for connection failures
9. Review rate limits based on actual traffic

---

**Estimated Time:** 30 minutes total
**Cost:** $0/month (free tier sufficient)
**Grade Impact:** +5 to +8 points (B- → B)
