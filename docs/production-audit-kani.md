# Production Audit: Kani CI + `kani-solana`

## Executive Summary
Kani verification is set up correctly, but it is not operationally reliable on `main` because the job is expensive, gets cancelled frequently via workflow concurrency, and does unnecessary work (submodule checkout). The result is a CI signal that is often missing when you need it most.

This audit focuses on: `.github/workflows/kani.yml`, `scripts/kani-ci.sh`, `scripts/kani-audit.sh`, and `crates/kani-solana/`.

## Critical Issues (P0 - Block Release)
- [ ] Kani signal is frequently absent on `main` due to `cancel-in-progress: true` and long runtime. Impact: flaky required checks; wasted CI compute. Fix: do not cancel runs on `main`.
- [ ] Kani workflow does unnecessary submodule checkouts. Impact: slower CI and extra failure surface. Fix: remove submodule checkout for Kani jobs.

## High Priority (P1 - Fix Before Launch)
- [ ] Kani workflow runs heavyweight packages by default. Impact: runtime grows beyond practical PR cadence. Fix: default to verifying only `kani-solana` on `push`/`pull_request`, and allow larger runs via `workflow_dispatch` input.
- [ ] Audit script is marker-based and can report failure when verification is interrupted (timeout/cancel) even if compilation succeeded. Impact: unclear failure modes. Fix: keep marker checks, but make the workflow resilient to cancels by preventing cancels on `main` and reducing default scope.

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Kani results are uploaded unconditionally with `if-no-files-found: error`. Impact: red CI on early failures where diagnostics are most valuable. Fix: consider `warn` or ensure `kani-results` always exists even on early exits.
- [ ] `kani-solana` contains a mix of foundational invariants and "nice-to-have" proofs. Impact: future runtime creep. Fix: keep a small "smoke" proof set as default; gate heavier suites behind a feature (already started with `kani-full`).

## Low Priority (P3 - Technical Debt)
- [ ] Documentation assumes a git dependency pin. Impact: friction for external users. Fix: add crates.io install path when publishing.

## Security Assessment
No obvious secret-handling issues in the Kani workflow/scripts. The workflow is read-only and uses standard actions.

## Performance Assessment
Primary bottlenecks are compilation and Kani verification time. CI performance improves materially by:
1. Avoiding submodule checkout.
2. Keeping default verification scope to `kani-solana`.
3. Avoiding `cancel-in-progress` on `main`.

## Observability Assessment
The pipeline already uploads `kani-results/` artifacts. Improving reliability of completion on `main` is the highest leverage observability improvement.

## Test Coverage Gaps
Kani proves math invariants, but it does not validate program wiring or instruction-level behavior. Keep Kani focused on pure math; cover integration with unit/property tests.

## Action Plan
1. Update `.github/workflows/kani.yml` to:
   - Remove submodule checkout.
   - Avoid cancelling `main` runs.
   - Default to `kani-solana` and add a `workflow_dispatch` `packages` input.
2. Keep expanding `kani-solana` as the shared proof harness library; move heavyweight proofs behind `kani-full` as needed to keep CI fast.

