#!/bin/bash
# Production Setup Script for KAMIYO x402 Infrastructure
# Guides through all manual configuration steps

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=====================================${NC}"
echo -e "${CYAN}KAMIYO x402 Production Setup${NC}"
echo -e "${CYAN}=====================================${NC}"
echo ""

# Check if running on macOS or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    OPEN_CMD="open"
else
    OPEN_CMD="xdg-open"
fi

# Function to generate secure key
generate_key() {
    openssl rand -base64 32
}

# ============================================
# STEP 1: Python Verifier Configuration
# ============================================
echo -e "${CYAN}=== Step 1: Python Verifier Configuration ===${NC}"
echo ""
echo "We need to configure environment variables in Render for the Python verifier."
echo ""

# Generate PYTHON_VERIFIER_KEY
echo -e "${GREEN}Generating PYTHON_VERIFIER_KEY...${NC}"
VERIFIER_KEY=$(generate_key)
echo -e "${YELLOW}PYTHON_VERIFIER_KEY=${VERIFIER_KEY}${NC}"
echo ""

# Save to file for reference
cat > .env.verifier.render <<EOF
# Python Verifier Environment Variables for Render
# Copy these to: https://dashboard.render.com > kamiyo-x402-verifier > Environment

PYTHON_VERIFIER_KEY=${VERIFIER_KEY}

# RPC Endpoints (get API keys from Alchemy/Infura)
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
X402_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Payment Addresses (your wallets where customers send USDC)
X402_BASE_PAYMENT_ADDRESS=0xYourBaseWalletAddress
X402_ETHEREUM_PAYMENT_ADDRESS=0xYourEthereumWalletAddress
X402_SOLANA_PAYMENT_ADDRESS=YourSolanaWalletAddress

# Monitoring (optional, configure after Sentry setup)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# These are already set in render.yaml:
# X402_BASE_CONFIRMATIONS=6
# X402_ETHEREUM_CONFIRMATIONS=12
# X402_SOLANA_CONFIRMATIONS=32
# X402_MIN_PAYMENT_USD=0.10
EOF

echo -e "${GREEN}✓ Generated .env.verifier.render${NC}"
echo ""

read -p "Do you want to open Render dashboard to configure the verifier? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $OPEN_CMD "https://dashboard.render.com" 2>/dev/null || echo "Please open: https://dashboard.render.com"
fi

echo ""
echo -e "${YELLOW}Manual Steps:${NC}"
echo "1. Go to Render dashboard: https://dashboard.render.com"
echo "2. Find service: kamiyo-x402-verifier"
echo "3. Click 'Environment' tab"
echo "4. Add the variables from .env.verifier.render"
echo "5. Get Alchemy API key from: https://www.alchemy.com/"
echo "6. Replace YOUR_ALCHEMY_KEY with your actual key"
echo "7. Replace wallet addresses with your actual wallets"
echo "8. Click 'Save Changes'"
echo ""

read -p "Press ENTER when verifier environment variables are configured..."
echo ""

# Also add to frontend service
echo -e "${GREEN}Generating frontend environment variables...${NC}"
cat > .env.frontend.render <<EOF
# Frontend Environment Variables for Render
# Copy these to: https://dashboard.render.com > kamiyo-frontend > Environment

# Python Verifier Connection (auto-configured, but add key)
PYTHON_VERIFIER_KEY=${VERIFIER_KEY}

# Monitoring (configure after Sentry setup)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Alert Email (configure after Resend setup)
RESEND_API_KEY=re_your_resend_key
ALERT_EMAIL=dev@kamiyo.ai
FROM_EMAIL=alerts@kamiyo.ai
EOF

echo -e "${GREEN}✓ Generated .env.frontend.render${NC}"
echo ""
echo "Also configure these in kamiyo-frontend service in Render."
echo ""

read -p "Press ENTER to continue to Sentry setup..."

# ============================================
# STEP 2: Sentry Setup
# ============================================
echo ""
echo -e "${CYAN}=== Step 2: Sentry Error Tracking Setup ===${NC}"
echo ""

echo "Sentry provides error tracking and performance monitoring."
echo ""

read -p "Do you want to open Sentry signup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $OPEN_CMD "https://sentry.io/signup/" 2>/dev/null || echo "Please open: https://sentry.io/signup/"
fi

echo ""
echo -e "${YELLOW}Sentry Setup Steps:${NC}"
echo "1. Go to: https://sentry.io/signup/"
echo "2. Create account (free tier: 5,000 errors/month)"
echo "3. Create organization: 'KAMIYO'"
echo "4. Create project: 'x402-infrastructure'"
echo "5. Select platform: 'Next.js'"
echo "6. Copy the DSN (format: https://xxxxx@xxxxx.ingest.sentry.io/xxxxx)"
echo ""

read -p "Paste your Sentry DSN: " SENTRY_DSN
echo ""

if [ -z "$SENTRY_DSN" ]; then
    echo -e "${YELLOW}⚠ No DSN provided. You can configure it later.${NC}"
    SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"
else
    echo -e "${GREEN}✓ Sentry DSN: ${SENTRY_DSN}${NC}"
fi

# Update env files
sed -i.bak "s|SENTRY_DSN=.*|SENTRY_DSN=${SENTRY_DSN}|g" .env.verifier.render
sed -i.bak "s|SENTRY_DSN=.*|SENTRY_DSN=${SENTRY_DSN}|g" .env.frontend.render
sed -i.bak "s|NEXT_PUBLIC_SENTRY_DSN=.*|NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}|g" .env.frontend.render
rm .env.verifier.render.bak .env.frontend.render.bak 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Updated environment files with Sentry DSN${NC}"
echo ""

# Add to local .env if exists
if [ -f .env ]; then
    if ! grep -q "SENTRY_DSN" .env; then
        echo "" >> .env
        echo "# Sentry Error Tracking" >> .env
        echo "SENTRY_DSN=${SENTRY_DSN}" >> .env
        echo "NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}" >> .env
        echo -e "${GREEN}✓ Added Sentry DSN to .env${NC}"
    fi
fi

echo "Now add this DSN to both Render services (verifier and frontend)"
echo ""

read -p "Press ENTER to continue to UptimeRobot setup..."

# ============================================
# STEP 3: UptimeRobot Monitoring Setup
# ============================================
echo ""
echo -e "${CYAN}=== Step 3: UptimeRobot Monitoring Setup ===${NC}"
echo ""

echo "UptimeRobot monitors your services and sends alerts when they're down."
echo ""

read -p "Do you want to open UptimeRobot signup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $OPEN_CMD "https://uptimerobot.com/signUp" 2>/dev/null || echo "Please open: https://uptimerobot.com/signUp"
fi

echo ""
echo -e "${YELLOW}UptimeRobot Setup Steps:${NC}"
echo ""
echo "1. Create account: https://uptimerobot.com/signUp"
echo "   (Free plan: 50 monitors, 5-minute intervals)"
echo ""
echo "2. Add Main Application Monitor:"
echo "   - Name: KAMIYO x402 - Main App"
echo "   - Type: HTTP(s)"
echo "   - URL: https://kamiyo.ai/api/v1/x402/health"
echo "   - Interval: 5 minutes"
echo "   - Timeout: 30 seconds"
echo ""
echo "3. Add Python Verifier Monitor:"
echo "   - Name: KAMIYO x402 - Python Verifier"
echo "   - Type: HTTP(s)"
echo "   - URL: https://kamiyo-x402-verifier.onrender.com/health"
echo "   - Interval: 5 minutes"
echo "   - Timeout: 30 seconds"
echo ""
echo "4. Configure Alert Contacts:"
echo "   - Add email: dev@kamiyo.ai"
echo "   - Enable notifications for down events"
echo ""

read -p "Press ENTER when UptimeRobot is configured..."

# ============================================
# STEP 4: Summary & Verification
# ============================================
echo ""
echo -e "${CYAN}=== Setup Summary ===${NC}"
echo ""

echo -e "${GREEN}✓ Generated Files:${NC}"
echo "  - .env.verifier.render (Python verifier variables)"
echo "  - .env.frontend.render (Frontend variables)"
echo ""

echo -e "${YELLOW}Environment Variables to Configure in Render:${NC}"
echo ""
echo "1. Python Verifier Service (kamiyo-x402-verifier):"
echo "   - PYTHON_VERIFIER_KEY (generated)"
echo "   - X402_BASE_RPC_URL (needs Alchemy key)"
echo "   - X402_ETHEREUM_RPC_URL (needs Alchemy key)"
echo "   - X402_SOLANA_RPC_URL (public RPC OK)"
echo "   - X402_BASE_PAYMENT_ADDRESS (your wallet)"
echo "   - X402_ETHEREUM_PAYMENT_ADDRESS (your wallet)"
echo "   - X402_SOLANA_PAYMENT_ADDRESS (your wallet)"
echo "   - SENTRY_DSN (configured)"
echo ""
echo "2. Frontend Service (kamiyo-frontend):"
echo "   - PYTHON_VERIFIER_KEY (same as verifier)"
echo "   - SENTRY_DSN (configured)"
echo "   - NEXT_PUBLIC_SENTRY_DSN (configured)"
echo ""

echo -e "${YELLOW}Services Configured:${NC}"
echo "  ${SENTRY_DSN:+✓} Sentry Error Tracking"
echo "  [ ] UptimeRobot Monitoring (manual setup)"
echo "  [ ] Render Environment Variables (manual setup)"
echo ""

echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo "1. Get Alchemy API key: https://www.alchemy.com/"
echo "2. Copy variables from .env.verifier.render to Render dashboard"
echo "3. Copy variables from .env.frontend.render to Render dashboard"
echo "4. Test verifier health: https://kamiyo-x402-verifier.onrender.com/health"
echo "5. Test main app health: https://kamiyo.ai/api/v1/x402/health"
echo "6. Run monitoring test: node scripts/test_monitoring.js"
echo ""

echo -e "${GREEN}Setup script complete!${NC}"
echo ""
echo "Generated files contain sensitive keys - do not commit them to git!"
echo "They are already in .gitignore"
