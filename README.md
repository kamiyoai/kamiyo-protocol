# KAMIYO Protocol

[![CI](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml)
[![Kani](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

KAMIYO Protocol is the core open-source repository for KAMIYO.

Kizuna is the protocol's agentic trust and settlement layer. It provides trust signals, payment verification, settlement flows, funding controls, and operator surfaces for AI agents. Reality Fork is the newest product built on top of these rails; this repository contains the underlying protocol, services, SDKs, reference applications, and the portable Reality Fork package rather than a product-only application surface.

## Repository Scope

| Area | Purpose | Primary paths |
| --- | --- | --- |
| Kizuna core services | Verification, settlement, funding, repayment, and operator APIs | `services/x402-facilitator`, `services/wallet-control-plane`, `services/api`, `apps/cdp-onboarding` |
| Reality Fork | Counterfactual control-room package and launch assets | `packages/kamiyo-reality-fork` |
| Trust infrastructure | Durable trust-event ingest, reads, replay, and service runtime | `services/trust-layer-service`, `crates/kamiyo-trust-layer` |
| Identity and compliance | Passport, mandate, and compliance surfaces | `packages/kamiyo-meishi`, `services/meishi-compliance` |
| Client and integration packages | SDKs, settlement libraries, and agent-facing integrations | `packages/` |
| On-chain and proof systems | Solana programs, contracts, zero-knowledge components, and circuits | `programs/`, `contracts/`, `crates/kamiyo-zk`, `circuits/`, `noir/` |

## Quick Start

### Requirements

- Node.js 20+
- pnpm 9+
- Rust stable
- Solana CLI 2.x and Anchor CLI 0.31.x for on-chain work

### Install

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

### Common Commands

```bash
pnpm run build
pnpm run test
pnpm run lint:check
```

The root defaults target the Kizuna core workspace. For module, legacy, and on-chain commands, see [BUILD.md](BUILD.md).

## Key Components

- [Reality Fork package](packages/kamiyo-reality-fork/README.md): portable scenario and control-room package built on the protocol rails
- [x402 Facilitator](services/x402-facilitator/README.md): verification, settlement, funding locks, collateralized approvals, and repayment flows
- [Wallet Control Plane](services/wallet-control-plane/README.md): mandates, linked wallets, enterprise funding limits, and collateral checks
- [Companion API](services/api/README.md): ledger, billing, integration, and protocol API surfaces
- [Trust Layer Service](services/trust-layer-service/README.md): durable trust-event ingest, subject-state reads, replay tooling, and Kafka-backed delivery
- [Meishi Compliance](services/meishi-compliance/README.md): identity and compliance services around Meishi passports
- [CDP Onboarding](apps/cdp-onboarding/README.md): reference operator app for Kizuna account setup and control-plane actions

## Documentation

- [Reality Fork package](packages/kamiyo-reality-fork/README.md)
- [Architecture](ARCHITECTURE.md)
- [Build Guide](BUILD.md)
- [Development Guide](DEVELOPMENT.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Support](SUPPORT.md)

Service- and package-specific documentation lives alongside each component under `services/`, `packages/`, `apps/`, and `crates/`.

## Contributing

Contributions are welcome. Keep changes focused, add tests for behavior changes, and update documentation when interfaces or workflows change. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Use GitHub Issues for bugs and feature requests. Do not open public issues for security problems; follow [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
