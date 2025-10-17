# Redis Setup for Kamiyo (Optional)

## Current Status

✅ **Your API works without Redis!** The cache manager gracefully degrades to L1-only (in-memory) caching.

The errors you're seeing are now downgraded to warnings, and won't impact functionality.

## Redis Options for Render

Since Render no longer offers Redis as a standard service, you have 3 options:

### Option 1: Keep L1-Only Caching (Current - Recommended for MVP)

**Pros:**
- Zero additional cost
- No setup required
- Already working
- Sufficient for current traffic levels

**Cons:**
- Cache doesn't persist across deployments
- Each instance has its own cache (no sharing)
- Limited cache size (1000 items in L1)

**Action:** Nothing! You're good to go.

---

### Option 2: External Redis Provider (Best for Production)

Use a dedicated Redis provider and connect via `REDIS_URL`:

**Popular Providers:**
1. **Upstash** (Recommended)
   - Free tier: 10,000 requests/day
   - Serverless pricing: $0.20 per 100K requests
   - Global replication available
   - Setup: https://upstash.com

2. **Redis Cloud** (formerly Redis Labs)
   - Free tier: 30MB storage
   - Pay-as-you-go after
   - Setup: https://redis.com/try-free

3. **Railway**
   - $5/month for 512MB Redis
   - Simple integration
   - Setup: https://railway.app

**Setup Steps:**
1. Create Redis instance at your chosen provider
2. Get the connection URL (format: `redis://username:password@host:port`)
3. In Render dashboard, go to your `kamiyo-api` service
4. Add environment variable:
   - Key: `REDIS_URL`
   - Value: `redis://...` (from your provider)
5. Redeploy

---

### Option 3: Self-Hosted Redis on Render

Create a Redis container using Render's Docker support:

**Setup:**
1. Add to `render.yaml`:
```yaml
services:
  - type: web
    name: kamiyo-redis
    runtime: docker
    dockerfilePath: ./Dockerfile.redis
    dockerContext: ./deploy/redis
    plan: starter
```

2. Create `Dockerfile.redis`:
```dockerfile
FROM redis:7-alpine
COPY redis.conf /usr/local/etc/redis/redis.conf
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
```

3. Update `REDIS_URL` in kamiyo-api:
```yaml
- key: REDIS_URL
  fromService:
    type: web
    name: kamiyo-redis
    envVarKey: REDIS_URL
```

**Cons:**
- More complex setup
- You manage Redis maintenance
- Costs $7/month for Starter plan

---

## Recommendation

**For Now (MVP/Testing):**
- ✅ Keep L1-only caching (current setup)
- Traffic is low, cache hit rates are good enough

**When to Add Redis:**
- You're getting 1000+ requests/minute
- You need cache persistence across deployments
- You're running multiple API instances
- You want to cache larger datasets

**Best Option When You Scale:**
- Use **Upstash** (easiest, serverless, free tier generous)
- Just set the `REDIS_URL` env var in Render

---

## Monitoring

Check your cache performance:
```bash
curl https://api.kamiyo.ai/health
```

Look for cache stats in logs. L1 cache is working fine for your current traffic!
