#!/bin/bash

#==============================================================================
# KAMIYO Solana Development Environment Verification Script
# Phase 2, Week 1 - Task 2.1
#==============================================================================
# This script verifies that all required Solana development tools are installed
# and properly configured. It checks:
# 1. Rust installation
# 2. Solana CLI installation
# 3. Solana network configuration (devnet)
# 4. Anchor Framework installation
# 5. SPL Token CLI installation
# 6. Devnet wallet existence
# 7. Wallet balance (>= 1 SOL)
# 8. Anchor workspace initialization
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#==============================================================================

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check marks
CHECK="✅"
CROSS="❌"

# Counter for passed checks
PASSED=0
TOTAL=8

echo ""
echo "=========================================="
echo "  KAMIYO Solana Setup Verification"
echo "=========================================="
echo ""

#==============================================================================
# Helper Functions
#==============================================================================

check_pass() {
    echo -e "${GREEN}${CHECK}${NC} $1"
    PASSED=$((PASSED + 1))
}

check_fail() {
    echo -e "${RED}${CROSS}${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

#==============================================================================
# Check 1: Rust Installation
#==============================================================================

echo -n "Checking Rust installation... "
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    check_pass "Rust installed (version $RUST_VERSION)"
else
    check_fail "Rust not installed"
    echo "   Install with: bash scripts/setup_solana_dev.sh"
fi

#==============================================================================
# Check 2: Solana CLI Installation
#==============================================================================

echo -n "Checking Solana CLI installation... "
if command -v solana &> /dev/null; then
    SOLANA_VERSION=$(solana --version | awk '{print $2}')

    # Check version (require 1.18.0+)
    MAJOR=$(echo "$SOLANA_VERSION" | cut -d. -f1)
    MINOR=$(echo "$SOLANA_VERSION" | cut -d. -f2)

    if [ "$MAJOR" -ge 1 ] && [ "$MINOR" -ge 18 ]; then
        check_pass "Solana CLI installed (version $SOLANA_VERSION)"
    else
        check_fail "Solana CLI version $SOLANA_VERSION is too old (require 1.18.0+)"
        echo "   Upgrade with: bash scripts/setup_solana_dev.sh"
    fi
else
    check_fail "Solana CLI not installed"
    echo "   Install with: bash scripts/setup_solana_dev.sh"
fi

#==============================================================================
# Check 3: Solana Network Configuration
#==============================================================================

echo -n "Checking Solana network configuration... "
if command -v solana &> /dev/null; then
    CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')

    if [[ "$CLUSTER" == *"devnet"* ]]; then
        check_pass "Connected to devnet"
    else
        check_fail "Not connected to devnet (current: $CLUSTER)"
        echo "   Run: solana config set --url devnet"
    fi
else
    check_fail "Solana CLI not available"
fi

#==============================================================================
# Check 4: Anchor Framework Installation
#==============================================================================

echo -n "Checking Anchor Framework installation... "
if command -v anchor &> /dev/null; then
    ANCHOR_VERSION=$(anchor --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)

    if [ -n "$ANCHOR_VERSION" ]; then
        # Check version (require 0.30.0+)
        MINOR=$(echo "$ANCHOR_VERSION" | cut -d. -f2)

        if [ "$MINOR" -ge 30 ]; then
            check_pass "Anchor CLI installed (version $ANCHOR_VERSION)"
        else
            check_fail "Anchor CLI version $ANCHOR_VERSION is too old (require 0.30.0+)"
            echo "   Upgrade with: bash scripts/setup_solana_dev.sh"
        fi
    else
        check_fail "Anchor CLI version could not be determined"
    fi
else
    check_fail "Anchor CLI not installed"
    echo "   Install with: bash scripts/setup_solana_dev.sh"
fi

#==============================================================================
# Check 5: SPL Token CLI Installation
#==============================================================================

echo -n "Checking SPL Token CLI installation... "
if command -v spl-token &> /dev/null; then
    SPL_VERSION=$(spl-token --version | awk '{print $2}')
    check_pass "SPL Token CLI installed (version $SPL_VERSION)"
else
    check_fail "SPL Token CLI not installed"
    echo "   Install with: bash scripts/setup_solana_dev.sh"
fi

#==============================================================================
# Check 6: Devnet Wallet Existence
#==============================================================================

echo -n "Checking devnet wallet... "
DEVNET_WALLET="$HOME/.config/solana/devnet.json"

if [ -f "$DEVNET_WALLET" ]; then
    check_pass "Devnet wallet exists ($DEVNET_WALLET)"
else
    check_fail "Devnet wallet not found"
    echo "   Create with: solana-keygen new --outfile ~/.config/solana/devnet.json"

    # Offer to create wallet
    log_info "Creating devnet wallet..."
    mkdir -p "$HOME/.config/solana"

    if command -v solana-keygen &> /dev/null; then
        solana-keygen new --outfile "$DEVNET_WALLET" --no-bip39-passphrase --force > /dev/null 2>&1

        if [ -f "$DEVNET_WALLET" ]; then
            log_info "Devnet wallet created successfully"
            PASSED=$((PASSED + 1))
        else
            log_warning "Failed to create devnet wallet"
        fi
    fi
fi

#==============================================================================
# Check 7: Wallet Balance
#==============================================================================

echo -n "Checking wallet balance... "
if command -v solana &> /dev/null && [ -f "$DEVNET_WALLET" ]; then
    # Set keypair to devnet wallet for this check
    solana config set --keypair "$DEVNET_WALLET" > /dev/null 2>&1

    BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')

    if [ -n "$BALANCE" ]; then
        # Convert balance to integer (remove decimals for comparison)
        BALANCE_INT=$(echo "$BALANCE" | awk '{print int($1)}')

        if [ "$BALANCE_INT" -ge 1 ]; then
            check_pass "Wallet has sufficient balance ($BALANCE SOL)"
        else
            check_fail "Wallet balance too low ($BALANCE SOL, need >= 1 SOL)"
            echo "   Request airdrop with: solana airdrop 2"

            # Offer to request airdrop
            log_info "Requesting devnet airdrop (2 SOL)..."
            solana config set --url devnet > /dev/null 2>&1

            AIRDROP_RESULT=$(solana airdrop 2 2>&1)

            if [[ "$AIRDROP_RESULT" == *"Error"* ]] || [[ "$AIRDROP_RESULT" == *"error"* ]]; then
                log_warning "Airdrop failed (rate limited or network issue)"
                log_info "Try again later: solana airdrop 2"
            else
                sleep 2  # Wait for confirmation
                NEW_BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
                log_info "Airdrop successful! New balance: $NEW_BALANCE SOL"
                PASSED=$((PASSED + 1))
            fi
        fi
    else
        check_fail "Could not retrieve wallet balance"
        echo "   Ensure Solana CLI is connected to devnet: solana config set --url devnet"
    fi
else
    check_fail "Cannot check balance (Solana CLI or wallet not available)"
fi

#==============================================================================
# Check 8: Anchor Workspace Initialization
#==============================================================================

echo -n "Checking Anchor workspace... "
PROJECT_ROOT="/Users/dennisgoslar/Projekter/kamiyo"
SOLANA_PROGRAMS_DIR="$PROJECT_ROOT/solana-programs"
ANCHOR_TOML="$SOLANA_PROGRAMS_DIR/Anchor.toml"

if [ -f "$ANCHOR_TOML" ]; then
    check_pass "Anchor workspace initialized"
else
    check_fail "Anchor workspace not initialized"

    # Offer to initialize workspace
    if command -v anchor &> /dev/null; then
        log_info "Initializing Anchor workspace..."

        mkdir -p "$SOLANA_PROGRAMS_DIR"
        cd "$SOLANA_PROGRAMS_DIR"

        # Initialize Anchor workspace (suppress output)
        anchor init kamiyo-programs --javascript > /dev/null 2>&1

        # Move contents up one level (anchor init creates subdirectory)
        if [ -d "kamiyo-programs" ]; then
            mv kamiyo-programs/* . 2>/dev/null
            mv kamiyo-programs/.* . 2>/dev/null || true
            rmdir kamiyo-programs 2>/dev/null || true
        fi

        # Create Anchor.toml with proper configuration
        cat > "$ANCHOR_TOML" <<EOF
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.devnet]
kamiyo_token = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
kamiyo_staking = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
kamiyo_airdrop = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
kamiyo_vesting = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "$DEVNET_WALLET"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
EOF

        # Create program directories
        mkdir -p programs/kamiyo-token
        mkdir -p programs/kamiyo-staking
        mkdir -p programs/kamiyo-airdrop
        mkdir -p programs/kamiyo-vesting

        if [ -f "$ANCHOR_TOML" ]; then
            log_info "Anchor workspace initialized successfully"
            PASSED=$((PASSED + 1))
        else
            log_warning "Failed to initialize Anchor workspace"
        fi
    else
        log_warning "Cannot initialize workspace (Anchor CLI not available)"
    fi
fi

#==============================================================================
# Summary
#==============================================================================

echo ""
echo "=========================================="
echo "  Verification Summary"
echo "=========================================="
echo ""

if [ $PASSED -eq $TOTAL ]; then
    echo -e "${GREEN}${CHECK} All checks passed! ($PASSED/$TOTAL)${NC}"
    echo ""
    echo "Your Solana development environment is ready!"
    echo ""
    echo "Next steps:"
    echo "  1. Review Anchor workspace: cd $SOLANA_PROGRAMS_DIR"
    echo "  2. Start developing programs in: programs/"
    echo "  3. Build programs: anchor build"
    echo "  4. Deploy to devnet: anchor deploy"
    echo ""
    exit 0
else
    FAILED=$((TOTAL - PASSED))
    echo -e "${RED}${CROSS} Some checks failed ($PASSED/$TOTAL passed, $FAILED failed)${NC}"
    echo ""
    echo "Please fix the failed checks and run this script again."
    echo ""
    echo "Quick fixes:"
    echo "  - Install missing tools: bash scripts/setup_solana_dev.sh"
    echo "  - Connect to devnet: solana config set --url devnet"
    echo "  - Request airdrop: solana airdrop 2"
    echo ""
    exit 1
fi
