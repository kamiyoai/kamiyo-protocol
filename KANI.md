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
- Run a specific crate:
  - `./scripts/kani.sh kamiyo`
  - `./scripts/kani.sh hive`
  - `./scripts/kani.sh kamiyo-staking`
- Or directly:
  - `cargo kani -p kamiyo`

## Where The Proofs Live

Harness modules are gated behind `#[cfg(kani)]` so normal `anchor build/test` is unaffected:

- `programs/kamiyo/src/kani.rs`
- `programs/hive/src/kani.rs`
- `programs/kamiyo-staking/src/kani.rs`

## Scope (Current)

- Proven: basic invariants for fee splits, refund mapping, consensus ceiling-average when all scores are included, dispute-cost/reputation-score bounds, multiplier schedule properties, and bounded pending-rewards arithmetic.
- Not covered: full instruction handlers, CPI/system account constraints, cryptographic hashing/circuits.

