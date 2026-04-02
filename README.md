# KAMIYO Protocol

[![CI](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/ci.yml)
[![Kani](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml/badge.svg?branch=main)](https://github.com/kamiyo-ai/kamiyo-protocol/actions/workflows/kani.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![kamiyo-protocol](https://github.com/user-attachments/assets/707baf74-fdb8-451e-8bc2-931afb143d2a)

Open-source rails for KAMIYO's trust, settlement, and control layer for AI agents.

Kizuna is the repo default path. It is the main open rail in this monorepo, but the repository also includes trust services, policy and compliance surfaces, operator controls, SDKs, and agent integrations built around that core.

## Reality Fork

Reality Fork is the public layer on top of Kamiyo’s counterfactual control-room engine.

- one immutable snapshot
- multiple readonly futures
- evidence, risk, latency, and cost scoring
- truth-court adjudication on close calls
- one promoted winner

This repo owns the engine and the portable public contract:

- authenticated Companion control-room routes under `/api/hive-teams/:id/control-room/*`
- the public scenario package in `packages/kamiyo-reality-fork`
- fixture export and launch-fixture generation scripts

The UI lives in `kamiyo-app` so it can match the rest of the Kamiyo product surface instead of becoming a second design system inside this repo.

![kamiyo animation](assets/kamiyo.gif)

## What This Repo Is For

KAMIYO Protocol gives agents a way to operate with explicit trust signals, controlled approvals, and auditable settlement over open rails:

- trust inputs and attestations for who can act, under what policy, and with what evidence
- settlement rails for verification, funding, repayment, and billable execution
- control-plane surfaces for mandates, linked wallets, collateral, and operator actions
- open protocol interfaces with a closed hosted kernel for production decisioning
- agent and app integrations that consume those rails instead of bypassing them

This repository contains the open parts of that stack:

- trust-layer crates and the `trust-layer-service`
- x402 verification and settlement rails
- Kizuna account, funding, collateral, and repayment APIs
- wallet mandate and control-plane services
- Meishi policy and compliance packages
- client SDKs, operator surfaces, and settlement packages
- agent-facing integrations built on top of the trust, settlement, and control rails

## Repo Taxonomy

The workspace is intentionally split into three layers.

| Tier | What belongs here | Current examples |
|---|---|---|
| `core` | Default production path for Kizuna settlement and control | `services/x402-facilitator`, `services/wallet-control-plane`, `services/api` (Kizuna slice), `packages/kamiyo-x402-client`, `packages/kamiyo-settlement`, `packages/kamiyo-meishi`, `apps/cdp-onboarding` |
| `module` | Agent runtimes, apps, and orchestration layers built on top of the rails | `services/kamiyo-agent`, `services/keiro-api`, `apps/keiro`, `packages/kamiyo-openclaw`, `packages/kamiyo-hive`, `packages/kamiyo-agents`, `packages/kamiyo-reality-fork` |
| `legacy` | Retained but non-default integrations, demos, trust/reputation experiments, and contract tracks | FairScale fusion surfaces, trust-graph/paranet/PoCH-heavy routes, oracle/deploy tracks, old demos, contract-specific workflows |

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
pnpm run smoke:companion:route-ownership
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

## Trust Services

### Trust Layer Service

Durable trust-event ingest and read service for agent trust state, receipts, and replayable evidence.

- idempotent trust event ingest
- per-subject trust state reads
- Postgres-backed durability with Kafka outbox relay
- replay and dead-letter tooling for operational recovery

Docs: `services/trust-layer-service/README.md`

## Policy and Compliance

### Meishi

Compliance passport and mandate surfaces that feed underwriting, policy checks, and control-layer decisions.

- agent passports and mandate primitives
- compliance scoring and audit inputs
- exchange helpers for integrating policy state into protocol flows

Service docs: `services/meishi-compliance/README.md`

## Agent-Facing Modules

These stay in the repo, but they sit on top of the trust, settlement, and control rails instead of defining them.

- `Kamiyo Agent`: execution runtime that spends and settles through Kizuna
- `Keiro` and `Keiro API`: client and API surfaces for agent identity, receipts, reputation, and Kizuna account state
- `Agent Factory`: autonomous agent runtime for integration-response and forum workflows
- `OpenClaw`, Hive, and agent packages: orchestration and integration layers on top of Kizuna

## Documentation

- Reality Fork package: `packages/kamiyo-reality-fork/README.md`
- Reality Fork launch kit: `docs/reality-fork-launch-kit.md`
- Build and local setup: `BUILD.md`
- Development workflows: `DEVELOPMENT.md`
- Kizuna-first architecture: `ARCHITECTURE.md`
- Companion ownership and cutover runbook: `services/api/ROUTE_OWNERSHIP.md`
- Kizuna staged cutover: `docs/kizuna-cutover-plan.md`
- Kizuna narrative timeline: `docs/kizuna-narrative-timeline.md`
- Kizuna X calendar: `docs/kizuna-x-posts-calendar.md`
- Contributor guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Governance model: `GOVERNANCE.md`
- Support channels: `SUPPORT.md`

## Contributing

Contributions are welcome. Default changes should strengthen the Kizuna core path first. Use module or legacy lanes only when the work is not part of the core trust, settlement, and control spine.

## Security

Report vulnerabilities privately via the process in `SECURITY.md`.

## License

MIT. See `LICENSE`.
