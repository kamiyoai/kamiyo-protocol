# Companion API

Companion is the broad HTTP service in this repo, but its default production role is now the Kizuna ledger and billing surface.

## Kizuna role

Core responsibilities:

- credits ledger and repayment support
- internal billing and settlement hooks
- Kizuna-facing payment and operator APIs
- retained compatibility endpoints during the cutover window

Companion still contains older integrations, but they are non-default and should not drive new product work.

## Route posture

- `kizuna-core`: credits, repayment, funding support, billing support, Kizuna-adjacent protocol routes
- `legacy`: FairScale fusion, trust-graph, paranet, PoCH, and unrelated retained integrations

Public URLs stay stable in this phase. The change is repo focus, CI ownership, and documentation priority.

## Run

```bash
pnpm install
pnpm --filter kamiyo-companion run build
pnpm --filter kamiyo-companion run dev
```

Production start:

```bash
pnpm --filter kamiyo-companion start
```

## Environment

Copy `.env.example` to `.env` and set values for your deployment profile.

At minimum for local startup, configure:

- `PORT` or `API_PORT`
- `SOLANA_RPC_URL`
- `JWT_SECRET`
- `API_SECRET`

The full env contract is listed in `.env.example`.

Validate env contract and runtime values:

```bash
pnpm --filter kamiyo-companion run preflight:contract
pnpm --filter kamiyo-companion run preflight:env
```

Run runtime health smoke:

```bash
pnpm --filter kamiyo-companion run smoke:health
```
