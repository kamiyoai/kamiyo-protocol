#!/bin/bash
# Phase 5 Mainnet Deployment Script
# Deploys governance and transfer-hook programs to Solana mainnet
#
# Prerequisites:
# - ~5 SOL in deployer wallet for rent + fees
# - Programs built: anchor build -p kamiyo_governance && anchor build -p kamiyo_transfer_hook
#
# Usage: ./scripts/deploy-phase5-mainnet.sh

set -e

# Configuration
HELIUS_RPC="https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be"
KAMIYO_MINT="Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump"

# Use DEV wallet from token launch (has 6+ SOL)
DEV_WALLET="./token-launch/wallets/creator.json"

# Program IDs (from generated keypairs)
GOVERNANCE_ID="8y8cKZ7cUapuJ4eNHYKzX9yWBbmwZtAUSMDR5ELRTtBi"
TRANSFER_HOOK_ID="4p9eHUGsx93XC5i6y9fL3cbTs5Zpfqidjjd1e41FQaU6"

# Existing program IDs for reference
STAKING_ID="9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N"
ESCROW_ID="AbrWhvNBBL7ZUZ3AZ6ASgN74JiTrn8Gtctrb7uC9Mzbu"
MITAMA_ID="DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km"

echo "=========================================="
echo "KAMIYO Phase 5 Mainnet Deployment"
echo "=========================================="
echo ""

# Set RPC and keypair
echo "[1/6] Setting Solana config to mainnet..."
solana config set --url "$HELIUS_RPC"
solana config set --keypair "$DEV_WALLET"
echo ""

# Check balance
echo "[2/6] Checking deployer balance..."
echo "Deployer wallet: $(solana address)"
BALANCE=$(solana balance | awk '{print $1}')
echo "Current balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 5" | bc -l) )); then
    echo "ERROR: Insufficient balance. Need ~5 SOL for deployment."
    echo "Send SOL to: $(solana address)"
    exit 1
fi
echo ""

# Deploy governance
echo "[3/6] Deploying governance program..."
echo "Program ID: $GOVERNANCE_ID"
solana program deploy \
    --program-id target/deploy/kamiyo_governance-keypair.json \
    target/deploy/kamiyo_governance.so \
    --with-compute-unit-price 50000

echo "Governance deployed successfully!"
echo ""

# Deploy transfer hook
echo "[4/6] Deploying transfer-hook program..."
echo "Program ID: $TRANSFER_HOOK_ID"
solana program deploy \
    --program-id target/deploy/kamiyo_transfer_hook-keypair.json \
    target/deploy/kamiyo_transfer_hook.so \
    --with-compute-unit-price 50000

echo "Transfer hook deployed successfully!"
echo ""

# Verify deployments
echo "[5/6] Verifying deployments..."
echo "Governance program:"
solana program show $GOVERNANCE_ID
echo ""
echo "Transfer hook program:"
solana program show $TRANSFER_HOOK_ID
echo ""

echo "[6/6] Deployment complete!"
echo ""
echo "=========================================="
echo "NEXT STEPS - Initialize Programs"
echo "=========================================="
echo ""
echo "1. Initialize governance:"
echo "   - Run: npx ts-node scripts/init-governance-mainnet.ts"
echo ""
echo "2. Initialize transfer hook:"
echo "   - Run: npx ts-node scripts/init-transfer-hook-mainnet.ts"
echo ""
echo "3. Add burn exemptions for:"
echo "   - Staking vault"
echo "   - Escrow vault"
echo "   - Treasury vault"
echo "   - DEX pools (Raydium, Orca, Jupiter)"
echo ""
echo "Program IDs:"
echo "  Governance:    $GOVERNANCE_ID"
echo "  Transfer Hook: $TRANSFER_HOOK_ID"
echo ""
echo "=========================================="
