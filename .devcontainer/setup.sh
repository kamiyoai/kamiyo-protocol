#!/bin/bash
set -e

echo "Setting up Kamiyo Protocol..."

# Install pnpm
npm install -g pnpm

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# Configure Solana for devnet
solana config set --url https://api.devnet.solana.com || true

# Install all dependencies via pnpm
pnpm install

# Build SDK and Eliza
pnpm --filter @kamiyo/sdk build || true
pnpm --filter @kamiyo/eliza build || true

# Install demo dependencies
cd examples/eliza-demo
pnpm install

echo ""
echo "========================================="
echo "Setup complete!"
echo ""
echo "Run the demo:"
echo "  cd examples/eliza-demo"
echo "  pnpm run dev"
echo "========================================="
