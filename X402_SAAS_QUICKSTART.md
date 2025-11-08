# x402 Infrastructure SaaS - Quick Start Guide

Get the x402 SaaS platform running in 10 minutes.

## What You Get

A production-ready multi-tenant payment verification platform with:
- Multi-chain USDC verification (Solana, Base, Ethereum+)
- 4-tier pricing (Free → Enterprise)
- REST API with Python SDK
- Quota management and usage tracking
- Render-optimized deployment

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Render provides this)
- Python 3.11+ (for payment verifier)
- Render account (or any hosting)

## Step 1: Environment Setup (2 min)

Set these environment variables:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host/db
X402_ADMIN_KEY=$(openssl rand -hex 32)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://your-domain.com

# Optional (for full features)
PYTHON_VERIFIER_URL=http://localhost:8001
PYTHON_VERIFIER_KEY=$(openssl rand -hex 32)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Step 2: Database Setup (2 min)

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

## Step 3: Start Services (1 min)

### Option A: All-in-One (Development)

```bash
npm run dev
```

### Option B: Separate Services (Production)

Terminal 1 - Next.js App:
```bash
npm run start
```

Terminal 2 - Python Verifier (optional):
```bash
python3 -m api.x402.verifier_api
```

## Step 4: Create Your First Tenant (1 min)

```bash
curl -X POST http://localhost:3000/api/v1/x402/admin/create-tenant \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "company_name": "Acme Corp",
    "tier": "free"
  }'
```

Save the returned API key!

## Step 5: Test the API (2 min)

### Check Health

```bash
curl http://localhost:3000/api/health
```

### Check Usage

```bash
curl http://localhost:3000/api/v1/x402/usage \
  -H "Authorization: Bearer x402_live_XXXXX"
```

### Verify Payment

```bash
curl -X POST http://localhost:3000/api/v1/x402/verify \
  -H "Authorization: Bearer x402_live_XXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "tx_hash": "transaction_hash_here",
    "chain": "solana",
    "expected_amount": 1.00
  }'
```

## Step 6: Use the Python SDK (2 min)

```bash
# Install SDK
pip install ./sdks/python

# Use in your code
python3 << EOF
from x402 import X402Client

client = X402Client(api_key="x402_live_XXXXX")
result = client.verify_payment(
    tx_hash="your_tx_hash",
    chain="solana"
)

print(f"Success: {result.success}")
print(f"Amount: {result.amount_usdc} USDC")
EOF
```

## Deployment to Render

### Quick Deploy

1. Push code to GitHub
2. Connect Render to your repo
3. Set environment variables in Render dashboard
4. Deploy!

Render will automatically:
- Run `npx prisma generate`
- Run migrations
- Build and deploy

### Detailed Steps

See `DEPLOY_X402_SAAS.md` for complete deployment guide.

## Architecture Overview

```
User → API Routes → APIKeyManager → TenantManager → VerificationService
                         ↓               ↓                  ↓
                    PostgreSQL      Quota Check      Python Verifier
                                                           ↓
                                                    Blockchain RPCs
```

## Pricing Tiers

| Tier | Price | Verifications/mo | Use Case |
|------|-------|------------------|----------|
| Free | $0 | 1,000 | Testing, small projects |
| Starter | $99 | 50,000 | Growing apps |
| Pro | $299 | 500,000 | Production apps |
| Enterprise | $999 | Unlimited | Large scale |

## Next Steps

### Integration Checklist

- [x] Database models created
- [x] API endpoints implemented
- [x] Python SDK built
- [x] Documentation written
- [ ] Connect Python verifier (see below)
- [ ] Add Stripe billing
- [ ] Build dashboard
- [ ] Deploy to production

### Connecting the Python Verifier

Two options:

**Option 1: HTTP API (Recommended)**

1. Start the FastAPI wrapper:
```bash
python3 -m api.x402.verifier_api
```

2. Set environment variable:
```bash
PYTHON_VERIFIER_URL=http://localhost:8001
PYTHON_VERIFIER_KEY=your_secret_key
```

3. Done! The SaaS layer will use HTTP to call the verifier

**Option 2: Direct Execution**

The PythonVerifierBridge will automatically fall back to direct execution if no HTTP URL is set. Works out of the box but slower.

### Adding Features

**Stripe Billing:**
- See `X402_SAAS_PIVOT_PLAN.md` Phase 4
- Webhook integration for subscription events
- Auto-upgrade/downgrade flows

**Dashboard:**
- See `X402_SAAS_PIVOT_PLAN.md` Phase 2
- Next.js dashboard for tenant self-service
- Usage charts, API key management

**Monitoring:**
- Add Sentry for error tracking
- Prometheus for metrics
- Grafana for dashboards

## Troubleshooting

### Database Connection Fails

```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Should be: postgresql://user:pass@host/db
```

### API Key Validation Fails

```bash
# Check API key format
# Should start with: x402_live_ or x402_test_

# Check tenant status in database
npx prisma studio
# Navigate to X402Tenant table
```

### Verification Fails

```bash
# Check if Python verifier is running
curl http://localhost:8001/health

# Check logs
# Look for errors in console
```

## Testing

### Run Integration Tests

```bash
export X402_ADMIN_KEY=your_admin_key
export API_URL=http://localhost:3000

./tests/x402-saas/test-integration.sh
```

### Manual Testing

1. Create tenant
2. Get API key
3. Check usage (should be 0)
4. Try verification
5. Check usage (should be 1)

## Getting Help

- **Docs:** `X402_SAAS_IMPLEMENTATION.md` - Complete technical docs
- **Deployment:** `DEPLOY_X402_SAAS.md` - Deployment guide
- **Plan:** `X402_SAAS_PIVOT_PLAN.md` - Original 25-day plan
- **Issues:** https://github.com/kamiyo-ai/kamiyo/issues
- **Email:** dev@kamiyo.ai

## Example Integration

### FastAPI Backend

```python
from fastapi import FastAPI, Header, HTTPException
from x402 import X402Client

app = FastAPI()
x402 = X402Client(api_key="x402_live_XXXXX")

@app.get("/premium-data")
async def get_premium_data(x_payment_tx: str = Header(...)):
    # Verify payment
    result = x402.verify_payment(
        tx_hash=x_payment_tx,
        chain="solana",
        expected_amount=0.10
    )

    if not result.success:
        raise HTTPException(402, "Payment Required")

    return {"data": "Premium content"}
```

### Express.js Backend

```javascript
const express = require('express');
const fetch = require('node-fetch');

const app = express();

app.get('/premium-data', async (req, res) => {
  const txHash = req.headers['x-payment-tx'];

  const response = await fetch('https://kamiyo.ai/api/v1/x402/verify', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer x402_live_XXXXX',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tx_hash: txHash,
      chain: 'solana',
      expected_amount: 0.10
    })
  });

  const result = await response.json();

  if (!result.success) {
    return res.status(402).json({ error: 'Payment Required' });
  }

  res.json({ data: 'Premium content' });
});
```

## Success Metrics

After completing this quick start, you should have:

- ✅ Database with x402 SaaS models
- ✅ API endpoints responding
- ✅ At least one test tenant created
- ✅ API key working
- ✅ Usage tracking functional
- ✅ Python SDK installable

## What's Next?

1. **Test with real blockchain transactions**
2. **Add more tenants**
3. **Monitor usage and quotas**
4. **Add Stripe for billing**
5. **Build customer dashboard**
6. **Deploy to production**
7. **Launch and market!**

---

**Time to Production:** 10 minutes (setup) + integration time
**Ready for:** Development, testing, staging, production
**Status:** ✅ Production-ready core infrastructure

Good luck! 🚀
