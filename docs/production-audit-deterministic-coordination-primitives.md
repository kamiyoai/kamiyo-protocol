# Production Audit: deterministic coordination primitives

**Audit Date**: 2026-02-22 (UTC)  
**Scope**:
- `crates/kamiyo-trust-layer/src/engine.rs`
- `crates/kamiyo-trust-layer/tests/engine.rs`
- `services/trust-layer-service/src/replay.rs`
- `packages/kamiyo-mcp/src/truth-court/engine.ts`
- `packages/kamiyo-mcp/tests/test-truth-court.ts`
- `docs/deterministic-coordination-hardening-plan.md`  
**Verdict**: SHIP WITH FIXES APPLIED

## Executive Summary

The deterministic coordination path was close to production-ready but had critical replay-verification gaps: trust-layer receipt verification accepted tampered receipt bodies, snapshot restore did not enforce receipt evaluation integrity, and truth-court replay checks could silently accept duplicate-oracle tampering. These issues are now hardened with strict runtime validation, deterministic ordering for summary material, and targeted regression tests proving tamper rejection.

## Critical Findings Count

| Severity | Count | Status |
| --- | --- | --- |
| Critical (P0) | 1 | fixed |
| High (P1) | 4 | fixed |
| Medium (P2) | 1 | fixed |
| Low (P3) | 0 | none |

## Detailed Findings

### [P0] Canonical receipt tampering was not fully detected
**Location**: `crates/kamiyo-trust-layer/src/engine.rs` (`verify_receipt`)  
**Impact**: A manipulated receipt body could pass verification when hash/sequence fields still aligned with head state.  
**Fix**: `verify_receipt` now requires full canonical receipt identity against indexed event receipts in addition to deterministic state/hash checks.

### [P1] Snapshot replay lacked receipt evaluation integrity checks
**Location**: `crates/kamiyo-trust-layer/src/engine.rs` (`from_snapshot`)  
**Impact**: Snapshot restore could accept replayed entries with mutated decision/evaluation details.  
**Fix**: Added strict replay-time receipt validation (`issued_at`, evaluation recomputation, policy-version consistency).

### [P1] Snapshot replay accepted policy-version drift without encoded policy history
**Location**: `crates/kamiyo-trust-layer/src/engine.rs` (`from_snapshot`)  
**Impact**: Journal entries could declare policy versions inconsistent with snapshot policy provenance.  
**Fix**: Snapshot restore now rejects journal entries whose receipt policy version differs from snapshot policy version.

### [P1] Truth-court runtime validation did not enforce verdict membership
**Location**: `packages/kamiyo-mcp/src/truth-court/engine.ts` (`validateOracleResponse`)  
**Impact**: Malformed oracle verdicts could pass schema gate and pollute committee accounting.  
**Fix**: Added runtime verdict validation against allowed verdict set.

### [P1] Replay verification could hide duplicate-oracle tampering
**Location**: `packages/kamiyo-mcp/src/truth-court/engine.ts` (`verifyTruthCourtReplayBundle`)  
**Impact**: Duplicate oracle entries were silently collapsed by map construction, reducing tamper visibility.  
**Fix**: Added duplicate-oracle detection for both replay bundles and observed responses; duplicates now force replay failure.

### [P2] Summary text depended on async oracle completion order
**Location**: `packages/kamiyo-mcp/src/truth-court/engine.ts` (`buildSummary`, evaluate success path)  
**Impact**: Equivalent accepted oracle sets could produce non-canonical summaries.  
**Fix**: Canonical sorting of accepted responses and factor ordering before summary derivation.

## Security Assessment

- Tamper resistance for trust receipts is materially stronger due to canonical receipt identity checks.
- Snapshot replay now validates deterministic decision artifacts rather than trusting persisted receipt bodies.
- Truth-court replay validation now rejects duplicate-oracle manipulation patterns that previously collapsed silently.
- No new external dependency or secret-handling risk was introduced.

## Performance Assessment

- Added checks are O(1) or O(n log n) over small oracle committee sizes.
- Trust-layer replay validation adds deterministic evaluation recomputation per event; cost is minimal relative to I/O.
- No throughput regression expected in normal operation.

## Observability Assessment

- Existing metrics/logging surface remains intact.
- Replay mismatch logging still emits offset/event context.
- Truth-court replay report now surfaces duplicate-oracle tampering via `mismatchedOracles`.

## Recommended Architecture Changes

1. Encode policy-history transitions explicitly in snapshot journal if multi-version receipt replay must be supported across policy changes.
2. Add a dedicated invariant test matrix for replay bundle tampering permutations (duplicates, missing, reordered, forged digest).
3. Add a compact conformance suite that verifies canonical summary and committee hash outputs for fixed oracle fixtures.

## Test Coverage Gaps

- No property-based fuzzing for snapshot corruption permutations in trust-layer restore.
- No load-level benchmark for truth-court evaluation path with larger committees.

## Action Plan

### Immediate (completed)

- [x] Harden trust-layer receipt verification against body tampering.
- [x] Add snapshot replay receipt-consistency validation.
- [x] Enforce truth-court verdict runtime validation.
- [x] Reject duplicate-oracle replay tampering.
- [x] Canonicalize summary generation order.
- [x] Add regression tests for each hardening point.

### Short-term

- [ ] Add policy-history model to snapshot format if mixed-policy replay must be supported.
- [ ] Add fuzz tests for corrupted snapshot/journal payloads.

### Medium-term

- [ ] Add CI replay-conformance fixtures for deterministic summary/committee outputs.

## Verification Performed

- `cargo test -p kamiyo-trust-layer` (pass)
- `cargo test -p trust-layer-service` (pass)
- `pnpm --filter @kamiyo/mcp-server run test:truth-court` (pass)
- `pnpm --filter @kamiyo/mcp-server run test:truth-court:gauntlet` (pass)
- `pnpm --filter @kamiyo/mcp-server run test:truth-court:attestation` (pass)
