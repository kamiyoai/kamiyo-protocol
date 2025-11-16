# Subscription Management Integration Guide

## Quick Start

### 1. Update main.py

Add subscription routes and middleware to the main FastAPI application:

```python
# api/main.py
from fastapi import FastAPI
from api.subscriptions.middleware import SubscriptionEnforcementMiddleware
from api.subscriptions import routes as subscription_routes

app = FastAPI(
    title="Kamiyo Exploit Intelligence API",
    description="Real-time aggregation of cryptocurrency exploits",
    version="1.0.0"
)

# Add subscription enforcement middleware
app.add_middleware(SubscriptionEnforcementMiddleware)

# Include subscription routes
app.include_router(subscription_routes.router)

# ... rest of your existing routes
```

### 2. Run Database Migration

Execute the subscription tables migration:

```bash
# Using psql
psql -U kamiyo -d kamiyo_prod -f database/migrations/003_subscription_tables.sql

# Or using docker-compose
docker-compose exec postgres psql -U kamiyo -d kamiyo_prod -f /docker-entrypoint-initdb.d/003_subscription_tables.sql
```

### 3. Configure Environment

Add to your `.env.production`:

```bash
# Redis (should already exist from Day 2)
REDIS_URL=redis://:your_redis_password@redis:6379/0

# Stripe (from Day 6 - optional for now)
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Test Endpoints

```bash
# List all tiers (no auth required)
curl http://localhost:8000/api/v1/subscriptions/tiers

# Get current subscription (requires auth)
curl -H "X-API-Key: your_key" http://localhost:8000/api/v1/subscriptions/current

# Get usage stats
curl -H "X-API-Key: your_key" http://localhost:8000/api/v1/subscriptions/usage
```

## Advanced Usage

### Protecting Specific Endpoints

Use decorators to require specific tiers or features:

```python
from api.subscriptions.middleware import require_tier, require_feature

@app.get("/premium/analytics")
@require_tier("pro")
async def premium_analytics(request: Request):
    """Only Pro and Enterprise users can access"""
    return {"advanced": "analytics"}

@app.post("/webhooks/configure")
@require_feature("webhook_alerts")
async def configure_webhook(request: Request):
    """Only users with webhook feature can access"""
    return {"webhook": "configured"}
```

### Manual Rate Limit Checking

For custom logic, check rate limits manually:

```python
from api.subscriptions import get_usage_tracker, get_subscription_manager

@app.get("/custom-endpoint")
async def custom_endpoint(request: Request):
    user_id = request.state.user_id

    # Get user's tier
    manager = get_subscription_manager()
    tier = await manager.get_user_tier(user_id)

    # Check rate limit
    tracker = get_usage_tracker()
    result = tracker.check_rate_limit(user_id, tier)

    if not result['allowed']:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Resets at {result['reset_day']}"
        )

    # Track the call
    tracker.track_api_call(user_id, endpoint="/custom-endpoint")

    return {"data": "your response"}
```

### Checking Feature Access

Programmatically check if user has access to features:

```python
from api.subscriptions import get_subscription_manager

@app.get("/alerts/discord")
async def configure_discord_alert(request: Request):
    user_id = request.state.user_id
    manager = get_subscription_manager()

    has_discord = await manager.check_feature_access(user_id, "discord_alerts")

    if not has_discord:
        return {
            "error": "Discord alerts not available in your tier",
            "upgrade_url": "/api/v1/subscriptions/upgrade"
        }

    # Configure Discord alert
    return {"discord": "configured"}
```

## Monitoring

### Prometheus Metrics

The subscription system exports metrics compatible with your existing Prometheus setup:

```
# Subscription events
kamiyo_subscriptions_total{tier="pro",event="upgraded"} 5

# API key usage by tier
kamiyo_api_key_requests_total{tier="free"} 1500
kamiyo_api_key_requests_total{tier="pro"} 500
```

### Database Analytics

Query the analytics views:

```sql
-- Subscription breakdown
SELECT * FROM v_subscription_analytics;

-- Usage patterns
SELECT * FROM v_usage_analytics
WHERE day >= CURRENT_DATE - INTERVAL '7 days';

-- Revenue tracking
SELECT * FROM v_monthly_revenue
ORDER BY month DESC;
```

## Troubleshooting

### Redis Connection Issues

If Redis is unavailable:
- Rate limiting is disabled (all requests allowed)
- Warnings logged but service continues
- Usage stats will be empty

Check Redis connection:
```bash
redis-cli -h redis -a your_password ping
# Should return: PONG
```

### Rate Limits Not Enforcing

1. Check middleware is added:
   ```python
   app.add_middleware(SubscriptionEnforcementMiddleware)
   ```

2. Verify Redis is connected:
   ```python
   from api.subscriptions import get_usage_tracker
   tracker = get_usage_tracker()
   # Check logs for "Usage tracker connected to Redis"
   ```

3. Check user identification:
   - API key in `X-API-Key` header?
   - JWT token in `Authorization: Bearer ...`?
   - Falls back to IP address if not found

### Database Migration Errors

If migration fails:

```sql
-- Check if tables exist
\dt subscription_*

-- Drop and recreate if needed
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_tiers CASCADE;
-- Then re-run migration
```

### Tier Cache Not Updating

Invalidate cache when tier changes:

```python
from api.subscriptions import get_subscription_manager

manager = get_subscription_manager()
manager.invalidate_cache(user_id)
```

## Testing

### Unit Tests

```python
import pytest
from api.subscriptions.tiers import TierName, get_tier, is_upgrade

def test_tier_limits():
    free = get_tier(TierName.FREE)
    assert free.api_requests_per_day == 100

    pro = get_tier(TierName.PRO)
    assert pro.api_requests_per_day == 10000

def test_tier_comparison():
    assert is_upgrade(TierName.FREE, TierName.PRO) == True
    assert is_upgrade(TierName.PRO, TierName.FREE) == False
```

### Integration Tests

```python
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_list_tiers():
    response = client.get("/api/v1/subscriptions/tiers")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4

def test_rate_limiting():
    headers = {"X-API-Key": "test_key"}

    # Make requests up to limit
    for i in range(100):  # FREE tier limit
        response = client.get("/exploits", headers=headers)
        assert response.status_code == 200

    # 101st request should be rate limited
    response = client.get("/exploits", headers=headers)
    assert response.status_code == 429
```

## Migration from Existing System

If you have existing users, migrate them to the new subscription system:

```sql
-- Migrate existing users to FREE tier
INSERT INTO user_subscriptions (user_id, tier, status, current_period_start, current_period_end)
SELECT
    user_id,
    'free' as tier,
    'active' as status,
    CURRENT_TIMESTAMP as current_period_start,
    CURRENT_TIMESTAMP + INTERVAL '30 days' as current_period_end
FROM existing_users_table
ON CONFLICT (user_id) DO NOTHING;
```

## Performance Optimization

### Redis Connection Pooling

The usage tracker uses connection pooling by default. Adjust pool size if needed:

```python
# In usage_tracker.py initialization
redis_pool = redis.ConnectionPool.from_url(
    redis_url,
    max_connections=50,
    decode_responses=True
)
redis_client = redis.Redis(connection_pool=redis_pool)
```

### Database Indexes

Ensure indexes are created (should be automatic from migration):

```sql
-- Verify indexes
\di subscription_*

-- Create additional indexes if needed
CREATE INDEX idx_custom ON user_subscriptions(user_id, status)
WHERE status = 'active';
```

### Partition Maintenance

Clean up old usage history partitions monthly:

```sql
-- Run this as a cron job
SELECT cleanup_old_usage_history();
```

## Security Considerations

1. **API Key Storage**: Never log or expose API keys
2. **Rate Limit Headers**: Always include X-RateLimit-* headers
3. **SQL Injection**: All queries use parameterized statements
4. **Input Validation**: Tier names validated against enum
5. **HTTPS Only**: Enforce HTTPS in production

## Support

For issues or questions:
- Check logs: `docker-compose logs api`
- View metrics: `http://localhost:8000/metrics`
- Database queries: Use analytics views
- Redis CLI: `redis-cli -h redis -a password`
