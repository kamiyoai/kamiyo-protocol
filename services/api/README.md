# Companion API

Companion is the broad HTTP service in this repo, but its default production role is now the Kizuna ledger and billing surface.

## Kizuna role

Core responsibilities:

- credits ledger and repayment support
- internal billing and settlement hooks
- Kizuna-facing payment and operator APIs
- retained compatibility endpoints during the cutover window

Companion still contains older integrations, but they are non-default and should not drive new product work.

Partner-private Kizuna surfaces also live here when they reuse the hosted settlement and tool execution path. OOBE is the first example. Its operator guide lives in `docs/OOBE_PARTNER_INTEGRATION.md`.

## Route posture

- `protected`: authenticated operator and premium account surfaces
- `kizuna-core`: credits, repayment, funding support, billing support, Kizuna-adjacent protocol routes
- `module`: Kizuna-powered product modules that still ride the same companion service
- `legacy`: FairScale fusion, trust-graph, paranet, PoCH, and unrelated retained integrations

Public URLs stay stable in this phase. The change is repo focus, CI ownership, and documentation priority.

The route ownership source of truth lives in `src/api/route-groups/`. Keep new product work in `kizuna-core` unless it is clearly a module surface or a retained legacy integration.

Operator runbook: `ROUTE_OWNERSHIP.md`

Route coverage is enforced in tests. Any new file added under `src/api/routes/` must be classified as an owned route, an edge route, or an internal support route before it can land cleanly.

Edge and grouped routes emit `X-Kamiyo-Route-Ownership`, and retained legacy routes emit `X-Kamiyo-Route-Status: legacy` so operators can distinguish live traffic without changing public URLs.

## Endpoint inventory

- `edge`: `/verify`, `/blacklist`, `/api/auth/*`
- `protected`: `/api/v1/chat`, `/api/v1/tokens`, `/api/v1/market`, `/api/v1/reputation`
- `kizuna-core`: `/api/paid`, `/api/credits`, `/api/partners/oobe`, `/api/link-wallet`, `/internal/holders`, `/api/meishi`, `/api/meishi-dkg`, `/api/dkg`
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

Default local and production startup now runs the Kizuna-first runtime profile.

Use full mode only when you intentionally need module and legacy background workers in the same process.

```bash
pnpm --filter kamiyo-companion run dev:full
pnpm --filter kamiyo-companion run start:full
```

If you need module and legacy background workers without reopening their public routes, use the narrowed full-profile surface:

```bash
pnpm --filter kamiyo-companion run dev:full-core-surface
pnpm --filter kamiyo-companion run start:full-core-surface
```

Production start:

```bash
pnpm --filter kamiyo-companion start
```

## Runtime profile

`COMPANION_RUNTIME_PROFILE` controls background boot behavior:

- `kizuna-core` (default): only Kizuna core support loops start
- `full`: module and legacy background workers also start

`COMPANION_ROUTE_SURFACE` controls the public HTTP surface:

- `kizuna-core` (default): only protected + Kizuna core route groups are mounted
- `full`: retained module + legacy route groups are mounted too

The surface control is intentionally narrowing-only. A `kizuna-core` runtime will not widen its public routes even if `COMPANION_ROUTE_SURFACE=full` is set.

Edge routes, MCP, health, metrics, and OpenAPI stay mounted in both surfaces. `/version` reports both the live runtime profile and the live route surface.

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

Partner-private OOBE controls:

- `OOBE_PARTNER_BEARER_TOKEN`
- `OOBE_ALLOWED_TARGET_HOSTS`
- `X402_MAX_PRICE_USD`
- `X402_PREFERRED_NETWORK`
- `X402_FACILITATOR_POLICY`

Run runtime health smoke:

```bash
pnpm --filter kamiyo-companion run smoke:health
```

Run route ownership smoke against a deployed environment:

```bash
pnpm --filter kamiyo-companion run smoke:route-ownership
pnpm --filter kamiyo-companion run smoke:route-ownership -- --base-url https://staging-api.example.com
```

Verify the live runtime profile:

```bash
curl -sS https://api.kamiyo.ai/version
curl -sS https://api.kamiyo.ai/api/credits/info
```

`/version` now reports the live capability state for credits, x402, and MCP. `/api/credits/info` is always discoverable and returns `enabled: false` with a reason when deposits are intentionally disabled.
