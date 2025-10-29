# Production Secrets Verification Script

## Overview

The `verify_production_secrets.py` script validates all production environment variables before deployment to ensure no insecure defaults, proper formats, and production-ready configuration.

## Usage

```bash
python3 scripts/verify_production_secrets.py
```

## Exit Codes

- **0**: All checks passed (production ready)
- **1**: One or more checks failed (deployment blocked)

## What It Checks

### 1. Required Secrets Exist (Not Empty)

All critical secrets must be set and meet minimum length requirements:

| Variable | Min Length | Purpose |
|----------|------------|---------|
| `NEXTAUTH_SECRET` | 32 chars | NextAuth.js session signing |
| `CSRF_SECRET_KEY` | 32 chars | CSRF token protection |
| `JWT_SECRET` | 32 chars | JWT token signing |
| `X402_ADMIN_KEY` | 32 chars | x402 admin operations |
| `STRIPE_SECRET_KEY` | - | Stripe API authentication |
| `STRIPE_PUBLISHABLE_KEY` | - | Stripe client-side key |
| `STRIPE_WEBHOOK_SECRET` | - | Stripe webhook verification |

### 2. No Default/Insecure Values

The script blocks deployment if any of these default values are detected:

**CSRF Protection:**
- ❌ `CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM`

**JWT Secrets:**
- ❌ `dev_jwt_secret_change_in_production`
- ❌ `your_mcp_jwt_secret_here_32_chars_minimum`

**x402 Admin Keys:**
- ❌ `dev_x402_admin_key_change_in_production`
- ❌ `your_secure_admin_key_here`
- ❌ `IfvCvAe4z3_qujafiuR_ZCMuDr1XvbrxMCCu7Bab3Dw5IZPV16OUVvMDWEsxFunw` (development value)

**Legacy Admin Key:**
- ❌ `dev_admin_key_change_in_production`

### 3. Production Configuration

**Environment:**
- ✅ `ENVIRONMENT` must be `"production"`

**Stripe Keys (Live Mode):**
- ✅ `STRIPE_SECRET_KEY` must start with `sk_live_*`
- ✅ `STRIPE_PUBLISHABLE_KEY` must start with `pk_live_*`
- ✅ `STRIPE_WEBHOOK_SECRET` should start with `whsec_*`

**RPC URLs (Mainnet Only):**
- ✅ No testnet/devnet URLs allowed
- ❌ Must not contain: `testnet`, `goerli`, `sepolia`, `devnet`, `test`
- ❌ Must not contain placeholder: `YOUR-API-KEY`, `YOUR_ALCHEMY_KEY`

**Payment Addresses (Production Wallets):**
- ❌ No development addresses allowed:
  - Ethereum/Base: `0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7`
  - Solana: `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`

### 4. Format Validation

**URLs:**
- ✅ `DATABASE_URL` must be valid URL or SQLite path
- ✅ `REDIS_URL` must be valid URL (redis://)
- ✅ All RPC URLs must be valid HTTPS URLs

**Ethereum Addresses:**
- ✅ Must start with `0x`
- ✅ Must be exactly 42 characters (0x + 40 hex chars)
- ✅ Must contain only hexadecimal characters

**Solana Addresses:**
- ✅ Must be Base58 encoded
- ✅ Must be 32-44 characters
- ✅ Must not contain: `0`, `O`, `I`, `l` (not in Base58)

## Example Output

### ✅ Success (All Checks Pass)

```
📄 Loading environment from .env.production

======================================================================
  KAMIYO Production Secrets Verification
======================================================================

🔍 Checking: Environment Configuration
   ✅ Passed

🔍 Checking: Core Secrets (NEXTAUTH, CSRF, JWT)
   ✅ Passed

🔍 Checking: Stripe API Keys
   ✅ Passed

🔍 Checking: x402 Admin Keys
   ✅ Passed

🔍 Checking: x402 Payment Addresses
   ✅ Passed

🔍 Checking: x402 RPC Endpoints
   ✅ Passed

🔍 Checking: Database URLs
   ✅ Passed

======================================================================
  VALIDATION SUMMARY
======================================================================

======================================================================
✅ ALL CHECKS PASSED

Production secrets are properly configured.
Ready for production deployment!
```

### ❌ Failure (Validation Errors)

```
📄 Loading environment from .env.production

======================================================================
  KAMIYO Production Secrets Verification
======================================================================

🔍 Checking: Core Secrets (NEXTAUTH, CSRF, JWT)
   ❌ Failed

🔍 Checking: Stripe API Keys
   ❌ Failed

======================================================================
  VALIDATION SUMMARY
======================================================================

ERRORS (5):

  ❌ Core Secrets - NEXTAUTH_SECRET: Too short (16 chars, must be ≥32)
  ❌ Core Secrets - CSRF_SECRET_KEY: Using insecure default value
  ❌ Stripe - STRIPE_SECRET_KEY: Must start with 'sk_live_' for production
  ❌ Stripe - STRIPE_PUBLISHABLE_KEY: Must start with 'pk_live_' for production
  ❌ Payment Addresses - X402_BASE_PAYMENT_ADDRESS: Using development address

======================================================================
❌ VALIDATION FAILED

Production deployment BLOCKED due to 5 error(s).
Fix all errors above before deploying to production.
```

## Integration with CI/CD

### GitHub Actions

Add to your deployment workflow:

```yaml
- name: Validate Production Secrets
  run: python3 scripts/verify_production_secrets.py
  env:
    ENVIRONMENT: production
    NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
    CSRF_SECRET_KEY: ${{ secrets.CSRF_SECRET_KEY }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
    STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
    STRIPE_PUBLISHABLE_KEY: ${{ secrets.STRIPE_PUBLISHABLE_KEY }}
    STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
    X402_ADMIN_KEY: ${{ secrets.X402_ADMIN_KEY }}
    X402_BASE_PAYMENT_ADDRESS: ${{ secrets.X402_BASE_PAYMENT_ADDRESS }}
    X402_ETHEREUM_PAYMENT_ADDRESS: ${{ secrets.X402_ETHEREUM_PAYMENT_ADDRESS }}
    X402_SOLANA_PAYMENT_ADDRESS: ${{ secrets.X402_SOLANA_PAYMENT_ADDRESS }}
    X402_BASE_RPC_URL: ${{ secrets.X402_BASE_RPC_URL }}
    X402_ETHEREUM_RPC_URL: ${{ secrets.X402_ETHEREUM_RPC_URL }}
    X402_SOLANA_RPC_URL: ${{ secrets.X402_SOLANA_RPC_URL }}
```

### Pre-Deployment Script

Add to your deployment script:

```bash
#!/bin/bash
set -e

echo "Validating production secrets..."
python3 scripts/verify_production_secrets.py

if [ $? -eq 0 ]; then
    echo "✅ Secrets validated, proceeding with deployment..."
    # Your deployment commands here
else
    echo "❌ Secret validation failed, aborting deployment!"
    exit 1
fi
```

## Generating Secure Secrets

### Using OpenSSL

Generate 32+ character secure secrets:

```bash
# For NEXTAUTH_SECRET, CSRF_SECRET_KEY, JWT_SECRET, X402_ADMIN_KEY
openssl rand -hex 32

# Or base64 (longer but URL-safe)
openssl rand -base64 32
```

### Using Python

```python
import secrets
# Generate 32-byte (64 hex character) secret
print(secrets.token_hex(32))

# Or URL-safe base64
print(secrets.token_urlsafe(32))
```

## Environment File Setup

### Create `.env.production`

```bash
cp .env.example .env.production
```

### Edit with Real Values

```bash
# NEVER commit this file!
echo ".env.production" >> .gitignore

# Edit with secure values
nano .env.production
```

### Run Validation

```bash
python3 scripts/verify_production_secrets.py
```

## Security Best Practices

1. **Never commit `.env.production`** to version control
2. **Rotate secrets regularly** (every 90 days recommended)
3. **Use different secrets** for each environment (dev, staging, prod)
4. **Store secrets securely** in a password manager or secrets vault
5. **Limit access** to production secrets to authorized personnel only
6. **Audit secret usage** regularly
7. **Use environment-specific Stripe keys** (test in dev, live in prod)
8. **Generate unique wallet addresses** for production (never reuse dev wallets)
9. **Use rate-limited RPC endpoints** with API keys from trusted providers

## Troubleshooting

### Script Not Found

```bash
# Make sure you're in the project root
cd /path/to/kamiyo

# Make script executable if needed
chmod +x scripts/verify_production_secrets.py
```

### Python Version Issues

```bash
# Script requires Python 3.6+
python3 --version

# If using virtual environment
source venv/bin/activate
python scripts/verify_production_secrets.py
```

### Missing Dependencies

```bash
# Install python-dotenv if not available
pip install python-dotenv
```

## Related Scripts

- `scripts/validate_production_config.py` - Legacy validation script
- `scripts/production_readiness_audit.py` - Comprehensive production audit
- `.env.example` - Template with all required variables

## Support

For issues or questions:
1. Check this README
2. Review `.env.example` for required variables
3. Run with verbose output: `python3 scripts/verify_production_secrets.py`
4. Contact DevOps team for production secrets access
