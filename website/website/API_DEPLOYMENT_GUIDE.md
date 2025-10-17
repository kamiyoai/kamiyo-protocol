# API Deployment Guide - Get https://api.kamiyo.ai Working

## Problem
`https://api.kamiyo.ai/exploits` is not working because the API isn't deployed yet.

## Solution Overview
You have two options:

### Option 1: Deploy API to Render (RECOMMENDED - 10 minutes)
Deploy your existing FastAPI backend to Render using the config you already have.

### Option 2: Use Mock API for Testing (5 minutes)
Temporarily point the social engine at a mock API while you set up the real one.

---

## OPTION 1: Deploy Real API to Render (RECOMMENDED)

### Prerequisites
- Render account
- GitHub repository connected to Render
- Code already in `~/project/Projekter/kamiyo`

### Step 1: Check if API is Already Deployed

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Look for service named:** `kamiyo-api`
3. **Check status:**
   - ✅ If it exists and says "Live" → Go to Step 4 (just fix the domain)
   - ❌ If it doesn't exist → Continue to Step 2

### Step 2: Deploy the API (if not already deployed)

#### 2A: Using Blueprint (Easiest)

You already have `render.yaml` configured. Deploy it:

```bash
cd ~/project/Projekter/kamiyo
git add render.yaml api/ database/ intelligence/
git commit -m "Add API deployment configuration"
git push
```

Then in Render dashboard:
1. Click "New" → "Blueprint"
2. Connect your GitHub repo
3. Select branch: `main`
4. Render will auto-detect `render.yaml`
5. Click "Apply"

#### 2B: Manual Deployment (Alternative)

If blueprint doesn't work:

1. **Render Dashboard** → "New" → "Web Service"
2. **Connect GitHub repo:** `kamiyo`
3. **Configuration:**
   ```
   Name: kamiyo-api
   Runtime: Python 3
   Branch: main
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn api.main:app --host 0.0.0.0 --port $PORT
   ```

4. **Environment Variables (click "Add Environment Variable"):**
   ```
   ENVIRONMENT=production
   PYTHON_VERSION=3.11
   DATABASE_URL=(will be auto-added from database)
   ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai
   ```

5. **Health Check:**
   ```
   Path: /health
   ```

6. Click "Create Web Service"

### Step 3: Add PostgreSQL Database

If you don't have `kamiyo-postgres` database yet:

1. **Render Dashboard** → "New" → "PostgreSQL"
2. **Configuration:**
   ```
   Name: kamiyo-postgres
   Database: kamiyo
   User: kamiyo
   Plan: Starter (Free)
   ```
3. Click "Create Database"
4. **Link to API service:**
   - Go to your `kamiyo-api` service
   - Environment Variables
   - Add: `DATABASE_URL` → Select database `kamiyo-postgres`

### Step 4: Configure Custom Domain

1. **In Render Dashboard** → Your `kamiyo-api` service
2. **Settings** → "Custom Domain"
3. **Add custom domain:** `api.kamiyo.ai`
4. **Render will show DNS records** you need to add:
   ```
   Type: CNAME
   Name: api
   Value: kamiyo-api.onrender.com (or whatever Render gives you)
   ```

5. **Add DNS record in your domain registrar:**
   - Go to your domain provider (GoDaddy, Namecheap, Cloudflare, etc.)
   - Add the CNAME record Render provided
   - Wait 5-15 minutes for DNS propagation

### Step 5: Verify Deployment

Test the API endpoints:

```bash
# Health check
curl https://api.kamiyo.ai/health

# Should return something like:
# {"status":"healthy","database_exploits":0,"tracked_chains":0,...}

# Exploits endpoint
curl https://api.kamiyo.ai/exploits?page=1&page_size=10

# Should return:
# {"data":[],"total":0,"page":1,"page_size":10,"has_more":false}
```

### Step 6: Populate Database with Sample Data

Your database is empty! Add some exploit data:

```bash
cd ~/project/Projekter/kamiyo

# Run aggregators to fetch real exploit data
python intelligence/aggregators/rekt_news.py
python intelligence/aggregators/peckshield.py

# Or add sample data manually
python -c "
from database import get_db
from datetime import datetime

db = get_db()
# Add sample exploit
db.add_exploit(
    tx_hash='0xabcd1234sample',
    protocol='SampleProtocol',
    chain='Ethereum',
    loss_amount_usd=1000000,
    exploit_type='Reentrancy',
    timestamp=datetime.now(),
    description='Sample exploit for testing',
    source='Manual'
)
print('Sample exploit added!')
"
```

---

## OPTION 2: Temporary Mock API (For Testing)

If you want to test the social media engine before deploying the real API:

### Step 1: Create Mock API Service

```bash
cd ~/project/Projekter/kamiyo
```

Create `mock_api_server.py`:

```python
#!/usr/bin/env python3
"""
Temporary mock API server for testing social media engine
Run this locally to test the autonomous growth engine
"""
from fastapi import FastAPI, Query
from datetime import datetime, timedelta
import uvicorn

app = FastAPI()

# Sample exploit data
SAMPLE_EXPLOITS = [
    {
        "tx_hash": "0xabcd1234567890",
        "protocol": "Abracadabra",
        "chain": "Ethereum",
        "loss_amount_usd": 1700000,
        "exploit_type": "Smart Contract Logic Flaw",
        "timestamp": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z",
        "description": "DeFi lending platform exploited via flawed cook function",
        "recovery_status": "Contracts paused, investigation ongoing",
        "source": "BeInCrypto",
        "source_url": "https://beincrypto.com/defi-platform-abracadabra-hit-by-major-exploit/"
    },
    {
        "tx_hash": "0xdef456789abcdef",
        "protocol": "CurveDEX",
        "chain": "Ethereum",
        "loss_amount_usd": 500000,
        "exploit_type": "Price Oracle Manipulation",
        "timestamp": (datetime.utcnow() - timedelta(hours=5)).isoformat() + "Z",
        "description": "Attacker manipulated price oracle to drain liquidity pool",
        "recovery_status": "Under investigation",
        "source": "PeckShield",
        "source_url": "https://twitter.com/peckshield"
    }
]

@app.get("/")
def root():
    return {"status": "Mock Kamiyo API", "version": "test"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "database_exploits": len(SAMPLE_EXPLOITS),
        "tracked_chains": 1,
        "active_sources": 2,
        "total_sources": 2
    }

@app.get("/exploits")
def get_exploits(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    min_amount: float = Query(None, ge=0)
):
    """Return sample exploits"""
    exploits = SAMPLE_EXPLOITS.copy()

    # Filter by min_amount if specified
    if min_amount:
        exploits = [e for e in exploits if e['loss_amount_usd'] >= min_amount]

    return {
        "data": exploits,
        "total": len(exploits),
        "page": page,
        "page_size": page_size,
        "has_more": False
    }

if __name__ == "__main__":
    print("🚀 Starting Mock Kamiyo API on http://localhost:8000")
    print("📊 Serving 2 sample exploits")
    print("🔗 Test: http://localhost:8000/exploits")
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Step 2: Run Mock API

```bash
python mock_api_server.py
```

### Step 3: Configure Social Engine to Use Mock

Edit `.env` or set environment variable:

```bash
export KAMIYO_API_URL=http://localhost:8000
```

### Step 4: Test Social Engine

```bash
cd social
python autonomous_growth_engine.py --mode poll
```

You should see:
```
🔄 Polling Kamiyo API for new exploits...
✅ Found 2 exploits
📝 Generating analysis for: Abracadabra ($1.7M)
🐦 Posting to Twitter...
✅ Posted successfully!
```

---

## Quick Troubleshooting

### "Connection refused" or "Connection failed"

**Problem:** API not running or wrong URL

**Solutions:**
1. Check if API is deployed in Render dashboard
2. Check if DNS is configured correctly: `nslookup api.kamiyo.ai`
3. Try with Render's default URL first: `https://kamiyo-api.onrender.com/health`

### "Database connection failed"

**Problem:** PostgreSQL database not linked

**Solutions:**
1. In Render dashboard → `kamiyo-api` → Environment
2. Verify `DATABASE_URL` is set and linked to `kamiyo-postgres`
3. Restart the service after adding DATABASE_URL

### "Empty response" / No exploits returned

**Problem:** Database has no data

**Solutions:**
1. Run aggregators to fetch data (see Step 6 above)
2. Use mock API temporarily (Option 2)
3. Add sample data manually

### DNS not propagating

**Problem:** `api.kamiyo.ai` not resolving

**Solutions:**
1. Wait 15-30 minutes after adding DNS record
2. Test with Render's URL directly: `https://kamiyo-api.onrender.com`
3. Check DNS propagation: https://dnschecker.org
4. Verify CNAME record is correct in domain registrar

---

## What Happens Next (After API is Working)

Once `https://api.kamiyo.ai/exploits` returns data:

1. **Deploy Social Media Engine:**
   ```bash
   # In Render, create new Web Service
   Name: kamiyo-social-engine
   Build: pip install -r requirements.txt
   Start: python social/autonomous_growth_engine.py --mode poll

   # Environment variables:
   KAMIYO_API_URL=https://api.kamiyo.ai
   DISCORD_SOCIAL_ENABLED=true
   DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/YOUR_WEBHOOK
   ```

2. **Watch it work:**
   - Engine polls API every 60 seconds
   - Detects new exploits
   - Generates analysis reports
   - Posts to Discord/Twitter/Reddit/Telegram
   - Drives organic traffic to kamiyo.ai

3. **Monitor performance:**
   - Check Render logs for posting activity
   - Verify posts appear in social media channels
   - Track engagement metrics

---

## Recommended Path

**If you want to test TODAY:**
- Use Option 2 (Mock API) - 5 minutes
- Test social engine end-to-end
- Deploy real API to Render later

**If you want production setup:**
- Use Option 1 (Deploy to Render) - 10 minutes
- Full production-ready deployment
- Real exploit data from aggregators

**Best approach:**
1. Start with Mock API to verify social engine works (5 min)
2. Deploy real API to Render while mock is running (10 min)
3. Switch social engine to real API once deployed (1 min)
4. Start aggregators to populate database (ongoing)

---

## Need Help?

**Check deployment status:**
```bash
# Test if API is accessible
curl -v https://api.kamiyo.ai/health

# Check DNS resolution
nslookup api.kamiyo.ai

# Test with Render's default URL
curl https://kamiyo-api.onrender.com/health
```

**Common environment variables needed:**
- `DATABASE_URL` - PostgreSQL connection (auto-added by Render)
- `ENVIRONMENT=production`
- `ALLOWED_ORIGINS=https://kamiyo.ai,https://api.kamiyo.ai`

**Render logs:**
- Dashboard → `kamiyo-api` → Logs tab
- Look for "Database exploits: X" on startup
- Should see "Kamiyo API starting up..." message
