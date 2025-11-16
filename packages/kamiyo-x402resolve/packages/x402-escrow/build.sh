#!/bin/bash
set -e

echo "Building x402-escrow program..."
cd /workspaces/x402resolve/packages/x402-escrow

# Build the program
~/.cargo/bin/anchor build

echo ""
echo "Build complete!"
echo "Program ID: AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR"
echo ""
echo "Next steps:"
echo "1. Deploy: anchor deploy"
echo "2. View on explorer: https://explorer.solana.com/address/AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR?cluster=devnet"
echo "3. Run tests: anchor test"
