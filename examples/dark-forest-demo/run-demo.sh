#!/bin/bash
cd /Users/dennisgoslar/Documents/Dennis/kamiyo-protocol/examples/dark-forest-demo
export SOLANA_PRIVATE_KEY=$(node -e "const { Keypair } = require('@solana/web3.js'); console.log(JSON.stringify(Array.from(Keypair.generate().secretKey)))")
npx tsx mainnet-demo.ts
