# Kamiyo ElizaOS Demo

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/kamiyo-ai/kamiyo-protocol?quickstart=1)

## Quick Start

**Codespaces** (one click):
```bash
cd examples/eliza-demo && pnpm dev
```

**Local**:
```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol
cd kamiyo-protocol
pnpm install
pnpm -F @kamiyo/sdk -F @kamiyo/eliza build
cd examples/eliza-demo && pnpm install && pnpm dev
```

## What It Does

Runs a simulated agent-to-agent transaction loop:

1. **ZK Reputation** - Provider proves success rate >= threshold without revealing actual score
2. **Blacklist Check** - SMT exclusion proof verifies provider isn't banned
3. **Escrow** - Consumer locks funds, provider delivers
4. **SLA Enforcement** - Quality < threshold triggers auto-dispute
5. **DAO Vote** - Commit-reveal voting on policy changes

## Live Mode

```bash
solana-keygen new -o ~/devnet.json
solana airdrop 1 --url devnet
export SOLANA_PRIVATE_KEY=$(cat ~/devnet.json)
pnpm dev
```

## Env

| Var | Default |
|-----|---------|
| `SOLANA_PRIVATE_KEY` | - |
| `KAMIYO_NETWORK` | `devnet` |
| `KAMIYO_QUALITY_THRESHOLD` | `80` |
