# x402 Python Verifier Deployment Guide

## Overview

The x402 Python Verifier is a standalone FastAPI service that verifies multi-chain USDC payments. It's deployed as a separate service on Render and communicates with the main application via HTTP API.

## Deployment Status

- ✅ Service configuration added to render.yaml
- ✅ Requirements.txt created with minimal dependencies
- ✅ PYTHON_VERIFIER_URL auto-configured in frontend
- ⏳ Awaiting environment variable configuration in Render dashboard
- ⏳ Awaiting deployment completion

## Required Environment Variables (Render Dashboard)

After the service deploys, configure these environment variables in the Render dashboard for the `kamiyo-x402-verifier` service:

### Authentication (Required)

```bash
PYTHON_VERIFIER_KEY=<generate-random-secure-key>
```

Generate a secure key:
```bash
openssl rand -base64 32
```

### Blockchain RPC Endpoints (Required)

```bash
# Base Network (Recommended: use Alchemy, QuickNode, or Infura)
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Ethereum Mainnet
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Solana (Use public RPC or Helius for production)
X402_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### Payment Addresses (Required)

Configure your wallet addresses where you'll receive USDC payments:

```bash
# Base USDC payment address (your wallet)
X402_BASE_PAYMENT_ADDRESS=0xYourBaseWalletAddress

# Ethereum USDC payment address (can be same as Base)
X402_ETHEREUM_PAYMENT_ADDRESS=0xYourEthereumWalletAddress

# Solana USDC payment address (SPL token account)
X402_SOLANA_PAYMENT_ADDRESS=YourSolanaWalletAddress
```

**IMPORTANT**: These addresses must be controlled by you. Customers will send USDC to these addresses.

### Monitoring (Optional but Recommended)

```bash
# Sentry for error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### Configuration (Already Set in render.yaml)

These are pre-configured in render.yaml with sensible defaults:

```bash
X402_BASE_CONFIRMATIONS=6
X402_ETHEREUM_CONFIRMATIONS=12
X402_SOLANA_CONFIRMATIONS=32
X402_MIN_PAYMENT_USD=0.10
```

## Post-Deployment Verification

### 1. Check Service Health

Once deployed, the service URL will be available in the Render dashboard. Test the health endpoint:

```bash
curl https://kamiyo-x402-verifier.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "x402-verifier",
  "supported_chains": ["base", "ethereum", "solana"]
}
```

### 2. Verify Auto-Configuration

The `kamiyo-frontend` service should automatically receive the PYTHON_VERIFIER_URL:

```bash
# Check in Render dashboard > kamiyo-frontend > Environment
# Should see:
PYTHON_VERIFIER_URL=https://kamiyo-x402-verifier.onrender.com
```

### 3. Run Test Suite

Use the test script to verify end-to-end functionality:

```bash
# Set environment variables
export PYTHON_VERIFIER_URL=https://kamiyo-x402-verifier.onrender.com
export PYTHON_VERIFIER_KEY=your-secure-key

# Run tests
node scripts/test_verifier.js
```

### 4. Test with Real Transaction

Replace the example transaction hashes in `scripts/test_verifier.js` with real transactions:

1. Send 1 USDC to your configured payment address on Base
2. Copy the transaction hash from BaseScan
3. Update the test case in `scripts/test_verifier.js`
4. Run the test script

Example test:
```bash
curl -X POST https://kamiyo-x402-verifier.onrender.com/verify \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: your-secure-key" \
  -d '{
    "tx_hash": "0xYourRealTransactionHash",
    "chain": "base",
    "expected_amount": 1.0
  }'
```

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│                 │         │                      │
│  Next.js App    │────────▶│  Python Verifier     │
│  (Frontend)     │  HTTP   │  (FastAPI Service)   │
│                 │◀────────│                      │
└─────────────────┘         └──────────────────────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │  Blockchain    │
                            │  RPC Nodes     │
                            │  Base/ETH/SOL  │
                            └────────────────┘
```

## Security Considerations

1. **Authentication**: The X-Internal-Key header prevents unauthorized access
2. **Network Isolation**: Only the frontend service should have access to the verifier
3. **RPC Security**: Use authenticated RPC endpoints (Alchemy, Infura) for production
4. **Payment Addresses**: Keep private keys for payment addresses in cold storage
5. **Rate Limiting**: Consider adding rate limits in production

## Troubleshooting

### Service Won't Start

Check Render logs for:
- Missing environment variables
- Invalid RPC URLs
- Python dependency installation errors

### Verifications Failing

1. Check RPC endpoints are accessible
2. Verify payment addresses are correct
3. Ensure sufficient confirmations have passed
4. Check transaction is to the correct USDC contract

### Connection Issues

1. Verify PYTHON_VERIFIER_URL is set in frontend
2. Check PYTHON_VERIFIER_KEY matches in both services
3. Ensure health endpoint responds
4. Review Render service logs

## Next Steps

After successful deployment:

1. ✅ Configure all required environment variables
2. ✅ Test health endpoint
3. ✅ Test with real transaction
4. ✅ Monitor Sentry for errors
5. ✅ Set up UptimeRobot for monitoring
6. → Proceed to Task 2: Fix Dashboard Authentication

## Rollback Procedure

If deployment fails:

1. Click "Rollback" in Render dashboard for kamiyo-x402-verifier
2. Check error logs to identify issue
3. Fix configuration and redeploy

## Cost Estimate

- Render Web Service (Starter): $7/month
- RPC Calls: ~$0-50/month (depends on usage)
- Total: ~$7-57/month for verifier service

## Support

- Review `api/x402/verifier_api.py` for API documentation
- Check `api/x402/payment_verifier.py` for verification logic
- See `X402_PRODUCTION_DEPLOYMENT_PLAN.md` for detailed task breakdown
