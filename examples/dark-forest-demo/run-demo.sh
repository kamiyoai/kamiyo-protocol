#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
export SOLANA_PRIVATE_KEY=$(node -e "const { Keypair } = require('@solana/web3.js'); console.log(JSON.stringify(Array.from(Keypair.generate().secretKey)))")
npx tsx mainnet-demo.ts
