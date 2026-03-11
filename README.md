# KAMIYO Protocol

[![CI](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml)
[![Kani](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![kamiyo-protocol](https://github.com/user-attachments/assets/707baf74-fdb8-451e-8bc2-931afb143d2a)

Open-source rails for Kizuna, KAMIYO's payment layer for autonomous agents.

Kizuna is the repo default. The broader platform stays in the monorepo, but it now hangs off the Kizuna spine instead of competing with it.

## What This Repo Is For

Kizuna gives agents a controlled way to pay for work over open rails:

- enterprise lane: prefunded, policy-limited approvals
- crypto-fast lane: overcollateralized approvals with health checks
- shared settlement, funding, repayment, and audit surfaces
- open protocol interfaces with a closed hosted kernel for production decisioning

This repository contains the open parts of that stack:

- x402 verification and settlement rails
- Kizuna account, funding, collateral, and repayment APIs
- wallet mandate and control-plane services
- client SDKs and settlement packages
- operator and onboarding surfaces
- module integrations that spend through Kizuna

## Repo Taxonomy

The workspace is intentionally split into three layers.

| Tier | What belongs here | Current examples |
|---|---|---|
| `core` | Default production path for Kizuna | `services/x402-facilitator`, `services/wallet-control-plane`, `services/api` (Kizuna slice), `packages/kamiyo-x402-client`, `packages/kamiyo-settlement`, `packages/kamiyo-meishi`, `apps/cdp-onboarding` |
| `module` | Kizuna-powered runtimes, apps, and orchestration layers | `services/kyoshin`, `apps/keiro`, `packages/kamiyo-openclaw`, `packages/kamiyo-hive`, `packages/kamiyo-agents` |
| `legacy` | Retained but non-default integrations, demos, and contract tracks | FairScale fusion surfaces, trust-graph/paranet/PoCH-heavy routes, oracle/deploy tracks, old demos, contract-specific workflows |

The source of truth for these groupings lives in `config/workspace-groups.json`.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Rust stable + Cargo
- Solana CLI 2.x
- Anchor CLI 0.31.x

### Install

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

### Default Kizuna Commands

```bash
pnpm run build
pnpm run test
pnpm run lint:check
```

Those commands now target the Kizuna core only.

### Non-default Workspace Commands

```bash
pnpm run build:modules
pnpm run test:modules
pnpm run build:legacy
pnpm run test:legacy
pnpm run build:program
pnpm run test:onchain
```

## Core Services

### x402 Facilitator

Primary Kizuna protocol edge for verify and settle.

- x402 verify/settle
- Kizuna account APIs
- enterprise prefund controls
- crypto-fast collateralized approvals
- billable settlement event emission

Docs: `services/x402-facilitator/README.md`

### Wallet Control Plane

Mandate, funding, and collateral control surface.

- agent onboarding
- mandate limits
- linked end-user wallet controls
- Kizuna funding and collateral support

Docs: `services/wallet-control-plane/README.md`

### Companion API

Broader API service with Kizuna-facing credits, billing, and repayment interfaces, plus retained legacy routes during the cutover window.

Docs: `services/api/README.md`

## Kizuna-Powered Modules

These stay in the repo, but they no longer define the product story.

- `Kyoshin`: execution runtime that spends and settles through Kizuna
- `Keiro`: client surface for agent identity, wallet, and Kizuna account state
- `OpenClaw`, Hive, and agent packages: orchestration and integration layers on top of Kizuna rails
- `Meishi`: compliance and policy input into Kizuna underwriting

## Documentation

- Build and local setup: `BUILD.md`
- Kizuna-first architecture: `ARCHITECTURE.md`
- Kizuna staged cutover: `docs/kizuna-cutover-plan.md`
- Kizuna narrative timeline: `docs/kizuna-narrative-timeline.md`
- Kizuna X calendar: `docs/kizuna-x-posts-calendar.md`
- Development workflows: `docs/DEVELOPMENT.md`
- Contributor guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Governance model: `GOVERNANCE.md`
- Support channels: `SUPPORT.md`

## Contributing

Contributions are welcome. Default changes should strengthen the Kizuna core path first. Use module or legacy lanes only when the work is not part of the core payment spine.

## Security

Report vulnerabilities privately via the process in `SECURITY.md`.

## License

MIT. See `LICENSE`.
