# Production Audit: Kyoshin Swarm Autonomy

## Executive Summary

The Kyoshin swarm runtime now has a materially stronger production posture: channel-gated assignments, lead conversion, margin circuit breaking, lane-level revenue accounting, SLO reporting, and alerting are implemented and compiling. The main blocker is not missing code paths; it is missing elapsed-time evidence for the 99% autonomy claim under live operation.

## Critical Issues (P0 - Block Release)

- [ ] 30-day autonomy proof is not yet complete | Impact: cannot credibly claim `>=99%` non-intervention in production | Current evidence (2026-02-20): `1.57` elapsed days, autonomy `0.8182`, route success `0.8333` | Fix: run uninterrupted 30-day benchmark with SLO receipts and post-run verification report.

## High Priority (P1 - Fix Before Launch)

- [x] Opportunity assignment did not account for per-source realized quality | Impact: weak channels could consume mission budget | Fix: source-feedback weighting added to assignment scoring.
- [x] Negative-margin failures had no automatic execution pause | Impact: repeated loss loops possible | Fix: per-agent/per-source margin circuit breaker with cooldown and receipts.
- [x] Revenue visibility lacked lane-level accounting | Impact: no deterministic attribution for job vs trading returns | Fix: `swarm_revenue_events` ledger + periodic lane reports.
- [x] Discovery leads had no autonomous conversion path | Impact: marketplace funnel could stall before executable work | Fix: lead converter added with optional simulation mode.
- [x] New autonomy modules lacked dedicated regression tests | Impact: higher chance of silent regressions under refactor | Fix: tests added for conversion/scoring, circuit state transitions, rollback policy, and SLO math.

## Medium Priority (P2 - Fix Soon After Launch)

- [x] Add signed/authenticated webhook delivery for SLO alerts | Impact: alert endpoint spoofing risk if deployed on open network | Fix: HMAC signature + timestamp headers added for webhook calls.
- [x] Add per-source schema validation for converted leads before execution | Impact: malformed partner payloads can reduce conversion quality | Fix: source-specific lead contract validation now gates conversion.
- [x] Add automated rollback policy on sustained negative weekly net SOL | Impact: weak strategies may continue too long | Fix: weekly evaluator now auto-disables weak source groups for cooldown windows.

## Low Priority (P3 - Technical Debt)

- [x] Expand observability with explicit metric exports (Prometheus/OpenTelemetry) | Impact: deeper external monitoring still relies on receipts/DB reads | Fix: optional Prometheus-compatible metrics endpoint added.
- [ ] Add fuzz-style tests for assignment and ranking edge cases | Impact: lower confidence on extreme feed payload diversity | Fix: add randomized fixture corpus.

## Security Assessment

- Positive:
  - Runtime has bounded guardrails on execution costs and expected reward.
  - Circuit breaker now prevents repeated negative-margin loops.
  - Marketplace auth header support exists per source.
  - SLO webhook alerts can now be signed with HMAC + timestamp headers.
- Remaining concerns:
  - Webhook signature verification and replay protection still depend on receiver-side enforcement.
  - Converted lead payload normalization still relies on upstream marketplace data quality.

## Performance Assessment

- Positive:
  - Assignment/ranking and source feedback are lightweight and bounded by intake caps.
  - New DB queries are indexed and windowed.
  - Synthetic soak harness now provides repeatable high-cardinality throughput checks.
- Remaining concerns:
  - Need multi-day live-feed soak validation beyond synthetic fixtures.

## Observability Assessment

- Positive:
  - Receipts now cover intake, execution, circuit state, revenue lanes, SLO reports, and alerts.
  - Weekly decision summary receipt added.
  - Optional Prometheus metrics endpoint added for external dashboards and alerting.
- Remaining concerns:
  - No OpenTelemetry trace export yet; current external view is metric-level only.

## Recommended Architecture Changes

- Keep machine-pay lane (`x402`, direct API) as primary revenue control path.
- Continue treating marketplaces as distribution/funnel, not settlement source of truth.
- Add receiver-side signature verification and replay protection in alert consumers.

## Test Coverage Gaps

- Current targeted tests cover:
  - lead conversion policy (schema gating, simulation mode)
  - source feedback scoring impact on assignment selection
  - circuit open/close/prune transitions
  - rollback trigger/recovery/prune transitions
  - SLO non-intervention and MTTR calculations
- Remaining test gap:
  - randomized/fuzz fixture coverage for extreme payload diversity.

## Action Plan

1. Run 30-day unattended benchmark with current reporting stack enabled.
2. Keep metrics endpoint enabled during the benchmark window and enforce SLO alerts from exported gauges.
3. Validate webhook signature replay protection in downstream alert consumers.
4. Publish recurring `proof:24h` bundle artifacts during the 30-day run.

Latest benchmark snapshot:

- `services/kamiyo-operator/output/kamiyo-operator/autonomy-benchmark-30d.json`
- `services/kamiyo-operator/output/kamiyo-operator/swarm-soak-2500x10.json`
- `services/kamiyo-operator/output/kamiyo-operator/public-proof/<run-id>/proof-summary.json`
