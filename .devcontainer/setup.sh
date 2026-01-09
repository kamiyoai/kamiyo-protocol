#!/bin/bash
set -e

echo "Setting up Kamiyo Protocol development environment..."

# Install pnpm
npm install -g pnpm

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# Configure Solana for devnet
solana config set --url https://api.devnet.solana.com

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Install dependencies
pnpm install

# Build SDK and Eliza packages (needed for demo)
pnpm --filter @kamiyo/sdk build
pnpm --filter @kamiyo/eliza build

# Setup demo
cd examples/eliza-demo
cp .env.example .env
npm install

echo ""
echo "Setup complete. Run the demo:"
echo ""
echo "  cd examples/eliza-demo"
echo "  npm run dev"
echo ""
echo "For live mode (real transactions):"
echo "  solana-keygen new -o ~/.config/solana/devnet.json"
echo "  solana airdrop 1"
echo "  export SOLANA_PRIVATE_KEY=\$(cat ~/.config/solana/devnet.json)"
echo "  npm run dev"
echo ""
