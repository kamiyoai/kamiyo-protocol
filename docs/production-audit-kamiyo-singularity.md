# Production Audit: KAMIYO Singularity (2026-02-24)

## Scope
- `apps/kamiyo-singularity`
- `programs/kamiyo-singularity-market`
- `programs/kamiyo-singularity-orderbook`
- Flywheel routing to staking pool `9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`

## Current Grade
- **B (deployable with controlled rollout, not full production-hardening yet)**

## What Is Ready
- Market creation enforces `protocol_treasury == 9mEd...Cv9d`.
- Market fee split defaults to 100% protocol for Singularity.
- Creator fee withdrawal is disabled at instruction level.
- Orderbook settlement charges fixed 50 bps trading fee.
- Trading fee is routed to a protocol fee vault constrained to:
  - owner = `9mEd...Cv9d`
  - mint = escrow vault mint
- Settlement math now has deterministic helper functions and unit tests.
- Settlement math uses checked integer narrowing (`u128 -> u64`) to prevent truncation.
- Settlement path has property-based fuzz coverage against a reference model.
- Market fee-split accounting also has property-based fuzz coverage for split + withdrawal invariants.
- Sell-order validation now enforces unlocked position balances (`balance - locked`) to prevent oversubscription.
- Flywheel invariants are covered by explicit tests:
  - default 100% protocol fee share
  - zero creator fee availability under Singularity default
  - treasury authority constant checks
- Withdrawal policy rules are unit tested:
  - protocol recipient owner enforcement
  - creator withdrawal hard-disable
  - protocol available-fee accounting
- Frontend production build succeeds (`next build`) with current config.
- Program tests pass:
  - `kamiyo-singularity-market` (98 tests)
  - `kamiyo-singularity-orderbook` (32 tests)
- Release gate script is in place and passing:
  - `ops/kamiyo-singularity/release-gate.sh`
  - includes hard fail on cross-layer constant alignment via:
    - `ops/kamiyo-singularity/verify-constant-alignment.mjs`

## Critical Gaps (Must Close Before Mainnet-Scale Traffic)
1. End-to-end integration tests are missing across:
   - place order -> settle trade -> fee accrual -> protocol sweep
   - market resolve -> redemption -> final balances
2. No formal exploit-focused test suite for:
   - malicious account substitution
   - replay/order settlement race conditions
   - oracle input manipulation under edge timing
3. No dedicated runbook-driven ops automation yet for:
   - stale oracle quorum detection
   - fee-vault drift checks
   - stuck dispute queues

## Important Gaps (Should Close During Staged Rollout)
1. No explicit SLO dashboard wiring is committed yet (docs added; telemetry wiring still needed).
2. Devnet canary automation is now in place for scheduled read-only health checks, but synthetic trade+resolution replay is still missing.

## Risk Call
- The protocol path for the fee flywheel is implemented and tested at unit level.
- The system is **not yet at full production excellence** until integration + adversarial testing + live monitoring gates are enforced.

## Release Gate Checklist
- [ ] Integration tests for full market lifecycle and fee routing
- [x] Property/fuzz tests for settlement and fee math boundaries
- [ ] Oracle committee fault-injection simulation
- [ ] On-call monitors + alert rules live
- [ ] Dry-run on devnet with synthetic load and dispute scenarios
- [x] Local release-gate script with repeatable checks
- [x] CI workflow for release-gate checks on Singularity paths
- [x] Cross-layer constant alignment check (programs + app)
- [x] Scheduled devnet read-only canary automation
