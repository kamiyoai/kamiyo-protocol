#!/bin/bash
# Deploy Mitama Switchboard Oracle
set -e

echo "==================================="
echo "  Mitama Switchboard Oracle Deploy"
echo "==================================="

# Check dependencies
command -v docker >/dev/null 2>&1 || { echo "Docker required"; exit 1; }
command -v sb >/dev/null 2>&1 || { echo "Switchboard CLI required: npm i -g @switchboard-xyz/cli"; exit 1; }

# Build container
echo "Building Docker container..."
docker build -t mitama-oracle .

# Deploy to Switchboard
echo "Creating Switchboard function..."
FUNCTION_PUBKEY=$(sb solana function create \
  --name "mitama-quality-oracle" \
  --container mitama-oracle \
  --keypair ~/.config/solana/id.json \
  --cluster mainnet-beta \
  --json | jq -r '.functionKey')

echo ""
echo "Function created: $FUNCTION_PUBKEY"
echo ""

# Register with Mitama
echo "Registering with Mitama Oracle Registry..."
cd ../..
RPC_URL=https://api.mainnet-beta.solana.com \
npx ts-node scripts/add-oracle.ts "$FUNCTION_PUBKEY" 100

echo ""
echo "==================================="
echo "  Deployment Complete"
echo "==================================="
echo "Function: $FUNCTION_PUBKEY"
