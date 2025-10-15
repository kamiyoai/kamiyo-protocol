# Redis Setup Guide for Render.com

## Overview

Redis is already integrated into the KAMIYO codebase and will automatically activate once you configure the `REDIS_URL` environment variable. This guide walks you through setting up Redis on Render.com.

**Time Required:** 10 minutes
**Complexity:** Simple (point-and-click in Render Dashboard)

---

## What Redis Provides

### Current (Without Redis)
- ✅ In-memory rate limiting (works for single instance)
- ⚠️ Rate limits reset when service restarts
- ⚠️ If you scale to multiple instances, each tracks limits independently

### With Redis (Recommended for Production)
- ✅ Distributed rate limiting across all instances
- ✅ Rate limits persist through restarts
- ✅ Shared state for multi-instance deployments
- ✅ Better performance under load
- ✅ Production-grade reliability

---

## Step 1: Create Redis Instance in Render

### 1.1 Access Render Dashboard
1. Go to https://dashboard.render.com
2. Click **"New +"** button in top right
3. Select **"Redis"**

### 1.2 Configure Redis Instance
**Settings:**
- **Name:** `kamiyo-redis`
- **Region:** Same as your kamiyo-api service (for low latency)
- **Plan:** Choose based on your needs:
  - **Free:** $0/month - 25 MB storage, good for testing
  - **Starter:** $10/month - 256 MB storage, recommended for production
  - **Standard:** $50/month - 1 GB storage, for high traffic

**Recommendation:** Start with **Starter ($10/month)** for production

### 1.3 Create Redis
1. Click **"Create Redis"**
2. Wait ~2 minutes for provisioning
3. Redis will show as "Available" when ready

---

## Step 2: Get Redis Connection URL

### 2.1 Copy Internal Redis URL
1. In Render Dashboard, click on your **kamiyo-redis** instance
2. Find the **"Connections"** section
3. Copy the **"Internal Redis URL"**
   - Format: `redis://red-xxxxxxxxxxxxx:6379`
   - This URL only works within Render's network (perfect for security)

**Example:**
```
redis://red-abc123def456ghi789:6379
```

---

## Step 3: Configure Environment Variable

### 3.1 Add REDIS_URL to kamiyo-api
1. Go to Render Dashboard → **kamiyo-api** service
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Add the following:
   - **Key:** `REDIS_URL`
   - **Value:** (paste the Internal Redis URL from Step 2.1)
5. Click **"Save Changes"**

### 3.2 Automatic Deployment
- Render will automatically redeploy kamiyo-api with Redis enabled
- Wait ~3-5 minutes for deployment to complete

---

## Step 4: Verify Redis is Active

### 4.1 Check Logs
1. Go to Render Dashboard → **kamiyo-api** → **"Logs"** tab
2. Look for this message in startup logs:
   ```
   INFO - Rate limiter using Redis backend
   INFO - Rate limiting middleware enabled (Redis: True)
   ```

**If you see this, Redis is working!** ✅

### 4.2 Test Rate Limiting
```bash
# Make multiple requests to test rate limiting
for i in {1..15}; do
  curl -I https://api.kamiyo.ai/exploits?page=1&page_size=10
  sleep 1
done

# You should see HTTP 429 after hitting the limit
# Retry-After header will be present
```

### 4.3 Check Redis Health
1. In Render Dashboard → **kamiyo-redis**
2. Check **"Metrics"** tab:
   - **Memory Usage:** Should show activity
   - **Connected Clients:** Should show 1+ connections
   - **Commands Processed:** Should increase with API traffic

---

## How It Works (Technical Details)

### Code Integration (Already Done)
The following code in `api/main.py` automatically detects and uses Redis:

```python
# Lines 160-167 in api/main.py
use_redis_rate_limit = is_production and os.getenv("REDIS_URL")
app.add_middleware(
    RateLimitMiddleware,
    use_redis=use_redis_rate_limit,
    redis_url=os.getenv("REDIS_URL")
)
logger.info(f"Rate limiting middleware enabled (Redis: {use_redis_rate_limit})")
```

### Fallback Behavior
- If Redis is unavailable or misconfigured, the system automatically falls back to in-memory rate limiting
- No downtime or errors - graceful degradation
- You'll see this log message: `Redis unavailable, falling back to in-memory`

### Redis Key Structure
```
ratelimit:{user_key}:{window}
  - tokens: float (remaining tokens)
  - last_refill: timestamp (last token refill time)
  - TTL: 2x window period (auto-cleanup)
```

**Examples:**
- `ratelimit:user:123:minute` - User 123's minute window
- `ratelimit:ip:192.168.1.1:hour` - IP address hour window

---

## Troubleshooting

### Issue: "Redis unavailable, falling back to in-memory"

**Symptoms:**
- Logs show fallback message
- Rate limits reset on restart

**Solutions:**
1. **Verify REDIS_URL is set:**
   ```bash
   # Check in Render Dashboard → kamiyo-api → Environment
   # REDIS_URL should be visible
   ```

2. **Verify Redis is running:**
   - Go to Render Dashboard → kamiyo-redis
   - Status should be "Available" (green)

3. **Check Redis URL format:**
   - Should start with `redis://`
   - Should be the **Internal Redis URL**, not External

4. **Restart kamiyo-api:**
   - Render Dashboard → kamiyo-api → Manual Deploy → "Clear build cache & deploy"

### Issue: Connection timeout errors

**Symptoms:**
- Logs show: `socket_connect_timeout` or `socket_timeout`

**Solutions:**
1. **Ensure Redis and API are in same region:**
   - Render Dashboard → Check both services' regions
   - Should match for low latency

2. **Check firewall/network settings:**
   - Internal Redis URL should work automatically within Render
   - No additional configuration needed

### Issue: High memory usage in Redis

**Symptoms:**
- Redis Metrics show >80% memory usage
- Rate limiting becomes slow

**Solutions:**
1. **Upgrade Redis plan:**
   - Render Dashboard → kamiyo-redis → Settings
   - Change to higher tier (256 MB → 1 GB)

2. **Check for memory leaks:**
   - Redis keys should have TTL (2x window period)
   - Run: `redis-cli --scan --pattern "ratelimit:*" | wc -l`
   - Should see reasonable number of keys

---

## Cost Analysis

### Option 1: No Redis (Current)
- **Cost:** $0/month
- **Pros:** Free, works for single instance
- **Cons:** Rate limits reset on restart, no distributed limiting

### Option 2: Free Redis
- **Cost:** $0/month
- **Storage:** 25 MB
- **Connections:** 20
- **Good for:** Testing, low-traffic staging environments
- **Limitations:** May run out of memory with high traffic

### Option 3: Starter Redis (Recommended)
- **Cost:** $10/month
- **Storage:** 256 MB
- **Connections:** 30
- **Good for:** Production deployments with moderate traffic
- **Handles:** ~10,000 users with active rate limits

### Option 4: Standard Redis
- **Cost:** $50/month
- **Storage:** 1 GB
- **Connections:** Unlimited
- **Good for:** High-traffic production, multiple services

---

## Performance Impact

### Before Redis (In-Memory)
- **Latency:** ~0.1ms (local memory)
- **Throughput:** High (no network calls)
- **Limitation:** Single instance only

### After Redis
- **Latency:** ~1-2ms (internal network)
- **Throughput:** Still high (Redis is fast)
- **Benefit:** Works across all instances

### Overhead
- **Per request:** +1-2ms latency (negligible)
- **Memory:** Moved from API to Redis (better isolation)
- **Network:** Internal Render network (very fast)

**Verdict:** Performance impact is minimal, benefits are significant

---

## Monitoring Redis

### Key Metrics to Watch

1. **Memory Usage**
   - Location: Render Dashboard → kamiyo-redis → Metrics
   - Healthy: <70%
   - Warning: 70-90%
   - Critical: >90% (upgrade needed)

2. **Connected Clients**
   - Should match number of kamiyo-api instances
   - If you have 1 web service: expect 1-2 connections
   - If scaled to 3 instances: expect 3-6 connections

3. **Commands per Second**
   - Correlates with API traffic
   - Spikes during high load periods
   - Use to validate Redis is being used

4. **Hit Rate** (if available)
   - Not critical for rate limiting use case
   - Rate limiting doesn't use cache hits/misses

### Redis CLI Access (Advanced)

**Not available by default in Render's Redis.**

If you need direct access for debugging:
1. Use Render's "Shell" feature (Enterprise plans only)
2. Or use a Redis GUI like RedisInsight with External Redis URL (less secure)

For most cases, log monitoring is sufficient.

---

## Next Steps After Setup

### Immediate (0-1 hour)
1. ✅ Verify Redis is active (check logs)
2. ✅ Test rate limiting works correctly
3. ✅ Monitor memory usage for first hour

### First Week
- Monitor Redis metrics daily
- Verify rate limits are persistent across restarts
- Check for any connection errors in logs

### Ongoing
- Monthly review of Redis memory usage
- Upgrade plan if approaching 70% memory
- Consider adding Redis for other features:
  - API response caching
  - WebSocket session management
  - Idempotency key storage

---

## Optional: Redis for Additional Features

The current setup uses Redis only for rate limiting. You can extend it for:

### 1. API Response Caching
```python
# Cache frequently accessed exploit data
@cache(ttl=300)  # 5 minutes
def get_exploits(page: int, page_size: int):
    # Expensive database query
    pass
```

### 2. WebSocket Session State
```python
# Store active WebSocket connections
redis.sadd(f"ws:connections:{user_id}", connection_id)
```

### 3. Idempotency Keys
```python
# Prevent duplicate payment processing
redis.setex(f"idempotency:{key}", 86400, result)
```

**Note:** These are future enhancements - not required for launch

---

## Summary Checklist

After completing this guide, verify:

- [ ] Redis instance created in Render (kamiyo-redis)
- [ ] REDIS_URL environment variable set in kamiyo-api
- [ ] kamiyo-api redeployed successfully
- [ ] Logs show: "Rate limiter using Redis backend"
- [ ] Logs show: "Rate limiting middleware enabled (Redis: True)"
- [ ] Redis metrics show connected clients (1+)
- [ ] Rate limiting works correctly (test with curl)
- [ ] No connection errors in logs

---

## Support

### If You Need Help

**Render Support:**
- Email: support@render.com
- Docs: https://render.com/docs/redis

**Internal Documentation:**
- Rate Limiter Code: `api/middleware/rate_limiter.py`
- Main Config: `api/main.py` (lines 160-167)

### Common Questions

**Q: Do I need Redis for launch?**
A: No, but highly recommended. The system works without Redis, but rate limits will be less reliable.

**Q: Can I use external Redis (Upstash, AWS ElastiCache)?**
A: Yes! Just use their connection URL as REDIS_URL. Make sure it's accessible from Render's network.

**Q: What if Redis goes down?**
A: The system automatically falls back to in-memory rate limiting. No downtime, just less robust limiting.

**Q: How do I monitor Redis costs?**
A: Render Dashboard → Billing shows Redis costs separately. Upgrade/downgrade anytime.

---

**Document Version:** 1.0
**Last Updated:** October 14, 2025
**Status:** Ready for Production Setup

---

**Next:** After Redis is configured, your platform will have production-grade distributed rate limiting! 🚀
