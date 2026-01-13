# DARK FOREST Privacy Demo

Privacy-preserving reputation verification on Solana.

Built for **Solana Privacy Hack 2026**.

## Features

- ZK proof generation for reputation tiers
- Wallet connection (Phantom, Solflare)
- On-chain verification via Groth16
- Powered by Helius RPCs

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up Helius RPC (get key at https://helius.dev)
echo "NEXT_PUBLIC_HELIUS_RPC=https://devnet.helius-rpc.com/?api-key=YOUR_KEY" > .env.local

# Run development server
pnpm dev
```

Open http://localhost:3002

## How It Works

1. Connect your Solana wallet
2. Enter your reputation score (0-100)
3. Generate a ZK proof that your score meets a tier threshold
4. Verify the proof on-chain (devnet)

The verifier learns only: "This user qualifies for Gold tier"
The verifier does NOT learn: actual score, wallet history, identity

## Tech Stack

- Next.js 14
- Solana Wallet Adapter
- Groth16 ZK Proofs (BN254)
- Poseidon Hash
- Helius RPC

## Tier System

| Tier | Threshold | Benefits |
|------|-----------|----------|
| Bronze | >= 25 | Basic access |
| Silver | >= 50 | Standard features |
| Gold | >= 75 | Premium features |
| Platinum | >= 90 | Full access |

## Hackathon Tracks

- **Privacy Tooling** ($15k) - SDK for privacy-preserving reputation
- **Open Track** ($18k) - Anonymous copy trading demo

## Bounties

- **Helius** ($5k) - Uses Helius RPCs for all on-chain operations

## License

BUSL-1.1
