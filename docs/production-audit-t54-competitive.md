# Production Audit: T54 Competitive Gap (Kamiyo Protocol)

Date: 2026-02-27  
Scope: Enterprise evaluation of Kamiyo as agent infra, benchmarked against T54 docs surface

## Executive Summary

T54 is ahead on onboarding clarity and golden-path execution, not on protocol breadth. Kamiyo has broader capability (escrow/dispute, trust layer, MCP, SDK, service stack), but enterprise operators lose time because setup, readiness, and tool-wiring guarantees are less deterministic than they should be. The gap is operational productization, not core technical primitives.

## Competitor Evidence (T54)

Observed from public docs:

1. Strongly guided onboarding (`overview`, API keys, sandbox vs production, quickstart).
2. Focused MCP surface for `tLedger MCP` with a short tool list (`calculateLiquidity`, `openTrustline`, `confirmSwapIntent`, `executeAtomicSwap`).
3. Explicit SDK integration and production deployment sections.
4. Clear Trustline/validator/risk architecture pages and payment-risk-control framing.
5. Dedicated `x402-secure` positioning for paid agent/API workflows.

Reference URLs:

- https://www.t54.ai/docs
- https://docs.t54.ai/docs/platform/tledger-mcp
- https://docs.t54.ai/docs/platform/tledger-sdk
- https://docs.t54.ai/docs/platform/tledger-quickstart
- https://docs.t54.ai/docs/risk-fraud/technical-architecture
- https://docs.t54.ai/docs/payments-risk-control
- https://docs.t54.ai/docs/risk-fraud/x402-secure

## Where T54 Is Ahead Today

## P0 (Immediate)

- Deterministic operator journey:
  - T54: short, opinionated “do this next” flow.
  - Kamiyo (before this run): docs existed but no single command enforcing end-to-end readiness.
- Tool-contract trust:
  - T54 surface is smaller and easier to keep coherent.
  - Kamiyo had risk of list/dispatch drift with many MCP tools.

## P1 (High)

- Clear separation between non-live checks and live credential checks.
- Faster pre-demo confidence for enterprise teams running internal pilots.

## Where Kamiyo Is Already Stronger

1. Broader protocol scope: escrow/dispute/truth-court, MCP + SDK + multi-service runtime.
2. Real devnet dispute lifecycle support in first-party SDK smoke flow.
3. Existing live env diagnostics for CDP + Paranet in MCP (`test:live-config`, env status tools).

## Priority Plan To Beat T54

## Phase 1 (Now)

1. Add deterministic root preflight/smoke commands.
2. Add hard CI gate for MCP listTools vs dispatch parity.
3. Expose the enterprise golden path in root + package docs.

## Phase 2 (Next)

1. Create profile-based env bundles (`local`, `devnet-live`, `production`) with strict schema validation.
2. Add service readiness probes for API/operator process startup and dependency reachability.
3. Add first-class “guided transaction paths” docs for escrow, dispute, paranet publish/attest, and x402.

## Phase 3 (Scale)

1. Add enterprise SLO package:
  - success/failure rates per tool family
  - retry/fallback behavior
  - standardized incident runbooks
2. Add release gate proving each high-value path works in CI/nightly.

## Execution Log (This Run)

- [x] Added root enterprise readiness runner: `scripts/enterprise-readiness.mjs`.
- [x] Added root commands:
  - `pnpm run preflight:enterprise` (CI/static mode)
  - `pnpm run smoke:enterprise` (live mode)
- [x] Added MCP tool parity checker:
  - `packages/kamiyo-mcp/scripts/check-tool-parity.mjs`
  - `pnpm --filter @kamiyo/mcp-server run test:tool-parity`
- [x] Wired MCP parity gate into CI workflow.
- [x] Added service-level env preflights:
  - `services/api/scripts/preflight-env.mjs`
  - `services/kamiyo-operator/scripts/preflight-env.mjs`
- [x] Wired service env preflights into enterprise readiness runner (contract + runtime mode).
- [x] Added runtime smoke checks:
  - API `/health` + `/ready` smoke
  - operator isolated boot smoke
  - MCP stdio handshake smoke
- [x] Added per-tool MCP test coverage metadata gate:
  - `packages/kamiyo-mcp/scripts/tool-test-coverage.json`
- [x] Added nightly live enterprise canary:
  - `.github/workflows/nightly-enterprise-canary.yml`
- [x] Updated onboarding docs to surface the golden path:
  - root README
  - MCP README
  - SDK README
  - API README
  - Operator README

## Remaining Gaps (Not Done Yet)

- [ ] Add deeper env schema/type validation (ranges, enums, mutual exclusion) beyond required-key checks.
- [ ] Populate canary secrets and verify first green nightly run for CDP + Paranet transaction paths.
- [ ] Unified enterprise runbook that maps each major use case to exact commands and expected outputs.
