#!/bin/bash
set -e

# Compile agent_reputation circuit for Hive hackathon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build/hive"
CIRCUIT_NAME="agent_reputation"

echo "=== Compiling $CIRCUIT_NAME circuit ==="
echo

mkdir -p "$BUILD_DIR"

# Check for existing ptau (use the existing pot15 from hive build)
PTAU_FILE="$BUILD_DIR/pot15_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "Error: $PTAU_FILE not found. Run setup-hive.sh first."
    exit 1
fi

# Step 1: Compile circuit
echo "[1/4] Compiling $CIRCUIT_NAME circuit..."
circom "$CIRCUITS_DIR/hive/${CIRCUIT_NAME}.circom" \
    --r1cs \
    --wasm \
    --sym \
    -l "$CIRCUITS_DIR/node_modules" \
    -o "$BUILD_DIR" \
    2>&1 | grep -v "^warning" || true

echo "Constraint count:"
snarkjs r1cs info "$BUILD_DIR/${CIRCUIT_NAME}.r1cs"
echo

# Step 2: Generate zkey
echo "[2/4] Generating zkey..."
snarkjs groth16 setup \
    "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" \
    "$PTAU_FILE" \
    "$BUILD_DIR/${CIRCUIT_NAME}_0.zkey"

# Step 3: Phase 2 contribution
echo "[3/4] Contributing to phase 2..."
snarkjs zkey contribute \
    "$BUILD_DIR/${CIRCUIT_NAME}_0.zkey" \
    "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
    --name="Hive phase2" \
    -v -e="$(head -c 64 /dev/urandom | xxd -p)"

# Step 4: Export verification key
echo "[4/4] Exporting verification key..."
snarkjs zkey export verificationkey \
    "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
    "$BUILD_DIR/${CIRCUIT_NAME}_vk.json"

echo
echo "=== $CIRCUIT_NAME Setup Complete ==="
echo
echo "WASM: $BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "Zkey: $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "VKey: $BUILD_DIR/${CIRCUIT_NAME}_vk.json"
