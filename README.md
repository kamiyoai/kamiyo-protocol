# KAMIYO Protocol

[![CI](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml)
[![Kani](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

https://github.com/user-attachments/assets/c3c293d8-f20b-4257-b272-d30e98c4e8fd

Trust infrastructure for autonomous agents.

KAMIYO lets agents transact with stake-backed identities, settle payments through escrow, and resolve disputes with commit-reveal oracle consensus.

[Website](https://kamiyo.ai) | [Web app](https://app.kamiyo.ai) | [API](https://api.kamiyo.ai) | [Solscan Program](https://solscan.io/account/8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM)

## Why this exists

AI agents can call tools, but they still struggle with trust.

KAMIYO adds three missing primitives:
- Stake-backed agent identity
- Escrowed payments with dispute fallback
- Verifiable quality and reputation (including ZK threshold proofs)

## 5-minute quickstart

Run a working demo locally:

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
pnpm -F @kamiyo/sdk -F @kamiyo/eliza build
cd examples/eliza-demo
pnpm install
pnpm dev
```

## Forkable examples

These are the fastest paths to first success:

| Example | What you get |
|---|---|
| `examples/eliza-demo` | Agent-to-agent payments, escrow, SLA dispute flow |
| `examples/sla-demo` | SLA-aware escrow settlements |
| `examples/hive-demo` | Multi-agent coordination with trust constraints |
| `examples/hyperliquid-agent` | Agent workflows with Hyperliquid integration |
| `examples/dark-forest-demo` | Privacy-oriented trust simulation |
| `examples/babyagi3-tool-pack` | Tooling integration for agent runtimes |

## Core flow

```text
Agent -> Create agreement (funds locked)
Provider -> Deliver service

Happy path:
Agent -> Release funds

Dispute path:
Agent -> Mark disputed
Oracles -> Commit vote hash -> Reveal score
Protocol -> Settle split using consensus
```

## Protocol features

- Agent identity with stake collateral
- Escrow agreements with timeout controls
- Commit-reveal oracle voting for disputes
- On-chain reputation with ZK threshold checks
- Multi-chain footprint (Solana, Base, Monad, Hyperliquid)

## Main Solana programs

| Program | Purpose |
|---|---|
| `programs/kamiyo` | Identity, escrow, oracle voting, ZK verification |
| `programs/kamiyo-escrow` | Companion escrow flows |
| `programs/kamiyo-governance` | Governance voting |
| `programs/kamiyo-staking` | Staking primitives |
| `programs/kamiyo-transfer-hook` | SPL transfer-hook logic |
| `programs/kamiyo-fast-voting` | MagicBlock ephemeral rollup voting |
| `programs/hive` | Oracle consensus and multi-agent dispute resolution |
| `programs/meishi` | DKG-based identity credentials |

## Packages you will likely use first

| Package | Purpose |
|---|---|
| `@kamiyo/sdk` | TypeScript SDK for protocol interactions |
| `@kamiyo/eliza` | ElizaOS integration |
| `@kamiyo/langchain` | LangChain tools |
| `@kamiyo/mcp-server` | MCP server integration |
| `@kamiyo/x402-client` | x402 payment client integration |

## Development

```bash
pnpm install
anchor build
anchor test
pnpm -r build
```

For setup details and troubleshooting, see `BUILD.md`.

## Security

See `SECURITY.md`.

Current controls include:
- Multi-sig controls for sensitive operations
- Oracle/agent slashing mechanics
- Timeout and fallback handling for stalled disputes

## Contributing

PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you want to help grow adoption, start with:
- New integration examples under `examples/`
- DX improvements to `@kamiyo/sdk`
- Better observability and dispute tooling

## License

MIT (`LICENSE`).
