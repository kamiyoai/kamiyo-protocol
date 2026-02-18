# Production Audit: Eliza Trust Bridge (plugin-trust integration)

## Executive Summary
The bridge is close to shippable, but previously it was brittle against upstream `@elizaos/plugin-trust` drift and had no transaction-driven evidence ingestion. The current state has contract tests against real plugin-trust, bounded state growth, and a tx-signature path with idempotency. Remaining risk is mainly operational (RPC flakiness, missing persistent idempotency across restarts) rather than correctness.

## Critical Issues (P0 - Block Release)
- [ ] None found in the audited scope after adding integration/contract tests and tx ingestion tests.

## High Priority (P1 - Fix Before Launch)
- [ ] Tx ingestion should never throw on RPC failures and should avoid redundant fetches | Impact: action crashes or rate-limit amplification | Fix: catch RPC errors and short-circuit already-recorded signatures (implemented).
- [ ] Eliza action should accept a Solscan URL/signature directly | Impact: user flow is brittle and manual | Fix: detect signature and call evidence bridge tx ingestion (implemented + tests).

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Persistent idempotency across restarts (current state uses runtime state; if non-persistent, duplicates can occur after restart) | Impact: duplicate evidence in TrustEngine | Fix: store `kamiyoTrustRecordedTx:*` in a persistent store when available (runtime-dependent).
- [ ] Expand instruction mapping beyond Anchor `Instruction:` logs if needed | Impact: missed evidence for txs that don't emit that pattern | Fix: decode instructions via IDL or stable log events when available.

## Low Priority (P3 - Technical Debt)
- [ ] Reduce noisy warnings in tests related to optional native bindings | Impact: CI log noise | Fix: optional; depends on dependency policies.

## Security Assessment
- No secrets are logged in the trust-provider tx path.
- Signature parsing is pattern-based; it does not execute remote content. Network calls are to the configured Solana RPC endpoint.

## Performance Assessment
- Evidence storage and recorded-tx lists are bounded (caps in state appenders).
- Tx path now short-circuits repeated signatures to avoid redundant RPC fetches.

## Observability Assessment
- Periodic sync errors are stored in runtime state (`kamiyoTrustLastSyncError`).
- Tx ingestion currently returns empty on failure; if you want production-grade observability, add a dedicated error state key and/or structured logger hook (runtime-dependent).

## Test Coverage Gaps
- No end-to-end test that drives Eliza runtime + real RPC (intentionally avoided for determinism).
- No concurrency test for simultaneous tx recordings (state updates are sequential in code paths but runtime backing store semantics vary).

## Action Plan
1. Keep plugin-trust contract + bridge integration tests as gatekeepers for upstream changes.
2. If duplicates are unacceptable, move recorded-tx state to a persistent store (db/kv) behind runtime capability checks.
3. Consider adding an allowlist of program IDs per network and reject mismatches early for tx ingestion.

