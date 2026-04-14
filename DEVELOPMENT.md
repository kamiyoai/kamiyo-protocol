# Development Workflows

This repo now defaults to the Kizuna core path.

Use the root commands unless you are intentionally working in a module or retained legacy area.

## Default Loop

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint:check
```

## Workspace Lanes

### Core

Use for Kizuna rails, settlement, funding, credits, repayment, Meishi, and onboarding.

```bash
pnpm run build:core
pnpm run test:core
pnpm run lint:check
```

### Modules

Use for Kizuna-powered runtimes and client surfaces such as Kamiyo Agent, Keiro, OpenClaw, Hive, and agent packages.

```bash
pnpm run build:modules
pnpm run test:modules
```

### Legacy

Use only when touching retained non-default integrations or old contract tracks.

```bash
pnpm run build:legacy
pnpm run test:legacy
```

## Core Service Checks

### Companion API

```bash
pnpm --filter kamiyo-companion run build
pnpm --filter kamiyo-companion run smoke:health
pnpm --filter kamiyo-companion run smoke:route-ownership
```

Default companion startup is now Kizuna-first:

```bash
pnpm --filter kamiyo-companion run dev
pnpm --filter kamiyo-companion run start
```

Only use full runtime when you explicitly need module and legacy workers:

```bash
pnpm --filter kamiyo-companion run dev:full
pnpm --filter kamiyo-companion run start:full
```

If you need those background workers without reopening their public routes, use:

```bash
pnpm --filter kamiyo-companion run dev:full-core-surface
pnpm --filter kamiyo-companion run start:full-core-surface
```

In default core mode, retained module and legacy route groups are not mounted. `/version` reports the live runtime profile, route surface, and capability state so operators can distinguish a disabled integration from a broken deploy.

### x402 Facilitator

```bash
pnpm --filter @kamiyo/x402-facilitator run build
pnpm --filter @kamiyo/x402-facilitator run test
```

### Wallet Control Plane

```bash
pnpm --filter @kamiyo/wallet-control-plane run build
pnpm --filter @kamiyo/wallet-control-plane run test
```

## Route Ownership Rule

In `services/api`, every route file must be placed in one of these buckets:

- `protected`
- `kizuna-core`
- `module`
- `legacy`
- edge or support-only

The source of truth lives in `services/api/src/api/route-groups/`.

Before landing companion API changes, run:

```bash
pnpm --filter kamiyo-companion exec vitest run src/__tests__/api-route-groups.test.ts
pnpm --filter kamiyo-companion run smoke:route-ownership
```

## Render Safety

Before any Render action from this repo:

```bash
renderctl status
renderctl bind nvrevr
renderctl guard
```

Do not deploy or inspect live services if `renderctl guard` fails.

## Production Checks

Use these when validating the live Kizuna path:

```bash
pnpm run smoke:companion:route-ownership
pnpm run smoke:enterprise
```
