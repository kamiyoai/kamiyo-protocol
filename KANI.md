# Kani Formal Verification

This repo includes lightweight Kani harnesses for a few Solana program crates. The goal is to prove small, high-value invariants (math, splits, bounds) without trying to model Solana runtime/Anchor account constraints.

## Install

1. Install Kani:
   - `cargo install --locked kani-verifier`
2. One-time setup:
   - `cargo kani setup`

## Run

- Run the default set (kamiyo, hive, kamiyo-staking):
  - `./scripts/kani.sh`
- Run the full set (enables additional harnesses via the `kani-full` feature):
  - `KANI_FULL=1 ./scripts/kani.sh`
- Run with CI-style output (writes `kani-results/summary.md` + `kani-results/kani.log`):
  - `KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh`
  - also writes per-package logs: `kani-results/kani-<pkg>.log`
- Run a specific crate:
  - `./scripts/kani.sh kamiyo`
  - `./scripts/kani.sh hive`
  - `./scripts/kani.sh kamiyo-staking`
- Or directly:
  - `cargo kani -p kamiyo`

## CI

- CI runs Kani on every PR and push to `main` (job: `Kani`) and uploads a `kani-results` artifact with:
  - `summary.md` (short, shareable)
  - `kani.log` (full output)
  - `kani-<pkg>.log` (per-package output; used for per-crate cover auditing)
- A scheduled workflow runs the full proof set (`KANI_FULL=1`) and treats `kani::cover!` checks as an audit gate.
- The scheduled workflow can optionally publish a Kiroku “proof receipt” (shareable link) if secrets are configured:
  - `KIROKU_AGENT_PUBLISH_URL` (e.g. `https://<app>/api/kiroku/server/agent/drops`)
  - `KIROKU_AGENT_PUBLISH_KEY`
  - `KIROKU_AGENT_AUTHOR` (Solana address allowlisted in Kiroku server writers)
  - optional: `KIROKU_RECEIPT_ORIGIN` (defaults to publish URL origin)
  - output: `kani-results/kiroku-receipt.json` (uploaded with the artifact)

- CI pins Kani via `KANI_VERSION` in the workflows to reduce toolchain drift.

## Where The Proofs Live

Harness modules are gated behind `#[cfg(kani)]` so normal `anchor build/test` is unaffected:

- `programs/kamiyo/src/kani_proofs.rs`
- `programs/hive/src/kani_proofs.rs`
- `programs/kamiyo-staking/src/kani_proofs.rs`

## Scope (Current)

- Proven: basic invariants for fee splits, refund mapping, consensus ceiling-average when all scores are included, dispute-cost/reputation-score bounds, multiplier schedule properties, and bounded pending-rewards arithmetic.
- Not covered: full instruction handlers, CPI/system account constraints, cryptographic hashing/circuits.
