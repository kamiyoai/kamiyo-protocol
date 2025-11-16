# Production Secrets Checklist

Quick reference for preparing production secrets for KAMIYO deployment.

## ✅ Pre-Deployment Checklist

### 1. Generate Secure Secrets

```bash
# Auto-generate core secrets
bash scripts/generate_production_secrets.sh > secrets.txt

# Or generate manually
openssl rand -hex 32  # Run this for each secret
```

### 2. Required Secrets (32+ characters each)

- [ ] `NEXTAUTH_SECRET` - NextAuth.js session signing
- [ ] `CSRF_SECRET_KEY` - CSRF protection
- [ ] `JWT_SECRET` - JWT token signing
- [ ] `MCP_JWT_SECRET` - MCP server authentication
- [ ] `X402_ADMIN_KEY` - x402 admin operations

### 3. Stripe Configuration (Live Mode)

- [ ] `STRIPE_SECRET_KEY` - Must start with `sk_live_`
- [ ] `STRIPE_PUBLISHABLE_KEY` - Must start with `pk_live_`
- [ ] `STRIPE_WEBHOOK_SECRET` - From webhook configuration
- [ ] `STRIPE_PRICE_ID_PRO` - Pro tier price ID
- [ ] `STRIPE_PRICE_ID_TEAM` - Team tier price ID
- [ ] `STRIPE_PRICE_ID_ENTERPRISE` - Enterprise tier price ID

**Get from:** https://dashboard.stripe.com/apikeys

### 4. x402 Payment Wallets (Production Only!)

- [ ] `X402_BASE_PAYMENT_ADDRESS` - Base mainnet wallet (0x...)
- [ ] `X402_ETHEREUM_PAYMENT_ADDRESS` - Ethereum mainnet wallet (0x...)
- [ ] `X402_SOLANA_PAYMENT_ADDRESS` - Solana mainnet wallet (Base58)

**⚠️ CRITICAL:** Generate NEW wallets for production. NEVER reuse dev/test wallets!

### 5. RPC Endpoints (Mainnet Only!)

- [ ] `X402_BASE_RPC_URL` - Base mainnet RPC
- [ ] `X402_ETHEREUM_RPC_URL` - Ethereum mainnet RPC
- [ ] `X402_SOLANA_RPC_URL` - Solana mainnet RPC

**⚠️ CRITICAL:** Must NOT contain: `testnet`, `devnet`, `goerli`, `sepolia`, `YOUR-API-KEY`

**Get API keys from:** Alchemy, Infura, QuickNode, or Helius

### 6. Environment Configuration

- [ ] `ENVIRONMENT=production` - Must be exactly "production"

### 7. Database & Cache

- [ ] `DATABASE_URL` - PostgreSQL connection URL (recommended)
- [ ] `REDIS_URL` - Redis connection URL (recommended)

### 8. Optional but Recommended

- [ ] `SENTRY_DSN` - Error tracking
- [ ] `ALLOWED_ORIGINS` - CORS configuration (no localhost!)

## 🚫 Forbidden Values (Will Fail Validation)

### Default Values (Change These!)

```
❌ CSRF_SECRET_KEY=CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM
❌ JWT_SECRET=dev_jwt_secret_change_in_production
❌ MCP_JWT_SECRET=your_mcp_jwt_secret_here_32_chars_minimum
❌ X402_ADMIN_KEY=dev_x402_admin_key_change_in_production
❌ X402_ADMIN_KEY=IfvCvAe4z3_qujafiuR_ZCMuDr1XvbrxMCCu7Bab3Dw5IZPV16OUVvMDWEsxFunw
❌ ADMIN_API_KEY=dev_admin_key_change_in_production
```

### Development Addresses (Change These!)

```
❌ X402_BASE_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
❌ X402_ETHEREUM_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
❌ X402_SOLANA_PAYMENT_ADDRESS=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

### Test Mode (Change These!)

```
❌ STRIPE_SECRET_KEY=sk_test_*
❌ STRIPE_PUBLISHABLE_KEY=pk_test_*
```

## 🔧 Quick Commands

### Generate All Secrets
```bash
bash scripts/generate_production_secrets.sh
```

### Validate Configuration
```bash
python3 scripts/verify_production_secrets.py
```

### Generate Single Secret
```bash
openssl rand -hex 32
```

### Check Stripe Mode
```bash
echo $STRIPE_SECRET_KEY | grep -q "sk_live_" && echo "✅ Live mode" || echo "❌ Test mode"
```

### Verify Ethereum Address Format
```bash
# Should be 42 chars starting with 0x
echo $X402_BASE_PAYMENT_ADDRESS | grep -qE '^0x[a-fA-F0-9]{40}$' && echo "✅ Valid" || echo "❌ Invalid"
```

## 📋 Validation Quick Reference

| Check | Pass | Fail |
|-------|------|------|
| Secret length | ≥32 chars | <32 chars |
| Stripe secret | `sk_live_*` | `sk_test_*` or empty |
| Stripe public | `pk_live_*` | `pk_test_*` or empty |
| Ethereum address | `0x[40 hex]` | Wrong format |
| Solana address | Base58, 32-44 chars | Wrong format |
| RPC URL | Mainnet | Testnet/devnet |
| Environment | `production` | Anything else |

## 🎯 Deployment Steps

1. **Generate secrets:**
   ```bash
   bash scripts/generate_production_secrets.sh > .env.production
   ```

2. **Fill in manual values:**
   - Stripe keys from dashboard
   - Production wallet addresses
   - RPC endpoint URLs with API keys
   - Database connection URL

3. **Validate configuration:**
   ```bash
   python3 scripts/verify_production_secrets.py
   ```

4. **Fix any errors** reported by validation

5. **Deploy** once validation passes:
   ```bash
   # Validation should return exit code 0
   python3 scripts/verify_production_secrets.py && echo "Ready to deploy!"
   ```

## 🔒 Security Best Practices

1. ✅ **Generate unique secrets** for production (never copy from dev)
2. ✅ **Use live Stripe keys** (sk_live_*, pk_live_*)
3. ✅ **Create new wallets** for production payments
4. ✅ **Use mainnet RPC endpoints** only
5. ✅ **Store secrets securely** (password manager, vault)
6. ✅ **Limit access** to production secrets
7. ✅ **Rotate regularly** (every 90 days)
8. ✅ **Never commit** .env.production to git
9. ✅ **Audit access** to production systems
10. ✅ **Enable monitoring** (Sentry, logging)

## 🆘 Troubleshooting

### Validation fails with "Not set"
- Check `.env.production` exists and has correct variable names
- Verify no typos in variable names
- Ensure file is loaded (should see "Loading .env.production" message)

### Validation fails with "Too short"
- Secrets must be ≥32 characters
- Use `openssl rand -hex 32` to generate proper length

### Validation fails with "Using default value"
- Never use example values from .env.example in production
- Generate new unique secrets for production

### Validation fails with "Must start with sk_live_"
- Using test mode Stripe keys in production
- Get live keys from Stripe dashboard

### Validation fails with "Using development address"
- Production detected dev wallet addresses
- Generate and configure new production wallets

## 📞 Support

- **Documentation:** `scripts/README_VERIFY_SECRETS.md`
- **Script:** `scripts/verify_production_secrets.py`
- **Generator:** `scripts/generate_production_secrets.sh`
- **Example:** `.env.example`

---

**Last Updated:** 2025-10-29
