#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$SCRIPT_DIR/../agent-collab"
BUILD_DIR="$SCRIPT_DIR/../build/agent-collab"
PTAU_FILE="$SCRIPT_DIR/../build/powersOfTau28_hez_final_14.ptau"

CIRCUITS=("agent_identity" "private_signal" "swarm_vote")

mkdir -p "$BUILD_DIR"

echo "=== Agent Collaboration Circuits Setup ==="
echo ""

# Check for ptau file
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau ceremony file..."
    curl -L -o "$PTAU_FILE" https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau
fi

# Generate random entropy for contributions
ENTROPY=$(head -c 32 /dev/urandom | xxd -p)

for circuit in "${CIRCUITS[@]}"; do
    echo ""
    echo "--- Processing: $circuit ---"

    # Compile circuit
    echo "Compiling $circuit.circom..."
    circom "$CIRCUITS_DIR/$circuit.circom" \
        --r1cs \
        --wasm \
        --sym \
        -o "$BUILD_DIR" \
        -l "$SCRIPT_DIR/../node_modules"

    # Generate zkey
    echo "Generating zkey for $circuit..."
    snarkjs groth16 setup \
        "$BUILD_DIR/${circuit}.r1cs" \
        "$PTAU_FILE" \
        "$BUILD_DIR/${circuit}_0000.zkey"

    # Contribute to ceremony (with random entropy)
    echo "Contributing to ceremony..."
    echo "$ENTROPY" | snarkjs zkey contribute \
        "$BUILD_DIR/${circuit}_0000.zkey" \
        "$BUILD_DIR/${circuit}_final.zkey" \
        --name="Kamiyo Agent Collab" \
        -v -e="$ENTROPY"

    # Export verification key
    echo "Exporting verification key..."
    snarkjs zkey export verificationkey \
        "$BUILD_DIR/${circuit}_final.zkey" \
        "$BUILD_DIR/${circuit}_vk.json"

    echo "$circuit done!"
done

echo ""
echo "=== All circuits compiled and setup complete ==="
echo ""
echo "Generated files in $BUILD_DIR:"
ls -la "$BUILD_DIR"
