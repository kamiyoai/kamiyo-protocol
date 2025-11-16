#!/bin/bash
# Development Environment Configuration Script
# Generates secure random keys for local development
# Author: Claude (Anthropic)
# Date: 2025-10-27

set -e

echo "=============================================="
echo "KAMIYO Development Environment Configuration"
echo "=============================================="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "   Please copy .env.example to .env first:"
    echo "   cp .env.example .env"
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed!"
    exit 1
fi

echo "📝 Backing up current .env file..."
BACKUP_FILE=".env.backup_$(date +%Y%m%d_%H%M%S)"
cp .env "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"
echo ""

echo "🔐 Generating secure random keys..."
echo ""

# Generate CSRF Secret Key
CSRF_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
echo "✓ Generated CSRF_SECRET_KEY (${#CSRF_KEY} characters)"

# Generate x402 Admin Key
X402_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
echo "✓ Generated X402_ADMIN_KEY (${#X402_KEY} characters)"

# Generate JWT Secret
JWT_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
echo "✓ Generated JWT_SECRET (${#JWT_KEY} characters)"

echo ""
echo "📝 Updating .env file..."

# Update CSRF key
if grep -q "^CSRF_SECRET_KEY=" .env; then
    sed -i.tmp "s|^CSRF_SECRET_KEY=.*|CSRF_SECRET_KEY=$CSRF_KEY|" .env
else
    echo "CSRF_SECRET_KEY=$CSRF_KEY" >> .env
fi

# Update x402 admin key
if grep -q "^X402_ADMIN_KEY=" .env; then
    sed -i.tmp "s|^X402_ADMIN_KEY=.*|X402_ADMIN_KEY=$X402_KEY|" .env
else
    echo "X402_ADMIN_KEY=$X402_KEY" >> .env
fi

# Update JWT secret if it's the default
if grep -q "^JWT_SECRET=dev_secret_key_change_in_production" .env; then
    sed -i.tmp "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_KEY|" .env
elif ! grep -q "^JWT_SECRET=" .env; then
    echo "JWT_SECRET=$JWT_KEY" >> .env
fi

# Clean up temp files
rm -f .env.tmp

echo "✅ Updated .env with secure keys"
echo ""

echo "=============================================="
echo "Configuration Status"
echo "=============================================="
echo ""
echo "✅ CONFIGURED (Generated Secure Values):"
echo "   - CSRF_SECRET_KEY: ${#CSRF_KEY} characters"
echo "   - X402_ADMIN_KEY: ${#X402_KEY} characters"
echo "   - JWT_SECRET: ${#JWT_KEY} characters"
echo ""
echo "⚠️  MANUAL CONFIGURATION STILL REQUIRED:"
echo ""
echo "1. STRIPE API KEYS"
echo "   Get from: https://dashboard.stripe.com/test/apikeys"
echo "   Set in .env:"
echo "   - STRIPE_SECRET_KEY=sk_test_..."
echo "   - STRIPE_PUBLISHABLE_KEY=pk_test_..."
echo ""
echo "2. x402 PAYMENT ADDRESSES"
echo "   Generate wallet addresses for:"
echo "   - Base Network (0x...)"
echo "   - Ethereum Mainnet (0x...)"
echo "   - Solana Mainnet (base58 address)"
echo "   Set in .env:"
echo "   - X402_BASE_PAYMENT_ADDRESS=0x..."
echo "   - X402_ETHEREUM_PAYMENT_ADDRESS=0x..."
echo "   - X402_SOLANA_PAYMENT_ADDRESS=..."
echo ""
echo "3. RPC API KEYS"
echo "   Sign up for:"
echo "   - Alchemy: https://www.alchemy.com/"
echo "   - QuickNode: https://www.quicknode.com/"
echo "   - Helius (Solana): https://www.helius.dev/"
echo "   Set in .env:"
echo "   - X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"
echo "   - X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
echo "   - X402_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
echo ""
echo "=============================================="
echo "Next Steps"
echo "=============================================="
echo ""
echo "1. Install Python 3.11+ (CRITICAL - see PYTHON_UPGRADE.md)"
echo "2. Configure manual values above"
echo "3. Test server startup:"
echo "   python -m uvicorn api.main:app --host 127.0.0.1 --port 8000"
echo ""
echo "✅ Development environment configuration complete!"
echo ""
