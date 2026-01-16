# @kamiyo/kamiyo-mitama-cli

Interactive CLI for KAMIYO Mitama ZK-private agent coordination.

## Installation

```bash
pnpm add -g @kamiyo/kamiyo-mitama-cli
```

Or run directly:

```bash
npx @kamiyo/kamiyo-mitama-cli
```

## Usage

```bash
# Start CLI (devnet by default)
mitama-cli

# Use mainnet
mitama-cli --mainnet
```

## Features

### Wallet Management

Create or import a Solana wallet. Keys stored in `~/.mitama/wallet.json`.

### Agent Registration

Register as a ZK-private agent:
1. Generate identity commitment: `Poseidon(ownerSecret, agentId, regSecret)`
2. Stake SOL on-chain
3. Identity stored in `~/.mitama/identity.json`

### Private Signals

Submit trading signals with ZK proofs:
- Signal types: Market sentiment, Technical analysis, On-chain activity, News
- Direction: Long, Short, Neutral
- Confidence & magnitude (0-100)
- Proof verifies validity without revealing content

Signals stored in `~/.mitama/signals.json` for later reveal.

### Swarm Coordination

Create proposals and vote anonymously:
- Propose coordinated actions with threshold
- Vote YES/NO with ZK proof of membership
- Nullifier prevents double-voting
- View active proposals

## Data Storage

All data stored in `~/.mitama/`:

| File | Contents |
|------|----------|
| `wallet.json` | Encrypted Solana keypair |
| `identity.json` | Agent identity secrets |
| `signals.json` | Unrevealed signal data |

## Network

Connects to Solana devnet by default. The CLI syncs with the on-chain agent registry to build Merkle proofs.

Program ID: `DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km`

## Requirements

- Node.js 18+
- Circuit files at `MITAMA_CIRCUITS_PATH` or `circuits/build/mitama`

## License

MIT
