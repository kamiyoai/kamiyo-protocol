# x402 Infrastructure SaaS - Deployment Guide

Complete deployment guide for the x402 Infrastructure SaaS platform on Render.

## Pre-Deployment Checklist

- [x] Prisma schema updated with X402 models
- [x] Migrations created
- [x] TenantManager implemented
- [x] APIKeyManager implemented
- [x] VerificationService wrapper implemented
- [x] REST API endpoints created
- [x] Python SDK created
- [x] Documentation written

## Render Deployment

### 1. Database Setup

Your PostgreSQL database is already provisioned on Render:

```
Host: dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com
Database: kamiyo_ai
User: kamiyo_ai_user
```

### 2. Set Environment Variables in Render Dashboard

Navigate to your Render service settings and add these environment variables:

#### Required Variables

```bash
# Database (should already be set)
DATABASE_URL=postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a/kamiyo_ai

# x402 Admin Key (generate new one)
X402_ADMIN_KEY=<generate with: openssl rand -hex 32>

# NextAuth (should already be set)
NEXTAUTH_SECRET=<your_existing_secret>
NEXTAUTH_URL=https://kamiyo.ai
```

#### Optional Variables (for full x402 features)

```bash
# Python Verifier API URL (for production mode)
PYTHON_VERIFIER_URL=http://localhost:8000

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# x402 Payment Addresses (tenant-specific addresses will be generated)
X402_BASE_PAYMENT_ADDRESS=0x...
X402_ETHEREUM_PAYMENT_ADDRESS=0x...
X402_SOLANA_PAYMENT_ADDRESS=...

# RPC Endpoints
X402_BASE_RPC_URL=https://mainnet.base.org
X402_ETHEREUM_RPC_URL=https://eth.llamarpc.com
X402_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### 3. Deploy Database Migrations

#### Option A: Using Render Shell (Recommended)

1. Open Render Dashboard → Your Service → Shell
2. Run:

```bash
npx prisma migrate deploy
```

#### Option B: Using Local Machine

1. Set DATABASE_URL locally:

```bash
export DATABASE_URL="postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai"
```

2. Deploy migrations:

```bash
npx prisma migrate deploy
```

### 4. Verify Deployment

After deployment completes, verify the services are running:

```bash
# Health check
curl https://kamiyo.ai/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-08T...",
  "services": {
    "database": "connected",
    "api": "running"
  }
}
```

## Python Verifier Deployment

The x402 platform uses a Python verifier for payment verification. This can be deployed in two modes:

### Mode 1: HTTP API (Recommended for Production)

Deploy the Python verifier as a separate FastAPI service.

**1. Create new Render Web Service:**
- Service Name: `kamiyo-x402-verifier`
- Environment: Python 3
- Build Command: `pip install fastapi uvicorn`
- Start Command: `uvicorn api.x402.verifier_api:app --host 0.0.0.0 --port 8000`

**2. Set environment variable in main app:**
```bash
PYTHON_VERIFIER_URL=https://kamiyo-x402-verifier.onrender.com
```

**3. Verify deployment:**
```bash
curl https://kamiyo-x402-verifier.onrender.com/health
# Expected: {"status": "healthy"}
```

### Mode 2: Direct Execution (Fallback)

If `PYTHON_VERIFIER_URL` is not set, the system will spawn Python processes directly from Node.js.

**Pros:**
- Simpler deployment (no separate service)
- No additional cost

**Cons:**
- Higher latency (~500ms vs ~100ms)
- Less scalable

**To use:** Simply don't set `PYTHON_VERIFIER_URL` environment variable.

### Health Check

The `/api/v1/x402/health` endpoint reports verifier status:

```bash
curl https://kamiyo.ai/api/v1/x402/health
```

Response includes:
```json
{
  "status": "healthy",
  "checks": {
    "database": {"status": "healthy", "latency_ms": 15},
    "verifier": {"status": "healthy", "mode": "http_api"}
  }
}
```

## Creating Your First Tenant

### 1. Generate Admin Key (if not already done)

```bash
openssl rand -hex 32
```

Set this as `X402_ADMIN_KEY` in Render dashboard.

### 2. Create a Test Tenant

```bash
curl -X POST https://kamiyo.ai/api/v1/x402/admin/create-tenant \
  -H "X-Admin-Key: YOUR_ADMIN_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "company_name": "Test Company",
    "tier": "free"
  }'
```

### 3. Save the API Key

The response will include an API key like `x402_live_XXXXX...`. **Save this key** - it won't be shown again.

```json
{
  "tenant": {
    "id": "clxxx...",
    "email": "test@example.com",
    "tier": "free",
    "monthlyVerificationLimit": 1000,
    "enabledChains": ["solana", "base"]
  },
  "apiKey": "x402_live_XXXXX...",
  "message": "Tenant created successfully. Save the API key - it will not be shown again."
}
```

## Testing the API

### 1. Check Usage

```bash
curl https://kamiyo.ai/api/v1/x402/usage \
  -H "Authorization: Bearer x402_live_XXXXX..."
```

Expected response:

```json
{
  "tier": "free",
  "verifications_used": 0,
  "verifications_limit": 1000,
  "verifications_remaining": 1000,
  "quota_reset_date": "2025-12-01T00:00:00.000Z",
  "enabled_chains": ["solana", "base"],
  "usage_percent": "0.00"
}
```

### 2. Check Supported Chains

```bash
curl https://kamiyo.ai/api/v1/x402/supported-chains \
  -H "Authorization: Bearer x402_live_XXXXX..."
```

Expected response:

```json
{
  "tier": "free",
  "enabled_chains": ["solana", "base"],
  "all_chains": ["solana", "base", "ethereum", "polygon", "avalanche", "sei", "iotex", "peaq"],
  "payai_enabled": false
}
```

### 3. Test Verification (will fail until core verifier is integrated)

```bash
curl -X POST https://kamiyo.ai/api/v1/x402/verify \
  -H "Authorization: Bearer x402_live_XXXXX..." \
  -H "Content-Type: application/json" \
  -d '{
    "tx_hash": "test_transaction_hash",
    "chain": "solana",
    "expected_amount": 1.00
  }'
```

Expected response (until core verifier is integrated):

```json
{
  "success": false,
  "error": "Verification error: Core verifier not integrated yet - implement callCoreVerifier",
  "errorCode": "VERIFICATION_FAILED"
}
```

## Integrating the Core Payment Verifier

The SaaS layer is ready, but needs to be connected to the existing Python payment verifier.

### Option 1: Expose Python Verifier as HTTP API

Create a FastAPI wrapper for the payment verifier:

```python
# api/x402/verifier_api.py
from fastapi import FastAPI, HTTPException
from api.x402.payment_verifier import payment_verifier

app = FastAPI()

@app.post("/verify")
async def verify_payment(request: dict):
    result = await payment_verifier.verify_payment(
        tx_hash=request["tx_hash"],
        chain=request["chain"],
        expected_amount=request.get("expected_amount")
    )

    return {
        "isValid": result.is_valid,
        "txHash": result.tx_hash,
        "chain": result.chain,
        "amountUsdc": str(result.amount_usdc),
        "fromAddress": result.from_address,
        "toAddress": result.to_address,
        "confirmations": result.confirmations,
        "riskScore": result.risk_score,
        "errorMessage": result.error_message
    }
```

Then update `lib/x402-saas/verification-service.js`:

```javascript
static async callCoreVerifier(txHash, chain, expectedAmount) {
  const response = await fetch('http://localhost:8000/x402/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_hash: txHash,
      chain: chain,
      expected_amount: expectedAmount
    })
  });

  if (!response.ok) {
    throw new Error(`Verifier API error: ${response.status}`);
  }

  return response.json();
}
```

### Option 2: Direct Python Integration

Use child_process to call Python directly from Node.js:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

static async callCoreVerifier(txHash, chain, expectedAmount) {
  const command = `python3 -c "
from api.x402.payment_verifier import payment_verifier
import asyncio
import json

async def verify():
    result = await payment_verifier.verify_payment('${txHash}', '${chain}', ${expectedAmount || 'None'})
    print(json.dumps({
        'isValid': result.is_valid,
        'txHash': result.tx_hash,
        'chain': result.chain,
        'amountUsdc': str(result.amount_usdc),
        'fromAddress': result.from_address,
        'toAddress': result.to_address,
        'confirmations': result.confirmations,
        'riskScore': result.risk_score,
        'errorMessage': result.error_message
    }))

asyncio.run(verify())
"`;

  const { stdout } = await execAsync(command);
  return JSON.parse(stdout);
}
```

## Python SDK Usage

### Installation

```bash
pip install ./sdks/python
```

### Basic Usage

```python
from x402 import X402Client

# Initialize client
client = X402Client(api_key="x402_live_XXXXX...")

# Verify payment
result = client.verify_payment(
    tx_hash="5KZ7xQjDPh4A7V9X...",
    chain="solana",
    expected_amount=1.00
)

if result.success:
    print(f"✓ Verified: {result.amount_usdc} USDC")
    print(f"  From: {result.from_address}")
    print(f"  Risk Score: {result.risk_score}")
else:
    print(f"✗ Failed: {result.error}")
```

## Monitoring & Maintenance

### Database Monitoring

Monitor your database usage in Render dashboard:

- Connection pool utilization
- Query performance
- Storage usage

### API Monitoring

Key metrics to track:

1. **Verification Success Rate**
   - Query: `SELECT COUNT(*), success FROM X402Verification GROUP BY success`

2. **Top Tenants by Usage**
   - Query: `SELECT tenantId, COUNT(*) as verifications FROM X402Verification GROUP BY tenantId ORDER BY verifications DESC LIMIT 10`

3. **Quota Usage Alerts**
   - Query: `SELECT * FROM X402Tenant WHERE (monthlyVerificationsUsed::float / monthlyVerificationLimit) > 0.8`

### Monthly Quota Reset

Set up a cron job to reset quotas on the 1st of each month:

```javascript
// pages/api/cron/reset-quotas.js
import { TenantManager } from '../../../lib/x402-saas/tenant-manager.js';

export default async function handler(req, res) {
  // Verify cron job authorization
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const resetCount = await TenantManager.resetMonthlyQuotas();

  return res.status(200).json({
    message: 'Quotas reset successfully',
    tenantsReset: resetCount
  });
}
```

Configure in Render dashboard as a cron job or use external service like Render Cron Jobs.

## Troubleshooting

### Issue: Database Connection Failed

Check:
1. DATABASE_URL is correctly formatted
2. Database is running (check Render dashboard)
3. IP allowlist configured correctly

### Issue: API Key Validation Failing

Check:
1. API key format is correct (x402_live_* or x402_test_*)
2. Key exists in database
3. Tenant status is 'active'

### Issue: Quota Exceeded

Check:
1. Current usage: `GET /api/v1/x402/usage`
2. Reset date passed but quota not reset
3. Upgrade tier if needed

## Next Steps

1. **Integrate Core Verifier** - Connect Python payment verifier to SaaS layer
2. **Add Stripe Billing** - Implement subscription management
3. **Build Dashboard** - Create tenant self-service portal
4. **Add Monitoring** - Set up Sentry, logging, and alerting
5. **Launch Marketing** - Create landing page, documentation site

## Support

For deployment issues or questions:

- GitHub Issues: https://github.com/kamiyo-ai/kamiyo/issues
- Email: dev@kamiyo.ai
- Documentation: See `X402_SAAS_IMPLEMENTATION.md`

---

**Deployment Status:** ✅ SaaS Infrastructure Ready
**Next Critical Step:** Integrate core payment verifier
