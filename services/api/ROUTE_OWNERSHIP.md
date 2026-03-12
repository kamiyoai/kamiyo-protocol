# Companion Route Ownership

Companion still carries a mix of Kizuna surfaces, product modules, and retained legacy integrations. Public URLs stay stable, but ownership is explicit so the service can keep tightening around Kizuna without breaking clients.

## Ownership Buckets

### `protected`

Authenticated operator and premium surfaces.

Examples:

- `/api/v1/chat`
- `/api/v1/tokens`
- `/api/v1/market`
- `/api/v1/reputation`

### `kizuna-core`

Default product surface. New payment, funding, billing, credits, repayment, or Kizuna-adjacent work goes here unless there is a clear reason not to.

Examples:

- `/api/paid`
- `/api/credits`
- `/api/link-wallet`
- `/internal/holders`
- `/api/meishi`
- `/api/meishi-dkg`
- `/api/dkg`

### `module`

Kizuna-powered product modules that still share the companion service.

Examples:

- `/api/hive`
- `/api/hive-teams`
- `/api/swarm-teams`
- `/api/buyback`
- `/api/channels`
- `/api/kamiyo`

### `legacy`

Retained integrations that still run, but should not define new product work.

Examples:

- `/api/trust-graph`
- `/api/fusion/fairscale`
- `/api/paranet`
- `/api/poch`
- `/api/staking/referrals`
- `/babyagi/v1`

### Edge and support-only

These stay outside the owned buckets.

- edge: `/verify`, `/blacklist`, `/api/auth/*`
- support-only: `hive-swarm`, `poch-store`

## Headers on Live Traffic

Grouped and edge routes emit:

- `X-Kamiyo-Route-Ownership`

Retained legacy routes also emit:

- `X-Kamiyo-Route-Status: legacy`

Use those headers to verify live routing without changing public URLs.

## Runtime split

Companion now also has an explicit process profile:

- `kizuna-core`: default. Boots Kizuna support loops only and mounts only `protected` + `kizuna-core` route groups.
- `full`: also boots module and legacy background workers and mounts those retained route groups.

This is the next cutover step: retained routes still exist, but only on an explicit full-profile process.

## Placement Rule

When adding or moving a route in `src/api/routes/`:

1. Default to `kizuna-core`.
2. Use `module` only if the route belongs to a Kizuna-powered product surface.
3. Use `legacy` only for retained integrations already in deprecation posture.
4. Keep auth and verify paths in edge.
5. Keep internal support routers out of the public ownership buckets.

The source of truth lives in `src/api/route-groups/`.

## Required Checks

Before merging companion ownership changes:

```bash
pnpm --filter kamiyo-companion exec vitest run src/__tests__/api-route-groups.test.ts
pnpm --filter kamiyo-companion run build
pnpm --filter kamiyo-companion run smoke:route-ownership
```

Repo-default validation:

```bash
pnpm run lint:check
pnpm run build:core
pnpm run test:core
```

## Live Verification

After deploying companion:

```bash
curl -sS https://api.kamiyo.ai/version
curl -sSI https://api.kamiyo.ai/api/credits/info
curl -sSI https://api.kamiyo.ai/api/fusion/fairscale/health
pnpm run smoke:companion:route-ownership
```

Expected result:

- `/api/credits/info` returns `X-Kamiyo-Route-Ownership: kizuna-core`
- `/version` reports `runtime.profile`
- in `kizuna-core` profile:
  - `/api/hive/health` returns `404`
  - `/api/fusion/fairscale/health` returns `404`
- in `full` profile:
  - `/api/hive/health` returns `X-Kamiyo-Route-Ownership: module`
  - `/api/fusion/fairscale/health` returns `X-Kamiyo-Route-Ownership: legacy`
  - `/api/fusion/fairscale/health` returns `X-Kamiyo-Route-Status: legacy`

## Failure Handling

If ownership headers are missing on live traffic:

1. confirm the deployed commit from `/version`
2. check the latest companion deploy status in Render
3. rerun `pnpm run smoke:companion:route-ownership`
4. if live traffic is still on the old commit, trigger a manual deploy for the current `main` commit
