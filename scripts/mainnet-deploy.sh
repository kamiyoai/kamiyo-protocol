#!/bin/bash
# Mitama Mainnet Deployment Script
# Run after mainnet-predeploy-check.sh passes

set -e

echo "=== Mitama Mainnet Deployment ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROGRAM_ID="DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km"
WALLET_PATH="../token-launch/wallets/creator.json"
HELIUS_KEY="${HELIUS_API_KEY:-}"
RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_KEY"

# Verify wallet exists
if [ ! -f "$WALLET_PATH" ]; then
    echo -e "${RED}ERROR: Wallet not found at $WALLET_PATH${NC}"
    exit 1
fi

# Get wallet pubkey
PUBKEY=$(solana-keygen pubkey "$WALLET_PATH" 2>/dev/null)
echo -e "${CYAN}Deployer:${NC} $PUBKEY"

# Check balance
BALANCE=$(solana balance "$PUBKEY" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo "0")
echo -e "${CYAN}Balance:${NC} $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l 2>/dev/null || echo 1) )); then
    echo -e "${RED}ERROR: Need at least 2 SOL for deployment (got $BALANCE)${NC}"
    exit 1
fi

# Confirm deployment
echo ""
echo -e "${YELLOW}=== MAINNET DEPLOYMENT ===${NC}"
echo ""
echo "This will deploy Mitama to Solana mainnet with:"
echo "  - Program ID: $PROGRAM_ID"
echo "  - Upgrade authority: $PUBKEY (NOT frozen)"
echo "  - TVL cap: 10 SOL (enforced off-chain initially)"
echo ""
echo -e "${RED}WARNING: This is a MAINNET deployment. Real funds at risk.${NC}"
echo ""
read -p "Type 'DEPLOY' to confirm: " CONFIRM

if [ "$CONFIRM" != "DEPLOY" ]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "=== Step 1: Deploy Program ==="

# Deploy with upgrade authority retained
anchor deploy \
    --provider.cluster mainnet \
    --provider.wallet "$WALLET_PATH" \
    --program-name mitama

echo ""
echo -e "${GREEN}Program deployed!${NC}"

# Verify deployment
echo ""
echo "=== Step 2: Verify Deployment ==="
solana program show "$PROGRAM_ID" --url "$RPC_URL"

echo ""
echo "=== Step 3: Initialize Registry ==="
echo ""
echo "Registry initialization should be done via TypeScript client:"
echo ""
echo "  cd services/api"
echo "  SOLANA_RPC_URL=\"$RPC_URL\" npx tsx scripts/init-registry-mainnet.ts"
echo ""
echo "The init script should configure:"
echo "  - min_stake: 100000000 (0.1 SOL)"
echo "  - min_signal_confidence: 50"
echo "  - paused: false"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo -e "${GREEN}Mitama deployed to mainnet!${NC}"
echo ""
echo "Program ID: $PROGRAM_ID"
echo "Explorer: https://solscan.io/account/$PROGRAM_ID"
echo ""
echo "Next steps:"
echo "1. Initialize registry (see above)"
echo "2. Update merkle tree with genesis agents"
echo "3. Announce deployment"
echo "4. Monitor for 48 hours"
echo ""
echo -e "${YELLOW}IMPORTANT: Keep upgrade authority secure until freezing (6+ months).${NC}"
