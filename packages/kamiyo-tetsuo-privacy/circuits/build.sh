#!/bin/bash
set -e

CIRCUIT_DIR="$(dirname "$0")"
BUILD_DIR="$CIRCUIT_DIR/build"
PTAU_FILE="$BUILD_DIR/pot12_final.ptau"

echo "Building reputation_threshold circuit..."

mkdir -p "$BUILD_DIR"

# Download powers of tau if not present
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading powers of tau..."
    curl -L -o "$PTAU_FILE" "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau"
fi

# Check for circom
if ! command -v circom &> /dev/null; then
    echo "circom not found. Install with: cargo install circom"
    exit 1
fi

# Check for snarkjs
if ! command -v snarkjs &> /dev/null; then
    echo "snarkjs not found. Install with: npm install -g snarkjs"
    exit 1
fi

# Find circomlib - check local first, then root node_modules
CIRCOMLIB_PATH=""
if [ -d "$CIRCUIT_DIR/node_modules/circomlib" ]; then
    CIRCOMLIB_PATH="$CIRCUIT_DIR/node_modules"
elif [ -d "$CIRCUIT_DIR/../../../node_modules/circomlib" ]; then
    CIRCOMLIB_PATH="$CIRCUIT_DIR/../../../node_modules"
else
    echo "Installing circomlib..."
    cd "$CIRCUIT_DIR"
    npm init -y 2>/dev/null || true
    npm install circomlib
    CIRCOMLIB_PATH="$CIRCUIT_DIR/node_modules"
    cd -
fi

echo "Using circomlib from: $CIRCOMLIB_PATH"

# Compile circuit
echo "Compiling circuit..."
circom "$CIRCUIT_DIR/reputation_threshold.circom" \
    --r1cs \
    --wasm \
    --sym \
    -l "$CIRCOMLIB_PATH" \
    -o "$BUILD_DIR"

# Generate zkey
echo "Generating proving key..."
snarkjs groth16 setup \
    "$BUILD_DIR/reputation_threshold.r1cs" \
    "$PTAU_FILE" \
    "$BUILD_DIR/reputation_threshold_0000.zkey"

# Contribute to phase 2 (for production, use proper MPC ceremony)
echo "Contributing to phase 2..."
echo "kamiyo-tetsuo-entropy-contribution" | snarkjs zkey contribute \
    "$BUILD_DIR/reputation_threshold_0000.zkey" \
    "$BUILD_DIR/reputation_threshold_final.zkey" \
    --name="KAMIYO TETSUO" -v

# Export verification key
echo "Exporting verification key..."
snarkjs zkey export verificationkey \
    "$BUILD_DIR/reputation_threshold_final.zkey" \
    "$BUILD_DIR/verification_key.json"

# Generate Solidity verifier (optional, for on-chain verification)
echo "Generating Solidity verifier..."
snarkjs zkey export solidityverifier \
    "$BUILD_DIR/reputation_threshold_final.zkey" \
    "$BUILD_DIR/ReputationVerifier.sol"

echo "Circuit build complete!"
echo "Artifacts in: $BUILD_DIR"
ls -la "$BUILD_DIR"
