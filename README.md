# KAMIYO Protocol

[![CI](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml)
[![Kani](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![kamiyo-protocol](https://github.com/user-attachments/assets/707baf74-fdb8-451e-8bc2-931afb143d2a)

Monorepo for KAMIYO protocol code.

The repository includes on-chain programs, Rust crates, TypeScript packages, backend services, and verification tooling.

## What Is Included

- Stake-backed identity and trust primitives
- Escrow and dispute workflows
- Oracle commit/reveal logic
- Trust-layer engine with deterministic receipts
- Transactional outbox service for trust event ingest
- Kani proof harnesses for selected invariants
- OpenClaw plugin tools for staked identity, escrow, oracle consensus, Meishi, and x402 (`packages/kamiyo-openclaw`)

## Repository Layout

| Path | Purpose |
|---|---|
| `programs/` | Solana on-chain programs (Anchor) |
| `crates/` | Rust libraries (`kamiyo-trust-layer`, `kani-solana`) |
| `packages/` | TypeScript SDKs and integrations |
| `services/` | Service runtimes and operators |
| `examples/` | End-to-end and integration examples |
| `contracts/` | EVM-side contracts and related artifacts |
| `circuits/`, `noir/` | ZK circuits |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Rust stable + Cargo
- Solana CLI 2.x
- Anchor CLI 0.31.x

### Install and Build

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
anchor build
pnpm run build:sdk
```

### Run Core Test Suites

```bash
anchor test
pnpm run test:sdk
cargo test -p kamiyo-trust-layer
cargo test -p trust-layer-service
```

### Enterprise Readiness Gate

Run deterministic onboarding and tool-wiring checks from the repo root:

```bash
pnpm run preflight:enterprise
```

Run full live smoke (requires live env and funded devnet agent keypair):

```bash
pnpm run smoke:enterprise
```

`smoke:enterprise` includes:

- API runtime env + `/health` and `/ready` smoke
- Operator runtime env + boot smoke
- MCP stdio handshake + live credential preflight
- SDK devnet lifecycle smoke

## Trust Layer Service

The trust layer service provides:

- idempotent trust-event ingest API
- exactly-once durable database writes per `event_id`
- Kafka publish via transactional outbox relay
- dead-letter re-drive and retention sweep tooling
- Prometheus metrics output and alert/dashboard assets

Service docs are available in `services/trust-layer-service/README.md`.

## Formal Verification

Kani harnesses are maintained for trust-layer and Solana-related invariants.

```bash
cargo kani -p kani-solana
cargo kani -p kamiyo-trust-layer
```

See `KANI.md` for full verification workflows.

## Documentation

- Build and local setup: `BUILD.md`
- System architecture: `ARCHITECTURE.md`
- Development workflows: `docs/DEVELOPMENT.md`
- Contributor guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Governance model: `GOVERNANCE.md`
- Support channels: `SUPPORT.md`
- Public roadmap: `docs/ROADMAP.md`

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a pull request.

## Security

Report vulnerabilities privately via the process in `SECURITY.md`.

## License

MIT. See `LICENSE`.
