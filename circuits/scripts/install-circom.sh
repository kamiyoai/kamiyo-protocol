#!/bin/bash
# Install Circom compiler
#
# Circom is a DSL for writing ZK circuits.
# It compiles to R1CS constraints for Groth16/PLONK.
#
# Requirements:
# - Rust (cargo)
# - Git

set -e

echo "Installing Circom..."

# Check if cargo is available
if ! command -v cargo &> /dev/null; then
    echo "Error: Rust/Cargo not found. Install from https://rustup.rs"
    exit 1
fi

# Install circom from source
cargo install --git https://github.com/iden3/circom.git

# Verify installation
if command -v circom &> /dev/null; then
    echo "Circom installed successfully!"
    circom --version
else
    echo "Warning: circom installed but not in PATH"
    echo "Add ~/.cargo/bin to your PATH"
fi
