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

## Found Gaps

### P0 gaps (must fix before claiming plug-and-play)

1. MCP tool discoverability/execution mismatch:
   - Some implemented tools were not exposed in `ListTools`.
   - Some exposed tools had no call path in server dispatch.
2. SDK live smoke path was missing:
   - No first-party script proving create-agent + escrow + dispute on devnet with a funded key.
3. Inconsistent runtime behavior around optional env:
   - Several integrations silently degrade instead of returning actionable setup errors.

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

## Remaining Work to Reach A+

1. Finalize and test Paranet runtime handlers against a configured DKG endpoint.
2. Add meishi-mcp tool-level smoke coverage and explicit env diagnostics.
3. Introduce root-level `smoke:enterprise` command and CI enforcement for tool parity.
4. Convert warning-prone package export patterns and peer-dependency drift into tracked cleanup tickets.
