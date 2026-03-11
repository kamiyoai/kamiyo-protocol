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

- `protected`: authenticated operator and premium account surfaces
- `kizuna-core`: credits, repayment, funding support, billing support, Kizuna-adjacent protocol routes
- `module`: Kizuna-powered product modules that still ride the same companion service
- `legacy`: FairScale fusion, trust-graph, paranet, PoCH, and unrelated retained integrations

Public URLs stay stable in this phase. The change is repo focus, CI ownership, and documentation priority.

The route ownership source of truth lives in `src/api/route-groups/`. Keep new product work in `kizuna-core` unless it is clearly a module surface or a retained legacy integration.

Route coverage is enforced in tests. Any new file added under `src/api/routes/` must be classified as an owned route, an edge route, or an internal support route before it can land cleanly.

Grouped routes also emit `X-Kamiyo-Route-Ownership`, and retained legacy routes emit `X-Kamiyo-Route-Status: legacy` so operators can distinguish live traffic without changing public URLs.

## Endpoint inventory

- `edge`: `/verify`, `/blacklist`, `/api/auth/*`
- `protected`: `/api/v1/chat`, `/api/v1/tokens`, `/api/v1/market`, `/api/v1/reputation`
- `kizuna-core`: `/api/paid`, `/api/credits`, `/api/link-wallet`, `/internal/holders`, `/api/meishi`, `/api/meishi-dkg`, `/api/dkg`
- `module`: `/api/hive`, `/api/hive-teams`, `/api/swarm-teams`, `/api/buyback`, `/api/channels`, `/api/kamiyo`
- `legacy`: `/api/trust-graph`, `/api/fusion/fairscale`, `/api/paranet`, `/api/poch`, `/api/staking/referrals`, `/babyagi/v1`
- `support-only`: `hive-swarm`, `poch-store`

The API entrypoint mounts edge routes and owned route groups separately, so auth/verification flow stays isolated from Kizuna and retained legacy product surfaces.

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

Run route ownership smoke against a deployed environment:

```bash
pnpm --filter kamiyo-companion run smoke:route-ownership
pnpm --filter kamiyo-companion run smoke:route-ownership -- --base-url https://staging-api.example.com
```
