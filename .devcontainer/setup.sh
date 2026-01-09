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

# Install root dependencies
pnpm install

# Build SDK first (eliza depends on it)
echo "Building @kamiyo/sdk..."
cd packages/kamiyo-sdk
pnpm install || true
pnpm build || echo "SDK build failed, continuing..."
cd ../..

# Build eliza plugin
echo "Building @kamiyo/eliza..."
cd packages/kamiyo-eliza
pnpm install || true
pnpm build || echo "Eliza build failed, continuing..."
cd ../..

# Setup demo
echo "Setting up demo..."
cd examples/eliza-demo
cp .env.example .env 2>/dev/null || true
rm -rf node_modules
npm install

echo ""
echo "========================================="
echo "Setup complete!"
echo ""
echo "Run the demo:"
echo "  cd examples/eliza-demo"
echo "  npm run dev"
echo "========================================="
