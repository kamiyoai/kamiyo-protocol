# Kamiyo Cache Quick Start

Quick reference for using the Kamiyo caching system.

## Setup

```bash
# Install dependencies (already in requirements.txt)
pip install redis hiredis

# Start Redis
docker-compose up -d redis

# Or locally
redis-server
```

## Configuration

```bash
# .env file
REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=your_password
CACHE_L1_ENABLED=true
CACHE_WARMING_ENABLED=true
CACHE_MIDDLEWARE_ENABLED=true
```

## Basic Usage

### 1. Automatic Caching (Middleware)

All GET requests are automatically cached!

```python
# No code changes needed
# GET /exploits → cached for 5 minutes
# GET /stats → cached for 1 hour
```

### 2. Manual Caching

```python
from caching.cache_manager import get_cache_manager

cache = get_cache_manager()
await cache.connect()

# Set
await cache.set("key", {"data": "value"}, ttl=300)

# Get
data = await cache.get("key")

# Delete
await cache.delete("key")

# Pattern delete
await cache.delete_pattern("user:*")
```

### 3. Using Decorators

```python
from caching.cache_manager import cached, cache_invalidate

# Cache function result
@cached(ttl=300, key_prefix="exploit")
async def get_exploit(tx_hash: str):
    return db.get_exploit_by_tx_hash(tx_hash)

# Invalidate on update
@cache_invalidate(pattern="exploit:*")
async def update_exploit(tx_hash: str, data: dict):
    return db.update_exploit(tx_hash, data)
```

### 4. Cache Strategies

```python
from caching.strategies import CacheAsideStrategy

strategy = CacheAsideStrategy()

# Read with automatic caching
value = await strategy.read(
    key="exploit:0x123",
    fetch_fn=lambda: db.get_exploit("0x123"),
    ttl=300
)
```

### 5. Cache Invalidation

```python
from caching.invalidation import InvalidationEvent, get_invalidator

invalidator = get_invalidator()

# Event-driven
await invalidator.invalidate_by_event(
    InvalidationEvent.EXPLOIT_CREATED
)

# Manual
await invalidator.invalidate_by_pattern("exploits:*")
```

### 6. Cache Warming

```python
from caching.warming import get_warmer

warmer = get_warmer()

# Warm on startup (automatic in main.py)
await warmer.warm_statistics(db)
await warmer.warm_exploits_list(db)
```

## Monitoring

```bash
# Check cache stats
curl http://localhost:8000/metrics | grep kamiyo_cache

# Run analysis
./scripts/cache_analysis.sh

# Check Redis
redis-cli INFO | grep -E "(hits|misses)"
```

## Common Patterns

### Pattern 1: Cache Database Query

```python
@cached(ttl=300, key_prefix="stats")
async def get_statistics(days: int):
    return await db.get_stats_custom(days=days)
```

### Pattern 2: Invalidate on Write

```python
async def create_exploit(data: dict):
    exploit = await db.create_exploit(data)

    # Invalidate related caches
    await invalidator.invalidate_by_event(
        InvalidationEvent.EXPLOIT_CREATED,
        context={'chain': data['chain']}
    )

    return exploit
```

### Pattern 3: Warm Popular Data

```python
# On startup
await warmer.warm_popular_exploits(db, limit=100)

# Track access
warmer.track_access(f"exploit:{tx_hash}")
```

### Pattern 4: Conditional Caching

```python
async def get_data(key: str, use_cache: bool = True):
    if use_cache:
        data = await cache.get(key)
        if data:
            return data

    data = await db.fetch(key)

    if use_cache and data:
        await cache.set(key, data, ttl=300)

    return data
```

## TTL Guidelines

```python
# Real-time data
CACHE_TTL = 60  # 1 minute

# Frequently changing
CACHE_TTL = 300  # 5 minutes

# Moderate updates
CACHE_TTL = 1800  # 30 minutes

# Stable data
CACHE_TTL = 3600  # 1 hour

# Historical data
CACHE_TTL = 86400  # 24 hours
```

## Troubleshooting

### Low Hit Rate

```bash
# Check stats
redis-cli INFO stats

# Increase TTL
export CACHE_TTL_EXPLOITS_RECENT=600

# Enable warming
export CACHE_WARMING_ENABLED=true
```

### High Memory

```bash
# Set limit
redis-cli CONFIG SET maxmemory 2gb

# Enable eviction
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Stale Data

```python
# Manual invalidation
await cache.delete_pattern("exploits:*")

# Reduce TTL
CACHE_TTL_EXPLOITS_RECENT=60
```

## Testing

```bash
# Run tests
pytest tests/test_cache.py -v

# Run benchmarks
pytest tests/test_cache.py::test_performance_benchmark -s
```

## Full Documentation

See `/docs/CACHING_GUIDE.md` for comprehensive guide (914 lines).

## Key Files

- `caching/cache_manager.py` - Core caching (723 lines)
- `caching/strategies.py` - Caching patterns (633 lines)
- `caching/invalidation.py` - Cache invalidation (581 lines)
- `caching/warming.py` - Cache warming (516 lines)
- `config/cache_config.py` - Configuration (278 lines)
- `api/middleware/cache_middleware.py` - HTTP caching (457 lines)
- `monitoring/cache_metrics.py` - Metrics (494 lines)

---

**Quick Tip**: The middleware handles most caching automatically. For custom needs, use `@cached` decorator or strategies.
