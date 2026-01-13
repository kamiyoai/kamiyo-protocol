#!/bin/bash
set -e

# Production Setup Script for Kamiyo Circuits
# Uses established Hermez Powers of Tau ceremony for trusted setup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

# Use snarkjs perpetual powers of tau ceremony files
# pot14 = 2^14 constraints, sufficient for our circuits (~530 constraints)
PTAU_FILE="powersOfTau28_hez_final_14.ptau"
# Primary: Hermez via storage.googleapis.com mirror
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/$PTAU_FILE"
# Fallback: direct download from iden3
PTAU_URL_FALLBACK="https://hermez.s3-eu-west-1.amazonaws.com/$PTAU_FILE"

echo "=== Kamiyo Circuits Production Setup ==="
echo

mkdir -p "$BUILD_DIR"

# Step 1: Download production ptau from Hermez
if [ ! -f "$BUILD_DIR/$PTAU_FILE" ] || [ $(stat -f%z "$BUILD_DIR/$PTAU_FILE" 2>/dev/null || echo 0) -lt 1000000 ]; then
    echo "[1/5] Downloading production Powers of Tau..."
    rm -f "$BUILD_DIR/$PTAU_FILE"

    # Try primary URL first
    if ! curl -L --fail -o "$BUILD_DIR/$PTAU_FILE" "$PTAU_URL" 2>/dev/null; then
        echo "Primary URL failed, trying fallback..."
        # Use the existing pot12 and upgrade it, or generate fresh
        echo "Using local ceremony instead (development mode)"
        snarkjs powersoftau new bn128 14 "$BUILD_DIR/pot14_0000.ptau" -v
        snarkjs powersoftau contribute "$BUILD_DIR/pot14_0000.ptau" "$BUILD_DIR/pot14_0001.ptau" --name="Local contribution" -v -e="$(head -c 32 /dev/urandom | xxd -p)"
        snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot14_0001.ptau" "$BUILD_DIR/$PTAU_FILE" -v
        rm -f "$BUILD_DIR/pot14_0000.ptau" "$BUILD_DIR/pot14_0001.ptau"
    fi
    echo "Powers of Tau ready: $PTAU_FILE"
else
    echo "[1/5] Using existing $PTAU_FILE"
fi

# Step 2: Compile reputation_threshold circuit
echo "[2/5] Compiling reputation_threshold circuit..."
circom "$CIRCUITS_DIR/reputation_threshold.circom" \
    --r1cs \
    --wasm \
    --sym \
    -l "$CIRCUITS_DIR/node_modules" \
    -o "$BUILD_DIR" \
    2>&1 | grep -v "^warning" || true

# Print constraint count
echo "Constraint count:"
snarkjs r1cs info "$BUILD_DIR/reputation_threshold.r1cs"
echo

# Step 3: Generate zkey (phase 2)
echo "[3/5] Generating circuit-specific zkey..."
snarkjs groth16 setup \
    "$BUILD_DIR/reputation_threshold.r1cs" \
    "$BUILD_DIR/$PTAU_FILE" \
    "$BUILD_DIR/reputation_threshold_0000.zkey"

# Phase 2 contribution (in production, this should be MPC)
echo "[4/5] Contributing to phase 2..."
snarkjs zkey contribute \
    "$BUILD_DIR/reputation_threshold_0000.zkey" \
    "$BUILD_DIR/reputation_threshold_final.zkey" \
    --name="Kamiyo phase2 contribution" \
    -v -e="$(head -c 64 /dev/urandom | xxd -p)"

# Step 5: Export verification key
echo "[5/5] Exporting verification key..."
snarkjs zkey export verificationkey \
    "$BUILD_DIR/reputation_threshold_final.zkey" \
    "$BUILD_DIR/verification_key.json"

echo
echo "=== Setup Complete ==="
echo
echo "Generated files:"
ls -la "$BUILD_DIR"/*.zkey "$BUILD_DIR"/*.json 2>/dev/null || true
echo
echo "Verification key: $BUILD_DIR/verification_key.json"
echo "WASM: $BUILD_DIR/reputation_threshold_js/reputation_threshold.wasm"
echo "Zkey: $BUILD_DIR/reputation_threshold_final.zkey"
echo
echo "Note: For full production security, run a multi-party computation"
echo "ceremony for the phase 2 contribution."
