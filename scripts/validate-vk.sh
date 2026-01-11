#!/bin/bash
# Validate that the VK in zk.rs matches the circuit verification_key.json

set -e

CIRCUITS_DIR="packages/kamiyo-tetsuo-privacy/circuits"
ZK_RS="programs/kamiyo/src/zk.rs"

cd "$(dirname "$0")/.."

if [ ! -f "$CIRCUITS_DIR/build/verification_key.json" ]; then
    echo "verification_key.json not found - skipping VK validation"
    exit 0
fi

# Generate fresh VK export
node "$CIRCUITS_DIR/export-solana-vk.js"

# Extract VK bytes from generated file
GENERATED_VK=$(grep -A 100 "REPUTATION_VK" "$CIRCUITS_DIR/build/reputation_vk.rs" | grep -E "^\s+\[|vk_" | tr -d ' \n')

# Extract VK bytes from zk.rs
CURRENT_VK=$(grep -A 100 "REPUTATION_VK" "$ZK_RS" | grep -E "^\s+\[|vk_" | tr -d ' \n')

if [ "$GENERATED_VK" = "$CURRENT_VK" ]; then
    echo "VK validation passed"
    exit 0
else
    echo "VK mismatch! Run: node $CIRCUITS_DIR/export-solana-vk.js"
    echo "Then update $ZK_RS with the generated values"
    exit 1
fi
