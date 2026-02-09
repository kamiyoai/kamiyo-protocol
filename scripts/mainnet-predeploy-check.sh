#!/bin/bash
# Mitama Mainnet Pre-Deploy Checklist
# Run this before deploying to mainnet

set -e

echo "=== Mitama Mainnet Pre-Deploy Checklist ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS="${GREEN}[PASS]${NC}"
FAIL="${RED}[FAIL]${NC}"
WARN="${YELLOW}[WARN]${NC}"

ERRORS=0

# 1. Check program builds
echo "1. Checking program builds..."
if anchor build 2>/dev/null; then
    echo -e "   $PASS Program builds successfully"
else
    echo -e "   $FAIL Program build failed"
    ((ERRORS++))
fi

# 2. Check program binary exists
echo "2. Checking program binary..."
if [ -f "target/deploy/mitama.so" ]; then
    echo -e "   $PASS mitama.so exists"
    SIZE=$(ls -la target/deploy/mitama.so | awk '{print $5}')
    echo "   Binary size: $SIZE bytes"
else
    echo -e "   $FAIL mitama.so not found"
    ((ERRORS++))
fi

# 3. Verify program hash matches devnet
echo "3. Checking devnet program hash..."
DEVNET_PROGRAM="DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km"
LOCAL_HASH=$(sha256sum target/deploy/mitama.so 2>/dev/null | cut -d' ' -f1 || echo "none")
echo "   Local binary hash: ${LOCAL_HASH:0:16}..."
echo -e "   $WARN Manually verify devnet program data matches"

# 4. Check wallet configuration
echo "4. Checking wallet configuration..."
WALLET_PATH="../token-launch/wallets/creator.json"
if [ -f "$WALLET_PATH" ]; then
    echo -e "   $PASS Wallet file exists at $WALLET_PATH"
    # Get pubkey without exposing secret
    PUBKEY=$(solana-keygen pubkey "$WALLET_PATH" 2>/dev/null || echo "error")
    if [ "$PUBKEY" != "error" ]; then
        echo "   Wallet pubkey: $PUBKEY"
    fi
else
    echo -e "   $FAIL Wallet file not found"
    ((ERRORS++))
fi

# 5. Check RPC endpoint
echo "5. Checking mainnet RPC..."
RPC_URL="${SOLANA_RPC_URL:-}"
if [ -z "$RPC_URL" ]; then
    if [ -n "${HELIUS_API_KEY:-}" ]; then
        RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
    else
        RPC_URL="https://api.mainnet-beta.solana.com"
        echo -e "   $WARN SOLANA_RPC_URL/HELIUS_API_KEY not set; using public mainnet RPC"
    fi
fi
if curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "ok"; then
    echo -e "   $PASS Mainnet RPC is healthy"
else
    echo -e "   $WARN RPC health check failed (may still work)"
fi

# 6. Check wallet balance
echo "6. Checking wallet balance on mainnet..."
if [ "$PUBKEY" != "error" ] && [ -n "$PUBKEY" ]; then
    BALANCE=$(solana balance "$PUBKEY" --url mainnet-beta 2>/dev/null | awk '{print $1}' || echo "0")
    echo "   Balance: $BALANCE SOL"
    if (( $(echo "$BALANCE < 1" | bc -l 2>/dev/null || echo 1) )); then
        echo -e "   $WARN Need at least 1 SOL for deployment"
    else
        echo -e "   $PASS Sufficient balance for deployment"
    fi
else
    echo -e "   $WARN Could not check balance"
fi

# 7. Check Anchor.toml mainnet config
echo "7. Checking Anchor.toml mainnet config..."
if grep -q "\[programs.mainnet\]" Anchor.toml; then
    MAINNET_ID=$(grep -A1 "\[programs.mainnet\]" Anchor.toml | grep mitama | cut -d'"' -f2)
    echo "   Mainnet program ID: $MAINNET_ID"
    echo -e "   $PASS Mainnet config present"
else
    echo -e "   $FAIL No mainnet config in Anchor.toml"
    ((ERRORS++))
fi

# 8. Check circuits are built
echo "8. Checking ZK circuits..."
CIRCUITS_PATH="circuits/build/mitama"
if [ -f "$CIRCUITS_PATH/agent_identity_final.zkey" ]; then
    echo -e "   $PASS agent_identity circuit ready"
else
    echo -e "   $FAIL agent_identity circuit not built"
    ((ERRORS++))
fi
if [ -f "$CIRCUITS_PATH/swarm_vote_final.zkey" ]; then
    echo -e "   $PASS swarm_vote circuit ready"
else
    echo -e "   $WARN swarm_vote circuit not built"
fi

# 9. Security checks
echo "9. Security checks..."
if grep -r "hardcoded\|localhost\|127\.0\.0\.1" programs/mitama/src/*.rs 2>/dev/null | grep -v "^Binary"; then
    echo -e "   $WARN Found potential hardcoded values in program"
else
    echo -e "   $PASS No obvious hardcoded values"
fi

# Summary
echo ""
echo "=== Summary ==="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All critical checks passed. Ready for mainnet deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Fund wallet with mainnet SOL"
    echo "2. Run: ./scripts/mainnet-deploy.sh"
else
    echo -e "${RED}$ERRORS critical check(s) failed. Fix before deploying.${NC}"
    exit 1
fi
