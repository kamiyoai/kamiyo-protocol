# x402 Infrastructure Production Setup

This guide covers the critical setup steps for deploying x402 Infrastructure SaaS to production.

## Environment Variables

Add these to your production environment (.env.production or hosting platform):

### Core Infrastructure
```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/kamiyo_production"

# NextAuth
NEXTAUTH_SECRET="[Generate with: openssl rand -base64 32]"
NEXTAUTH_URL="https://kamiyo.ai"

# Stripe (Billing)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Monitoring
SENTRY_DSN="https://...@sentry.io/..."
NODE_ENV="production"

# Rate Limiting (Optional but Recommended)
REDIS_URL="redis://localhost:6379"
# Or for cloud Redis:
# REDIS_URL="rediss://user:password@host:6379"

# Python Verifier (Optional - for HTTP API mode)
PYTHON_VERIFIER_URL="http://localhost:8000"
```

## Deployment Steps

### 1. Database Setup

```bash
# Run migrations
npx prisma migrate deploy

# Verify connection
npx prisma db push
```

### 2. Stripe Setup

1. Create products in Stripe Dashboard:
   - **Starter**: $99/month
   - **Pro**: $299/month
   - **Enterprise**: $999/month

2. Configure webhook endpoint:
   - URL: `https://kamiyo.ai/api/v1/x402/webhooks/stripe`
   - Events: `customer.subscription.*`, `invoice.*`
   - Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

3. Test in Stripe test mode first:
   ```bash
   STRIPE_SECRET_KEY="sk_test_..." npm run dev
   ```

### 3. Sentry Setup (Error Tracking)

1. Create project at https://sentry.io
2. Copy DSN to `SENTRY_DSN` environment variable
3. Errors will automatically be tracked in production

### 4. Redis Setup (Rate Limiting)

**Option A: Local Redis (Development/Staging)**
```bash
# Install Redis
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu

# Start Redis
redis-server

# Set environment variable
REDIS_URL="redis://localhost:6379"
```

**Option B: Cloud Redis (Production)**

Use a managed Redis service:
- **Redis Cloud**: https://redis.com/try-free/
- **AWS ElastiCache**: https://aws.amazon.com/elasticache/
- **Render Redis**: https://render.com/docs/redis

Set `REDIS_URL` to your Redis connection string.

**Note:** If Redis is not available, the system automatically falls back to in-memory rate limiting (not recommended for production).

### 5. Python Verifier Setup (Optional)

The x402 payment verifier can run in two modes:

**Mode 1: Direct Execution (Default)**
- Node.js spawns Python processes as needed
- No additional setup required
- Slower (~500ms per verification)

**Mode 2: HTTP API (Recommended for Production)**
- Python FastAPI service running separately
- Faster (~50-200ms per verification)
- Better resource management

To use HTTP API mode:

```bash
# Start Python verifier API
cd api
uvicorn x402_saas.verifier_api:app --host 0.0.0.0 --port 8000

# Set environment variable
PYTHON_VERIFIER_URL="http://localhost:8000"
```

For production deployment, run the Python API as a separate service (systemd, Docker, etc.).

### 6. Build and Deploy

```bash
# Install dependencies
npm install

# Build Next.js app
npm run build

# Start production server
npm start
```

Or deploy to hosting platform (Render, Vercel, etc.) - they handle build/start automatically.

## Health Check

Verify all systems are operational:

```bash
curl https://kamiyo.ai/api/v1/x402/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-08T...",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 12
    },
    "verifier": {
      "status": "healthy",
      "mode": "http_api",
      "endpoint": "http://localhost:8000"
    }
  },
  "recentErrors": 0
}
```

## Monitoring

### Sentry Dashboard
- View errors: https://sentry.io
- Set up alerts for high error rates
- Monitor performance metrics

### Rate Limiting Status
- In-memory: Check Node.js memory usage
- Redis: Monitor Redis CPU and memory
- Health check shows rate limiter backend

### Database Performance
- Monitor query latency in health check
- Set up PostgreSQL monitoring (pg_stat_statements)
- Watch for slow queries

## Security Checklist

- [ ] All environment variables set
- [ ] Stripe webhooks configured with signing secret
- [ ] Sentry DSN configured
- [ ] Database uses SSL connection
- [ ] Redis uses password authentication (if cloud)
- [ ] API keys hashed with SHA256 (automatic)
- [ ] Rate limiting enabled
- [ ] HTTPS enabled (handled by hosting platform)

## Troubleshooting

### Issue: Rate limiting not working
**Solution:** Check if `REDIS_URL` is set. If not, system uses in-memory (not suitable for multi-instance deployments).

### Issue: Payment verifications slow
**Solution:** Deploy Python verifier as HTTP API service and set `PYTHON_VERIFIER_URL`.

### Issue: Stripe webhooks failing
**Solution:** Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard. Check webhook endpoint is publicly accessible.

### Issue: Database connection errors
**Solution:** Verify `DATABASE_URL` is correct. Check PostgreSQL allows connections from your server IP.

### Issue: No error tracking in Sentry
**Solution:** Verify `SENTRY_DSN` is set and `NODE_ENV=production`. Errors are only tracked in production mode.

## Scaling Considerations

### Horizontal Scaling (Multiple Instances)
- **REQUIRED**: Use Redis for rate limiting (not in-memory)
- **REQUIRED**: Use shared PostgreSQL database
- **RECOMMENDED**: Deploy Python verifier as separate service

### Redis Scaling
- Start with single Redis instance
- Upgrade to Redis Cluster for >10K tenants
- Monitor memory usage (rate limit data is temporary)

### Database Scaling
- Add read replicas for high read traffic
- Implement connection pooling (Prisma handles this)
- Monitor slow queries with indexes

## Cost Estimates

**Monthly Infrastructure Costs:**
- Render (2 instances): $25-50
- PostgreSQL (Render): $7-25
- Redis Cloud (free tier): $0
- Stripe: 2.9% + $0.30 per transaction
- Sentry (free tier): $0

**Total: ~$50-100/month** (before revenue)

**Break-even:** 1 Starter customer ($99/mo)

## Next Steps

After production deployment:

1. **Week 1: Monitoring**
   - Watch Sentry for errors
   - Monitor API latency
   - Check rate limit effectiveness

2. **Week 2: Soft Launch**
   - Invite 10 beta users
   - Collect feedback
   - Fix critical bugs

3. **Week 3: Public Launch**
   - Marketing push
   - Community outreach
   - Monitor scaling

## Support

For production issues:
- Check health endpoint: `/api/v1/x402/health`
- View Sentry dashboard for errors
- Monitor Redis/PostgreSQL logs
- Check rate limiter status

Questions? dev@kamiyo.ai
