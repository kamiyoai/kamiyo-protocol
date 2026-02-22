# Deterministic Coordination Hardening Plan

**Date**: 2026-02-22 (UTC)  
**Scope**: foundational trust-layer engine, trust-layer service replay boundary, truth-court verifiable coordination primitives  
**Repository branch at start**: `kamiyo/sendai-trust-layer-skill-review`

## Objective

Harden deterministic coordination logic and replay verifiability for core trust/coordination primitives, then perform a production-readiness cleanup pass while preserving external behavior.

## Baseline

- `cargo test -p kamiyo-trust-layer` passed.
- `cargo test -p trust-layer-service` passed.
- `pnpm --filter @kamiyo/mcp-server run test:truth-court` passed.
- `pnpm --filter @kamiyo/mcp-server run test:truth-court:gauntlet` passed.
- `pnpm --filter @kamiyo/mcp-server run test:truth-court:attestation` passed.

## Findings Driving This Plan

### P0

- `TrustLayer::verify_receipt` does not verify full receipt integrity against the canonical stored receipt. A tampered receipt body (evaluation fields) can pass hash/state checks under current logic.

### P1

- `TrustLayer::from_snapshot` does not validate replayed receipt evaluation consistency after state reconstruction.
- Snapshot replay accepts receipt policy-version drift without strict replay provenance guarantees.
- Truth-court runtime response validation does not enforce verdict membership at runtime.
- Truth-court replay verification silently de-duplicates repeated oracle names, which can hide replay-bundle tampering.

### P2

- Truth-court summary generation is order-sensitive to asynchronous oracle completion order.

## Execution Plan

1. Trust-layer deterministic receipt hardening
- Tighten `verify_receipt` to require canonical receipt identity and deterministic state alignment.
- Add replay-time receipt consistency validation in `from_snapshot`.
- Fail snapshot restore when journal receipt policy versions diverge from snapshot policy version (no policy-history replay support is encoded in snapshot shape).
- Add regression tests that prove tampering is rejected.

2. Truth-court validation/replay hardening
- Enforce runtime verdict validation against allowed verdict set.
- Detect duplicate oracle identities in replay bundle and observed responses during replay verification.
- Make summary factor selection deterministic by canonical ordering.
- Add regression tests for invalid verdict rejection and duplicate-oracle replay tampering.

3. Cleanup pass
- Refactor touched logic for clarity with no behavior drift outside hardening intent.
- Keep code flat/explicit and remove incidental complexity.

4. Verification
- Re-run targeted Rust and TypeScript suites for modified areas.
- Confirm no regressions in deterministic outputs and replay validation.

5. Branch/merge workflow
- Create task branches with `kamiyo/` prefix.
- Commit hardening and cleanup increments.
- Merge task branches back into start branch.
- Delete task branches after successful merge.

## Acceptance Criteria

- Tampered trust-layer receipts are rejected deterministically.
- Snapshot replay rejects inconsistent/tampered receipt data.
- Truth-court rejects malformed verdicts and duplicate-oracle replay bundles.
- Deterministic summary content is stable for equivalent accepted oracle sets.
- All targeted tests pass.

## Execution Status

- [x] Plan authored before code changes.
- [x] Trust-layer hardening implemented.
- [x] Truth-court hardening implemented.
- [x] Cleanup pass completed on replay comparison path.
- [x] Targeted verification suites passed.
