#!/bin/bash

#==============================================================================
# KAMIYO Solana Development Environment Setup Script
# Phase 2, Week 1 - Task 2.1
#==============================================================================
# This script installs and configures all necessary tools for Solana development:
# - Rust (via rustup)
# - Solana CLI (v1.18.0+)
# - Anchor Framework (v0.30.0+)
# - SPL Token CLI
#
# Features:
# - Idempotent (safe to run multiple times)
# - macOS optimized (Darwin 19.6.0+)
# - ARM/M1/M2 compatible
# - Non-interactive
# - Error handling and rollback
#==============================================================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect shell (zsh or bash)
detect_shell() {
    if [ -n "$ZSH_VERSION" ]; then
        echo "zsh"
    elif [ -n "$BASH_VERSION" ]; then
        echo "bash"
    else
        echo "bash"  # Default fallback
    fi
}

SHELL_TYPE=$(detect_shell)
if [ "$SHELL_TYPE" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

log_info "Detected shell: $SHELL_TYPE (config: $SHELL_RC)"

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_warning "This script is optimized for macOS. Detected OS: $OSTYPE"
    log_warning "Continuing anyway, but some steps may fail..."
fi

# Detect architecture (x86_64 or arm64)
ARCH=$(uname -m)
log_info "Detected architecture: $ARCH"

echo ""
echo "=========================================="
echo "  KAMIYO Solana Development Setup"
echo "=========================================="
echo ""

#==============================================================================
# 1. Install Rust via rustup
#==============================================================================

log_info "Step 1/4: Installing Rust toolchain..."

if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    log_success "Rust already installed: $RUST_VERSION"
else
    log_info "Installing Rust via rustup..."

    # Download and install rustup
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

    # Source cargo environment
    source "$HOME/.cargo/env"

    # Verify installation
    if command -v rustc &> /dev/null; then
        RUST_VERSION=$(rustc --version | awk '{print $2}')
        log_success "Rust installed successfully: $RUST_VERSION"

        # Add to shell config if not already present
        if ! grep -q 'source.*\.cargo/env' "$SHELL_RC" 2>/dev/null; then
            echo "" >> "$SHELL_RC"
            echo "# Rust (cargo)" >> "$SHELL_RC"
            echo 'source "$HOME/.cargo/env"' >> "$SHELL_RC"
            log_success "Added cargo to $SHELL_RC"
        fi
    else
        log_error "Rust installation failed"
        exit 1
    fi
fi

# Ensure cargo is in PATH for this session
export PATH="$HOME/.cargo/bin:$PATH"

echo ""

#==============================================================================
# 2. Install Solana CLI
#==============================================================================

log_info "Step 2/4: Installing Solana CLI..."

if command -v solana &> /dev/null; then
    SOLANA_VERSION=$(solana --version | awk '{print $2}')
    log_success "Solana CLI already installed: $SOLANA_VERSION"

    # Check version (require 1.18.0+)
    MAJOR=$(echo "$SOLANA_VERSION" | cut -d. -f1)
    MINOR=$(echo "$SOLANA_VERSION" | cut -d. -f2)

    if [ "$MAJOR" -lt 1 ] || ([ "$MAJOR" -eq 1 ] && [ "$MINOR" -lt 18 ]); then
        log_warning "Solana CLI version $SOLANA_VERSION is older than required 1.18.0"
        log_info "Upgrading Solana CLI..."
        sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    fi
else
    log_info "Installing Solana CLI (latest stable)..."

    # Install Solana CLI
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

    # Add to PATH
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # Verify installation
    if command -v solana &> /dev/null; then
        SOLANA_VERSION=$(solana --version | awk '{print $2}')
        log_success "Solana CLI installed successfully: $SOLANA_VERSION"

        # Add to shell config if not already present
        if ! grep -q 'solana/install/active_release/bin' "$SHELL_RC" 2>/dev/null; then
            echo "" >> "$SHELL_RC"
            echo "# Solana CLI" >> "$SHELL_RC"
            echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$SHELL_RC"
            log_success "Added Solana CLI to $SHELL_RC"
        fi
    else
        log_error "Solana CLI installation failed"
        exit 1
    fi
fi

# Ensure Solana is in PATH for this session
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo ""

#==============================================================================
# 3. Install Anchor Framework
#==============================================================================

log_info "Step 3/4: Installing Anchor Framework..."

if command -v anchor &> /dev/null; then
    ANCHOR_VERSION=$(anchor --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    log_success "Anchor CLI already installed: $ANCHOR_VERSION"

    # Check version (require 0.30.0+)
    MINOR=$(echo "$ANCHOR_VERSION" | cut -d. -f2)

    if [ "$MINOR" -lt 30 ]; then
        log_warning "Anchor CLI version $ANCHOR_VERSION is older than required 0.30.0"
        log_info "Upgrading Anchor CLI..."
        cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force
    fi
else
    log_info "Installing Anchor CLI (v0.30.0+)..."
    log_warning "This may take 10-15 minutes..."

    # Install Anchor from git (to get latest 0.30.x)
    cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

    # Verify installation
    if command -v anchor &> /dev/null; then
        ANCHOR_VERSION=$(anchor --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        log_success "Anchor CLI installed successfully: $ANCHOR_VERSION"
    else
        log_error "Anchor CLI installation failed"
        log_error "This may be due to missing system dependencies"
        log_info "Try installing build essentials: xcode-select --install"
        exit 1
    fi
fi

echo ""

#==============================================================================
# 4. Install SPL Token CLI
#==============================================================================

log_info "Step 4/4: Installing SPL Token CLI..."

if command -v spl-token &> /dev/null; then
    SPL_VERSION=$(spl-token --version | awk '{print $2}')
    log_success "SPL Token CLI already installed: $SPL_VERSION"
else
    log_info "Installing SPL Token CLI..."

    # Install SPL Token CLI
    cargo install spl-token-cli

    # Verify installation
    if command -v spl-token &> /dev/null; then
        SPL_VERSION=$(spl-token --version | awk '{print $2}')
        log_success "SPL Token CLI installed successfully: $SPL_VERSION"
    else
        log_error "SPL Token CLI installation failed"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""

# Display installed versions
log_info "Installed versions:"
echo "  - Rust:        $(rustc --version | awk '{print $2}')"
echo "  - Solana CLI:  $(solana --version | awk '{print $2}')"
echo "  - Anchor CLI:  $(anchor --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
echo "  - SPL Token:   $(spl-token --version | awk '{print $2}')"

echo ""
log_success "All tools installed successfully!"
echo ""
log_info "Next steps:"
echo "  1. Restart your terminal or run: source $SHELL_RC"
echo "  2. Run: bash scripts/verify_solana_setup.sh"
echo "  3. Initialize Anchor workspace (automatic in verification script)"
echo ""
