# Kizuna Cutover Plan (Liquidity-Safe)

## Goal
Make Kizuna the core payment product for KAMIYO without taking unsecured payout risk.

## Operating Rules
1. Enterprise lane is mandate-constrained and prefunded.
2. Crypto-fast lane is overcollateralized.
3. No production payout happens without locked funding.
4. Kernel outages are fail-closed in production.

## Lane Rules
### Enterprise
1. Verify requires:
   - valid request and signature
   - kernel approval
   - active mandate limits
   - prefunded balance >= requested amount
2. Settle requires:
   - active reservation
   - prefund lock consumed
   - exactly-once billable event
3. Enterprise v1 does not create unsecured debt.

### Crypto-Fast
1. Verify requires:
   - valid request and signature
   - kernel approval
   - collateral account
   - LTV and health factor within limits
2. Settle requires:
   - active reservation
   - debt creation in fast-path pool
   - exactly-once billable event

## Milestones
## Milestone 0 (Week 0-1): Baseline Lock
1. Freeze non-Kizuna roadmap work for this stream.
2. Keep Kizuna tests and observability green.
3. Gate:
   - test suite passes
   - verify/settle/billing dashboards live

## Milestone 1 (Week 1-3): Enterprise Prefund
1. Ship enterprise balance tables and funding event ledger.
2. Add `/kizuna/funding/*` APIs.
3. Enforce prefund lock at verify and prefund consume at settle.
4. Gate:
   - insufficient prefund always denied
   - no negative enterprise balances
   - funding references are idempotent

## Milestone 2 (Week 3-5): Crypto-Fast Hardening
1. Tighten LTV and health-factor defaults.
2. Enforce unsafe withdraw blocks.
3. Add risk actions: freeze/throttle/unfreeze.
4. Gate:
   - unsafe requests denied
   - lane pool isolation invariants pass

## Milestone 3 (Week 5-7): Traffic Cutover
1. Default new integrations to Kizuna lane routing.
2. Move selected production traffic behind flags.
3. Keep legacy routes during deprecation window.
4. Gate:
   - 95%+ Kizuna traffic target
   - no liquidity incidents
   - kernel uptime SLO met

## Milestone 4 (Week 7-9): Repo Tightening
1. Make Kizuna stack default in CI and deploy paths.
2. Mark unrelated integrations as legacy.
3. Reduce default build/deploy surface.
4. Gate:
   - lower CI/runtime cost
   - deploy scope matches Kizuna core stack

## Milestone 5 (Week 9-12): Hard Delete Window
1. Remove legacy paths after stable migration window.
2. Remove deprecation shims and flags.
3. Gate:
   - no rollback events for two consecutive weeks
   - migration support queue clear

## Kill Switches
1. Disable enterprise verify approvals if prefund drift is detected.
2. Pause fast-path pool when health-factor alerts trigger.
3. Enforce kernel fail-closed mode for production incidents.

## Rollback Playbook
1. Stop new Kizuna verifies for affected lane/pool.
2. Allow in-flight settlements for already consumed reservations only.
3. Keep repayment and funding endpoints active.
4. Reconcile balances/events using idempotency keys.
5. Re-enable lane in staged percent ramps after recovery checks.

