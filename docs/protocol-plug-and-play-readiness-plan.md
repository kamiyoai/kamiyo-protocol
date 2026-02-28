# KAMIYO Protocol Plug-and-Play Readiness Plan

Date: 2026-02-26  
Owner: Protocol engineering

## Goal

Ship KAMIYO as open-source agent infrastructure that an enterprise can install, configure, and run without patching code, guessing env vars, or reverse-engineering missing flows.

Success criteria:

1. Fresh checkout -> install -> build -> test passes without manual fixes.
2. SDK can deploy an agent and execute escrow/dispute on devnet using documented defaults.
3. MCP servers expose only callable tools, and every listed tool has an implemented handler path.
4. Core services provide deterministic startup diagnostics for missing config/dependencies.
5. Security blockers are tracked with owner, severity, and due state.

## What Works Now

1. Workspace recursive build passes.
2. Workspace recursive tests pass.
3. `@kamiyo/mcp-server` devnet integration (escrow + dispute) passes end-to-end.
4. `services/api` and `services/x402-facilitator` build and test successfully.
5. Program IDL alignment for escrow/dispute path is corrected in MCP and API wrappers.
6. SDK devnet smoke passes (fund wallet, create agent, init reputation, create agreement, mark disputed).
7. `@kamiyo/mcp-server` full test bundle (`test:all`) passes, including truth-court suites.
8. `@kamiyo/meishi-mcp` tool handlers execute deterministically with clear validation/config errors.

## Found Gaps

### P0 gaps (must fix before claiming plug-and-play)

1. MCP tool discoverability/execution mismatch:
   - Some implemented tools were not exposed in `ListTools`.
   - Some exposed tools had no call path in server dispatch.
2. SDK live smoke path was missing:
   - No first-party script proving create-agent + escrow + dispute on devnet with a funded key.
3. Inconsistent runtime behavior around optional env:
   - Several integrations silently degrade instead of returning actionable setup errors.
4. Program ID usage is easy to misconfigure in ad-hoc runs:
   - A single typo in `KAMIYO_PROGRAM_ID` produces non-obvious runtime failures.
5. Native module drift can break tests after Node changes:
   - `better-sqlite3` required rebuild for current Node ABI.
6. Lockfile integrity can be corrupted by bad merges:
   - `pnpm-lock.yaml` became unparsable and had to be regenerated.

### P1 gaps (high priority hardening)

1. Tool-level contract coverage is uneven (especially secondary MCP server and integration adapters).
2. Config surface is fragmented (multiple env names for equivalent settings, weak discoverability).
3. Warning-only dependency and export issues remain (non-blocking but noisy for enterprise CI).

### P2 gaps (quality and adoption)

1. Missing one-command enterprise smoke workflow from repo root.
2. Missing release gate for “new MCP tool added but not wired/listed/tested”.
3. Incomplete operator docs for production runbooks and failure triage.

## Execution Plan

## Phase 1 (Done/In Progress) - Unblock core protocol path

1. Done: Align Solana IDLs and account wiring for escrow/dispute flow in MCP + API.
2. Done: Fix PDA/transaction ID compatibility to match deployed program behavior.
3. Done: Restore recursive build/test green state across workspace.
4. Done: Validate funded devnet keypair path and run live MCP escrow/dispute integration.
5. In progress: Complete MCP tool exposure/dispatch parity and cover all listed tool families.

## Phase 2 (Next) - Make installation and operations deterministic

1. Add single root smoke command:
   - SDK devnet deploy flow
   - MCP live integration flow
   - API service health flow
2. Standardize env var contract with canonical names + aliases + startup validation.
3. Add CI gate:
   - fail if tool definitions and switch handlers diverge.
   - fail if new tool has no test or explicit exemption.

## Phase 3 (Next) - Enterprise runtime hardening

1. Add structured startup diagnostics per service (missing env, RPC reachability, dependency availability).
2. Add runbook docs for:
   - devnet bootstrap
   - production bootstrap
   - incident triage for escrow/dispute/oracle failures
3. Resolve medium-priority security/dependency debt called out in `docs/security-dependency-triage.md`.

## Execution Log (This Run)

1. Fixed MCP/API escrow-dispute program/IDL mismatches and seed compatibility.
2. Fixed workspace build/test blockers discovered during full recursive validation.
3. Added MCP tool definition parity work for CDP/Kamino/DKG and dispatch wiring for DKG/Paranet.
4. Added SDK devnet smoke runner: `packages/kamiyo-sdk/scripts/devnet-smoke.cjs`.
5. Repaired bad kyoshin merge state (removed committed conflict markers, restored build/test stability).
6. Rebuilt `better-sqlite3` to fix Node ABI mismatch and revalidated previously failing service tests.
7. Regenerated broken `pnpm-lock.yaml` to restore deterministic dependency resolution.
8. Revalidated live devnet flows using funded agent wallet:
   - MCP integration: 14/14 pass
   - SDK smoke: pass (`agreementStatus: disputed`)
9. Exercised secondary MCP handlers:
   - CDP: all tool functions return deterministic config errors without crashing when env is missing.
   - DKG/Paranet: all tool handlers return deterministic validation/config responses.
   - Meishi MCP: all exported tools execute and return expected validation/not-found outputs.
10. Added live credential/endpoints readiness hardening:
    - CDP env resolution now supports canonical + Coinbase alias keys with deterministic missing-var diagnostics.
    - MCP now exposes `paranet_env_status` and upgraded `cdp_env_status` with env source tracing.
    - MCP Paranet runtime now accepts `PARANET_*`, `DKG_*`, and `KAMIYO_DKG_*` aliases.
    - API Paranet/DKG routes now resolve the same alias families.
    - Agent-paranet pre-deploy verifier now resolves alias env families and reports source keys.
    - Added `@kamiyo/mcp-server` live preflight command: `test:live-config`.

## Remaining Work to Reach A+

1. Finalize and test Paranet runtime handlers against a configured DKG endpoint with real credentials.
2. Expand root `smoke:enterprise` command to include explicit API/operator runtime health probes in addition to MCP+SDK checks.
3. Add CI guard for lockfile integrity and native dependency ABI sanity checks.
4. Extend MCP parity gate to also enforce minimum per-tool test coverage metadata.
5. Convert peer-dependency and export warnings into tracked cleanup tickets with owners and deadlines.

## Update 2026-02-27 (T54 Competitive Pass)

1. Added root enterprise readiness runner: `scripts/enterprise-readiness.mjs`.
2. Added root commands:
   - `pnpm run preflight:enterprise`
   - `pnpm run smoke:enterprise`
3. Added MCP parity checker: `packages/kamiyo-mcp/scripts/check-tool-parity.mjs`.
4. Added package-level script: `pnpm --filter @kamiyo/mcp-server run test:tool-parity`.
5. Added CI gate (`.github/workflows/ci.yml`) to block MCP list/dispatch drift.
6. Fixed MCP listTools gaps by exposing Paranet, DKG, and Elfa tool families in `packages/kamiyo-mcp/src/index.ts`.
7. Added canonical `x402_check_pricing` to listTools while preserving legacy dispatch alias support.
8. Added service-level env preflight scripts:
   - `services/api/scripts/preflight-env.mjs`
   - `services/kamiyo-operator/scripts/preflight-env.mjs`
9. Added service env checks into `scripts/enterprise-readiness.mjs`:
   - contract checks in CI mode
   - runtime checks in live mode
10. Added runtime smoke checks in `scripts/enterprise-readiness.mjs` live mode:
    - API health (`services/api/scripts/smoke-health.mjs`)
    - Operator boot (`services/kamiyo-operator/scripts/smoke-boot.mjs`)
    - MCP stdio handshake (`packages/kamiyo-mcp/scripts/smoke-stdio.mjs`)
11. Extended MCP parity gate with per-tool coverage metadata:
    - `packages/kamiyo-mcp/scripts/tool-test-coverage.json`
12. Added nightly live canary workflow:
    - `.github/workflows/nightly-enterprise-canary.yml`

## Update 2026-02-28 (CDP Infra Hardening)

1. Added MCP transaction-level CDP smoke runner:
   - `packages/kamiyo-mcp/tests/test-live-cdp-transaction.ts`
   - package script: `pnpm --filter @kamiyo/mcp-server run test:live-cdp-transaction`
2. Wired transaction-level CDP smoke into enterprise live mode (`smoke:enterprise`) after MCP live preflight.
3. Updated nightly canary workflow with stable account + policy config contract and nightly CDP artifact upload:
   - `.github/workflows/nightly-enterprise-canary.yml`
4. Added weekly CDP create-path workflow (fresh policy create + attach + artifact + failure alert):
   - `.github/workflows/weekly-cdp-create-path.yml`
5. Extended weekly secret/env parity audit to enforce new CDP canary config keys.
6. Added parity workflow failure notification through the canary webhook path.
7. Added CDP runbook with nightly vs weekly mode behavior, expected failure modes, and temporary webhook replacement procedure:
   - `docs/cdp-canary-runbook.md`
