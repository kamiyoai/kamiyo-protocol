# Render Valkey Setup - Step-by-Step Instructions

**Time Required:** 30 minutes
**Cost:** $0/month (free tier)

---

## Step 1: Create Valkey Instance (10 minutes)

### Option A: Via Render Dashboard (Recommended)

1. **Go to Render Dashboard**
   - Navigate to: https://dashboard.render.com
   - Log in with your credentials

2. **Create New Key-Value Store**
   - Click "New +" button (top right)
   - Select "Key-Value Store" (Valkey/Redis)

3. **Configure Instance**
   ```
   Name: kamiyo-erc8004-cache
   Region: Singapore (ap-southeast-1)
   Plan: Free (25MB)
   Eviction Policy: allkeys-lru
   ```

4. **Create**
   - Click "Create Key-Value Store"
   - Wait 1-2 minutes for provisioning

5. **Copy Connection URL**
   - Once created, you'll see "Internal Redis URL"
   - Format: `redis://red-xxxxxxxxxxxxx:6379`
   - Or "External Redis URL": `redis://red-xxxxx.singapore-redis.render.com:6379`
   - **Save this URL** - you'll need it

### Option B: Via Render CLI (Alternative)

```bash
# Install Render CLI
brew install render

# Login
render login

# Create Valkey instance
render create redis \
  --name kamiyo-erc8004-cache \
  --plan free \
  --region singapore \
  --eviction-policy allkeys-lru
```

---

## Step 2: Get Full Connection URL (2 minutes)

### Find Redis Password

1. In Render Dashboard → Key-Value Store → kamiyo-erc8004-cache
2. Look for "Connection" section
3. Copy the full URL including password

**Format:**
```
redis://:<PASSWORD>@red-xxxxxxxxxxxxx.singapore-redis.render.com:6379
```

**Example:**
```
redis://:abc123xyz789@red-cqrs4tun6mpd73abc123.singapore-redis.render.com:6379
```

---

## Step 3: Add to Render Environment (5 minutes)

### For Your Web Service

1. **Go to Web Service**
   - Render Dashboard → Services
   - Select your web service (e.g., "kamiyo-api")

2. **Add Environment Variable**
   - Go to "Environment" tab
   - Click "Add Environment Variable"
   - Key: `REDIS_URL`
   - Value: `redis://:<password>@red-xxxxx.singapore-redis.render.com:6379`
   - Click "Save Changes"

3. **Trigger Redeploy**
   - Service will automatically redeploy with new env var
   - Wait 2-3 minutes for deployment

---

## Step 4: Add to Local Environment (2 minutes)

### Update .env file

```bash
# Edit .env
nano /Users/dennisgoslar/Projekter/kamiyo/website/.env
```

**Add this line:**
```bash
REDIS_URL="redis://:<password>@red-xxxxx.singapore-redis.render.com:6379"
```

**Save:** Ctrl+X, then Y, then Enter

---

## Step 5: Verify Connection (5 minutes)

### Test Script

Create test file:
```bash
cat > /Users/dennisgoslar/Projekter/kamiyo/test_valkey_connection.py << 'EOF'
import asyncio
import redis.asyncio as redis
import os

async def test_valkey():
    # Load from environment
    redis_url = os.getenv('REDIS_URL')

    if not redis_url:
        print("❌ REDIS_URL not set in environment")
        return

    print(f"Connecting to: {redis_url[:30]}...")

    try:
        # Connect
        client = redis.from_url(redis_url, decode_responses=True)

        # Test PING
        pong = await client.ping()
        print(f"✅ PING successful: {pong}")

        # Test SET/GET
        await client.set('test:connection', 'working', ex=60)
        value = await client.get('test:connection')
        print(f"✅ SET/GET successful: {value}")

        # Test INCR (for rate limiting)
        count = await client.incr('test:counter')
        print(f"✅ INCR successful: {count}")

        # Test TTL
        ttl = await client.ttl('test:connection')
        print(f"✅ TTL check successful: {ttl} seconds")

        # Cleanup
        await client.delete('test:connection', 'test:counter')
        await client.close()

        print("\n✅ Valkey connection fully working!")
        return True

    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test_valkey())
EOF
```

### Run Test

```bash
cd /Users/dennisgoslar/Projekter/kamiyo/website
export REDIS_URL="redis://:<password>@red-xxxxx.singapore-redis.render.com:6379"
python3 test_valkey_connection.py
```

**Expected Output:**
```
Connecting to: redis://:***@red-xxxxx...
✅ PING successful: True
✅ SET/GET successful: working
✅ INCR successful: 1
✅ TTL check successful: 59 seconds

✅ Valkey connection fully working!
```

---

## Step 6: Re-run Tests (10 minutes)

### With Database and Valkey

```bash
cd /Users/dennisgoslar/Projekter/kamiyo/website

# Set environment variables
export DATABASE_URL="postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai?sslmode=require"
export REDIS_URL="redis://:<password>@red-xxxxx.singapore-redis.render.com:6379"

# Run tests
python3 -m pytest tests/erc8004/test_e2e.py -v --tb=short
```

**Expected Results:**
- Previous: 2 PASSED / 14 FAILED (12.5%)
- With Database: ~8-10 PASSED / 6-8 FAILED (50-62%)
- With Valkey: ~12-14 PASSED / 2-4 FAILED (75-87%)

---

## Troubleshooting

### Connection Refused

**Error:** `ConnectionRefusedError: [Errno 61]`

**Solutions:**
1. Verify REDIS_URL is exported: `echo $REDIS_URL`
2. Check Valkey instance is running in Render dashboard
3. Verify region matches (should be Singapore)
4. Check firewall/network settings

### SSL Certificate Errors

**Error:** `ssl.SSLError: [SSL: CERTIFICATE_VERIFY_FAILED]`

**Solution:** Render Valkey uses TLS by default, should work. If issues, update code:
```python
client = redis.from_url(
    redis_url,
    ssl_cert_reqs=None,
    decode_responses=True
)
```

### Authentication Failed

**Error:** `WRONGPASS invalid username-password pair`

**Solutions:**
1. Verify password in REDIS_URL is correct
2. Copy URL again from Render dashboard
3. Check for special characters that need escaping

### Import Errors

**Error:** `ModuleNotFoundError: No module named 'redis'`

**Solution:**
```bash
pip install redis[asyncio]
```

---

## What You'll Get

### After Valkey Setup

**Working Features:**
- ✅ Rate limiting on all endpoints
- ✅ Response caching (5 min TTL)
- ✅ Session storage capability
- ✅ Distributed counters

**Test Improvements:**
- ✅ Rate limit tests pass
- ✅ Caching tests pass
- ✅ Integration tests work
- ✅ Overall pass rate: 75-87%

**Grade Impact:**
- Previous: B- (78/100)
- After Valkey: B (82-84/100)

---

## Quick Reference

### Connection URL Format

```
redis://:<password>@<host>:<port>
```

### Common Commands

**Test connection:**
```bash
redis-cli -u "redis://:<password>@red-xxxxx.singapore-redis.render.com:6379" PING
```

**Check memory usage:**
```bash
redis-cli -u "redis://:<password>@red-xxxxx.singapore-redis.render.com:6379" INFO memory
```

**Monitor commands:**
```bash
redis-cli -u "redis://:<password>@red-xxxxx.singapore-redis.render.com:6379" MONITOR
```

---

## Checklist

### Creation
- [ ] Logged into Render Dashboard
- [ ] Created Key-Value Store
- [ ] Named: kamiyo-erc8004-cache
- [ ] Region: Singapore
- [ ] Plan: Free (25MB)
- [ ] Eviction: allkeys-lru

### Configuration
- [ ] Copied full Redis URL with password
- [ ] Added REDIS_URL to web service environment
- [ ] Added REDIS_URL to local .env
- [ ] Triggered redeploy on Render

### Verification
- [ ] Ran test_valkey_connection.py
- [ ] PING successful
- [ ] SET/GET working
- [ ] INCR working
- [ ] Connection confirmed

### Testing
- [ ] Exported DATABASE_URL
- [ ] Exported REDIS_URL
- [ ] Ran pytest test suite
- [ ] Documented results
- [ ] Achieved 75%+ pass rate

---

**Estimated Time:** 30 minutes
**Difficulty:** Easy
**Impact:** High (+5 to +8 grade points)
**Cost:** $0/month
