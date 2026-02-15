# Production Audit: Percolator Risk Harnesses (kani-solana)

## Executive Summary
The Percolator-style `risk` module was added to `kani-solana`, but as-shipped it would have been linked into on-chain program dependencies (breaking the crate's "no-op unless Kani" contract) and contained multiple integer-overflow / lossy-cast hazards that would either panic under overflow-checks or invalidate proofs. This pass gates the module correctly, makes the math routines overflow-safe, tightens the proof harnesses to realistic Solana-sized domains, and ensures CI actually runs the new proofs by including `kani-solana` in the default Kani package set.

## Critical Issues (P0 - Block Release)
- [x] `kani-solana::risk` was not behind `#[cfg(kani)]` | Impact: extra code could be pulled into on-chain binaries via normal dependencies | Fix: gate `risk` module behind `#[cfg(kani)]` in `crates/kani-solana/src/lib.rs`.
- [x] Overflow/UB hazards in core formulas | Impact: runtime panics with `overflow-checks = true`, and proof obligations could be vacuously true/false due to overflow | Fix: use saturating totals, overflow-safe mul/div patterns, and remove lossy `as i128` casts.

## High Priority (P1 - Fix Before Launch)
- [x] Proof harness assumptions used overflow-prone expressions (`c + i`, `x * h_num`) | Impact: invalid Kani assumptions and spurious proof results | Fix: rewrite proofs to avoid overflow-prone arithmetic and restrict to u64/i64 domains.
- [x] New proofs were not executed in CI (package not verified by default) | Impact: regressions could land silently | Fix: add `kani-solana` to default package list in `scripts/kani.sh` and `scripts/kani-ci.sh`; update `KANI.md`.

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Confirm the intended upstream reference for "Percolator" | Impact: spec drift risk if formulas were sourced from a different codebase than intended | Fix: pin a link/reference in-module once the canonical upstream is confirmed.

## Security Assessment
- Integer overflow and lossy cast fixes remove panic paths that could otherwise be triggered by adversarial inputs if these routines were ever reused in runtime code.
- Gating the module behind `#[cfg(kani)]` ensures no accidental inclusion in production program builds.

## Performance Assessment
- Proof harnesses now draw from u64/i64 ranges which keeps Kani's state space aligned with Solana token/lamport domains and improves verification runtime stability.

## Observability Assessment
- Kani artifacts already upload per-package logs + summary; adding `kani-solana` to the default set means its proof status is now visible in the same artifacts/receipts.

## Recommended Architecture Changes
- If these risk math routines are intended for runtime reuse (not just formal specs), move them to a dedicated, non-Kani crate and keep `kani-solana` purely as proof-only harness code.

## Test Coverage Gaps
- No unit tests are added (by design); correctness is established via Kani proofs. If you want fast regression checks without Kani, add conventional `#[test]` cases in a separate, runtime-safe math crate.

## Action Plan
1. Gate `kani-solana::risk` behind `#[cfg(kani)]`.
2. Harden arithmetic in `haircut_ratio`, `effective_pnl`, `warmup_slope`, and `funding_payment` against overflow and lossy casting.
3. Rewrite Kani proofs to avoid overflow-prone assumptions and to model u64/i64 domains.
4. Ensure `kani-solana` is included in the default Kani package set and update `KANI.md` accordingly.
