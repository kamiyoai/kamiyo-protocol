#!/bin/bash
# Setup mcl library for BN254 pairing verification
#
# This script downloads and builds the mcl library (https://github.com/herumi/mcl)
# which provides highly optimized BN254 pairing operations needed for Groth16 verification.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/deps"
MCL_VERSION="v1.93"

echo "Setting up mcl library for tetsuo-core..."
echo ""

# Check for dependencies
if ! command -v cmake &> /dev/null; then
    echo "Error: cmake is required. Install with: brew install cmake"
    exit 1
fi

if ! command -v make &> /dev/null; then
    echo "Error: make is required"
    exit 1
fi

# Create deps directory
mkdir -p "$DEPS_DIR"
cd "$DEPS_DIR"

# Clone or update mcl
if [ -d "mcl" ]; then
    echo "mcl directory exists, updating..."
    cd mcl
    git fetch origin
    git checkout "$MCL_VERSION"
else
    echo "Cloning mcl $MCL_VERSION..."
    git clone --depth 1 --branch "$MCL_VERSION" https://github.com/herumi/mcl.git
    cd mcl
fi

# Build mcl
echo ""
echo "Building mcl..."
mkdir -p build
cd build
cmake .. -DCMAKE_INSTALL_PREFIX="$DEPS_DIR/mcl"
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
make install

echo ""
echo "mcl installed to: $DEPS_DIR/mcl"
echo ""
echo "Now build tetsuo-core with mcl support:"
echo "  cd $SCRIPT_DIR"
echo "  make clean && make USE_MCL=1"
echo ""
echo "Or run the full verification demo:"
echo "  make USE_MCL=1 test"
