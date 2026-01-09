#!/bin/bash

echo "=== Kamiyo Protocol Setup ==="

npm install -g pnpm

# Solana CLI (optional, for live mode)
if ! command -v solana &> /dev/null; then
  echo "Installing Solana CLI..."
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" 2>/dev/null
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
  solana config set --url devnet 2>/dev/null
fi

# Install and build
pnpm install
pnpm -F @kamiyo/sdk build
pnpm -F @kamiyo/eliza build

cd examples/eliza-demo
pnpm install

echo ""
echo "Done. Run: cd examples/eliza-demo && pnpm dev"
