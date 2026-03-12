# Build Guide

This repo now defaults to the Kizuna core path.

If you only need the production payment spine, use the root defaults. Reach for module or legacy commands only when you are intentionally working outside the core rail.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust 1.75+
- Solana CLI 2.x
- Anchor 0.31.1

## Setup

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

## Default Kizuna Commands

```bash
pnpm run build
pnpm run test
pnpm run lint:check
```

These commands cover the default Kizuna stack:

- `packages/kamiyo-meishi`
- `packages/kamiyo-sdk`
- `packages/kamiyo-cdp`
- `packages/kamiyo-x402-client`
- `packages/kamiyo-settlement`
- `services/wallet-control-plane`
- `services/x402-facilitator`
- `services/api`
- `apps/cdp-onboarding`

## Grouped Commands

### Core

```bash
pnpm run build:core
pnpm run test:core
pnpm run lint:core
```

### Modules

```bash
pnpm run build:modules
pnpm run test:modules
```

Use these for Kizuna-powered runtimes and apps such as Kyoshin, Keiro, OpenClaw, Hive, and agent packages.

### Legacy

```bash
pnpm run build:legacy
pnpm run test:legacy
```

Use these only when touching retained non-default integrations, demos, or contract tracks.

## Targeted Commands

```bash
pnpm run build:api
pnpm run build:sdk
pnpm run build:kyoshin
pnpm run build:oracle
pnpm run build:program
pnpm run test:onchain
```

## Core Service Runs

### x402 Facilitator

```bash
pnpm --filter @kamiyo/x402-facilitator run build
pnpm --filter @kamiyo/x402-facilitator run dev
```

### Wallet Control Plane

```bash
pnpm --filter @kamiyo/wallet-control-plane run build
pnpm --filter @kamiyo/wallet-control-plane run dev
```

### Companion API

```bash
pnpm --filter kamiyo-companion run build
pnpm --filter kamiyo-companion run dev
pnpm --filter kamiyo-companion run smoke:route-ownership
```

See `services/api/ROUTE_OWNERSHIP.md` for route bucket rules and live verification.

Default companion runtime is `kizuna-core`. Use `pnpm --filter kamiyo-companion run dev:full` or `start:full` only when you intentionally need retained module or legacy background workers in-process.

In `kizuna-core`, retained module and legacy route groups are not mounted on the public API surface.

### CDP Onboarding

```bash
pnpm --filter @kamiyo/cdp-onboarding run build
pnpm --filter @kamiyo/cdp-onboarding run dev
```

## On-chain and Contract Tracks

These are no longer the repo default.

### Solana Programs

```bash
pnpm run build:program
pnpm run test:onchain
```

### EVM Contracts

Run these only when working in the relevant legacy track.

```bash
cd contracts/zk-reputation && forge build && forge test
cd contracts/monad && forge build && forge test
cd contracts/hyperliquid && forge build && forge test
```

### Circuits

```bash
cd circuits && npm install && npm run compile
cd noir && just compile-all && just test-all
```

## CI and Release Defaults

- Required CI now validates the Kizuna core path.
- Module checks run only when module paths change.
- Legacy checks are kept off the required path.
- The manual release gate in `.github/workflows/deploy.yml` is Kizuna-first.
- Legacy contract deployment stays in `.github/workflows/legacy-contract-deploy.yml`.

## Troubleshooting

**Missing dependencies:**

```bash
pnpm install
```

**Clean built artifacts:**

```bash
pnpm run clean
```

**On-chain toolchain issues:**

```bash
solana-test-validator --reset
```
