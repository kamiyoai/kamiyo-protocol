#!/bin/bash
#
# KAMIYO Production Secrets Generator
#
# Generates cryptographically secure random secrets for production deployment.
# DO NOT commit the output to version control!
#
# Usage:
#   bash scripts/generate_production_secrets.sh > .env.production.template
#   # Then edit .env.production.template and fill in remaining values
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}"
echo "========================================================================"
echo "  KAMIYO Production Secrets Generator"
echo "========================================================================"
echo -e "${NC}"
echo ""
echo -e "${YELLOW}⚠️  WARNING: The output contains sensitive secrets!${NC}"
echo -e "${YELLOW}   - DO NOT commit to version control${NC}"
echo -e "${YELLOW}   - Store securely in a password manager${NC}"
echo -e "${YELLOW}   - Save to .env.production (which is in .gitignore)${NC}"
echo ""
echo -e "${CYAN}Press Enter to generate secrets, or Ctrl+C to cancel...${NC}"
read

echo ""
echo -e "${BOLD}${GREEN}Generating production secrets...${NC}"
echo ""

# Function to generate a secure random secret
generate_secret() {
    openssl rand -hex 32
}

# Generate all required secrets
NEXTAUTH_SECRET=$(generate_secret)
CSRF_SECRET_KEY=$(generate_secret)
JWT_SECRET=$(generate_secret)
MCP_JWT_SECRET=$(generate_secret)
X402_ADMIN_KEY=$(generate_secret)

echo -e "${GREEN}✅ Secrets generated successfully!${NC}"
echo ""
echo -e "${BOLD}${CYAN}========================================================================"
echo "  Copy the following to your .env.production file:"
echo "========================================================================"
echo -e "${NC}"
echo ""

cat << EOF
#==============================================================================
# KAMIYO PRODUCTION ENVIRONMENT CONFIGURATION
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
#
# ⚠️  CRITICAL SECURITY WARNING:
#   - DO NOT commit this file to version control!
#   - Store securely and restrict access
#   - Rotate secrets every 90 days
#==============================================================================

#------------------------------------------------------------------------------
# ENVIRONMENT
#------------------------------------------------------------------------------
ENVIRONMENT=production

#------------------------------------------------------------------------------
# CORE AUTHENTICATION SECRETS (Auto-Generated)
#------------------------------------------------------------------------------

# NextAuth.js session signing secret (32+ chars)
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}

# CSRF protection secret (32+ chars)
CSRF_SECRET_KEY=${CSRF_SECRET_KEY}

# JWT token signing secret (32+ chars)
JWT_SECRET=${JWT_SECRET}

# MCP JWT secret (32+ chars)
MCP_JWT_SECRET=${MCP_JWT_SECRET}

#------------------------------------------------------------------------------
# STRIPE CONFIGURATION (REQUIRED - Fill in manually)
#------------------------------------------------------------------------------

# Get these from: https://dashboard.stripe.com/apikeys
# IMPORTANT: Use LIVE keys (sk_live_*, pk_live_*) for production!
STRIPE_SECRET_KEY=sk_live_PASTE_YOUR_LIVE_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_PASTE_YOUR_LIVE_PUBLISHABLE_KEY_HERE

# Get from: https://dashboard.stripe.com/webhooks
STRIPE_WEBHOOK_SECRET=whsec_PASTE_YOUR_WEBHOOK_SECRET_HERE

# Stripe Price IDs - Create in dashboard: https://dashboard.stripe.com/products
STRIPE_PRICE_ID_PRO=price_XXXXX
STRIPE_PRICE_ID_TEAM=price_XXXXX
STRIPE_PRICE_ID_ENTERPRISE=price_XXXXX

#------------------------------------------------------------------------------
# X402 PAYMENT FACILITATOR (Auto-Generated Admin Key)
#------------------------------------------------------------------------------

# x402 admin API key (32+ chars)
X402_ADMIN_KEY=${X402_ADMIN_KEY}

#------------------------------------------------------------------------------
# X402 PAYMENT ADDRESSES (REQUIRED - Fill in manually)
#------------------------------------------------------------------------------

# CRITICAL: Use PRODUCTION wallets only!
# Generate new secure wallets for production - NEVER reuse dev wallets

# Base network USDC payment address (0x...)
X402_BASE_PAYMENT_ADDRESS=0xYOUR_PRODUCTION_BASE_WALLET_ADDRESS_HERE

# Ethereum mainnet USDC payment address (0x...)
X402_ETHEREUM_PAYMENT_ADDRESS=0xYOUR_PRODUCTION_ETH_WALLET_ADDRESS_HERE

# Solana mainnet USDC payment address (Base58)
X402_SOLANA_PAYMENT_ADDRESS=YOUR_PRODUCTION_SOLANA_WALLET_ADDRESS_HERE

#------------------------------------------------------------------------------
# X402 RPC ENDPOINTS (REQUIRED - Fill in manually)
#------------------------------------------------------------------------------

# CRITICAL: Use MAINNET endpoints only!
# Get API keys from: Alchemy, Infura, or other RPC provider

# Base mainnet RPC endpoint
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Ethereum mainnet RPC endpoint
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Solana mainnet RPC endpoint
X402_SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

#------------------------------------------------------------------------------
# X402 PAYMENT CONFIGURATION
#------------------------------------------------------------------------------

# Cost per API call in USDC (default: $0.001)
X402_USDC_PER_REQUEST=0.001

# Minimum payment amount in USDC (default: $1.00)
X402_MIN_PAYMENT_USDC=1.0

# Token validity period in hours (default: 24)
X402_TOKEN_EXPIRY_HOURS=24

#------------------------------------------------------------------------------
# DATABASE (REQUIRED - Fill in manually)
#------------------------------------------------------------------------------

# PostgreSQL connection URL for production
# Format: postgresql://user:password@host:port/database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kamiyo_production

#------------------------------------------------------------------------------
# REDIS CACHE (RECOMMENDED - Fill in manually)
#------------------------------------------------------------------------------

# Redis connection URL for rate limiting and caching
# Format: redis://user:password@host:port
REDIS_URL=redis://USER:PASSWORD@HOST:6379

#------------------------------------------------------------------------------
# MONITORING (OPTIONAL - Fill in manually)
#------------------------------------------------------------------------------

# Sentry DSN for error tracking
# Get from: https://sentry.io/settings/projects/
SENTRY_DSN=

#------------------------------------------------------------------------------
# CORS & SECURITY
#------------------------------------------------------------------------------

# Allowed origins (comma-separated, NO localhost in production!)
ALLOWED_ORIGINS=https://kamiyo.ai,https://api.kamiyo.ai

#------------------------------------------------------------------------------
# LOGGING
#------------------------------------------------------------------------------

LOG_LEVEL=INFO
LOG_FORMAT=json

#==============================================================================
# NEXT STEPS:
#==============================================================================
# 1. Fill in all "FILL_IN_MANUALLY" placeholders above
# 2. Save this file as .env.production (it's in .gitignore)
# 3. Run validation: python3 scripts/verify_production_secrets.py
# 4. Fix any validation errors
# 5. Deploy to production
#
# SECURITY REMINDERS:
# - Store this file securely (password manager, secrets vault)
# - Never commit to git
# - Rotate secrets every 90 days
# - Limit access to authorized personnel only
#==============================================================================
EOF

echo ""
echo -e "${BOLD}${GREEN}========================================================================"
echo "  Generation Complete!"
echo "========================================================================"
echo -e "${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  1. ${YELLOW}Review the output above${NC}"
echo -e "  2. ${YELLOW}Fill in Stripe keys, payment addresses, and RPC URLs${NC}"
echo -e "  3. ${YELLOW}Save to .env.production${NC}"
echo -e "  4. ${YELLOW}Run validation: ${BOLD}python3 scripts/verify_production_secrets.py${NC}"
echo ""
echo -e "${RED}⚠️  SECURITY WARNING: Protect the generated secrets!${NC}"
echo ""
