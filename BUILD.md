# Build Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust 1.75+ (Solana programs)
- Solana CLI 2.x
- Anchor 0.31.1

### Solana

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

### Anchor

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1
avm use 0.31.1
```

### pnpm

```bash
npm install -g pnpm
```

## Setup

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

## Build

```bash
npm run build              # Programs + SDK
npm run build:program      # Solana programs only
npm run build:sdk          # @kamiyo/sdk only
npm run build:api          # SDK + API dependencies
npm run build:oracle       # Oracle service
```

### Individual Packages

```bash
pnpm --filter @kamiyo/sdk run build
pnpm --filter @kamiyo/agents run build
```

### Solana Programs

Built via `anchor build`:

| Program | Purpose |
|---------|---------|
| kamiyo | Identity, escrow, oracle voting |
| kamiyo-escrow | Companion escrow |
| kamiyo-staking | Token staking |
| kamiyo-governance | Governance voting |
| kamiyo-transfer-hook | MEV protection |
| kamiyo-fast-voting | Fast voting |
| hive | Agent collaboration |
| meishi | DKG identity credentials |

## Test

```bash
anchor test                         # All programs (starts localnet)
anchor test --skip-local-validator  # Use running validator
npm run test:sdk                    # SDK tests
npm run test:surfpool               # Surfpool tests
```

### Specific Tests

```bash
npx ts-mocha -p ./tests/tsconfig.json tests/agent.test.ts
npx ts-mocha -p ./tests/tsconfig.json tests/escrow.test.ts
```

## Lint

```bash
npm run lint         # TypeScript (auto-fix)
npm run lint:check   # TypeScript (check)
npm run lint:rust    # Rust (fmt + clippy)
npm run format       # Prettier
npm run format:rust  # Cargo fmt
```

## EVM Contracts

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
cd contracts/zk-reputation && forge build && forge test
cd contracts/monad && forge build && forge test
cd contracts/hyperliquid && forge build && forge test
```

## ZK Circuits

### Circom

```bash
cd circuits
npm install
npm run compile         # Compile oracle_vote circuit
npm run setup           # Generate proving keys (ptau + zkey)
npm run verify          # Verify proof
npm run export:solana   # Export Solana verifier
```

### Noir

Requires [just](https://github.com/casey/just) and [nargo](https://noir-lang.org/docs/getting_started/installation/).

```bash
cd noir
just install       # Install lib dependencies
just compile-all   # Compile all circuits
just test-all      # Run tests
just setup-all     # Generate proving keys
```

### Halo2

```bash
cd crates/kamiyo-zk
cargo build --release
cargo test
```

## Services

### API

```bash
cd services/api
npm install
npm run build
npm run dev      # Development (tsx watch)
npm start        # Production
```

### Oracle

```bash
npm run build:oracle
cd services/oracle
npm start
```

### Discord Bot

```bash
cd services/discord-governance-bot
npm install && npm run build && npm start
```

## Environment

Required variables (create `.env` in root or service directories):

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ANCHOR_WALLET=~/.config/solana/id.json
ANTHROPIC_API_KEY=sk-ant-...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
SENTRY_DSN=...
RENDER_API_KEY=...
```

## Deploy

### Solana

```bash
anchor deploy --provider.cluster devnet
anchor deploy --provider.cluster mainnet  # Requires multisig
```

### Render

Auto-deploys on push to main. Manual:

```bash
curl -X POST "https://api.render.com/v1/services/{service_id}/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

## Troubleshooting

**Anchor build fails:**
```bash
npm run clean && anchor build
```

**pnpm install fails:**
```bash
pnpm store prune && rm -rf node_modules && pnpm install
```

**Validator issues:**
```bash
solana-test-validator --reset
```

**Wrong program IDs:** Check `Anchor.toml` matches your cluster.

## Structure

```
programs/     Solana programs (Rust/Anchor)
packages/     TypeScript packages
services/     API, oracle, bots
contracts/    EVM contracts (Forge)
circuits/     Circom circuits
noir/         Noir circuits
crates/       Rust crates (Halo2)
tests/        Anchor tests
apps/         Frontend apps
```
