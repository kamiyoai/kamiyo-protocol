# Production Audit: Kyoshin Runtime (OpenClaw Swarm)

## Executive Summary

Kyoshin now runs unattended with real external intake (`direct_api`) and deterministic assignment output, but it is still not release-ready for the full "autonomous revenue engine" claim. The hard blockers are paid settlement rails and long-window autonomy proof, not basic runtime wiring. This pass fixed concrete runtime safety defects (lockless loop execution, shared `/tmp` artifacts, weak feed URL policy, oversized payload risk, and weak file permissions) and tightened operational behavior without changing the runtime architecture.

## Critical Issues (P0 - Block Release)

- [ ] Paid execution and settlement rails are not live | Impact: no defensible "earns fees autonomously" claim in production | Fix: wire live authenticated endpoints for `agent_ai` / `relevance` / `kore` / `x402`, then validate receipt-backed payout flow to treasury/staking.
- [ ] Long-window autonomy proof missing | Impact: cannot credibly claim `>=99%` autonomy | Fix: run continuous 24h and then 30-day proof windows with published uptime/error/MTTR artifacts.

## High Priority (P1 - Fix Before Launch)

- [x] Loop used shared `/tmp` files across runs | Impact: race conditions, stale reads, and potential symlink/file-clobber risk | Fix: switched to per-run temp directory with trap cleanup.
- [x] No single-run guard in control loop | Impact: overlapping executions can corrupt state/queue semantics | Fix: added host-local non-blocking `flock` lock with explicit `skipped(lock_busy)` event.
- [x] Gateway health did not affect loop status | Impact: cycle could be marked healthy with failed gateway probe | Fix: gateway health now participates in degraded-state gating and error payload.
- [x] Claude billing/provider rejection could be logged as successful cycle | Impact: false-positive autonomy health while model execution is unavailable | Fix: explicit failure-pattern detection now marks the cycle degraded when provider rejects requests.
- [x] Feed intake accepted insecure/unsupported schemes by default | Impact: SSRF-like or misconfigured source risk | Fix: strict scheme policy (`https`/`file` default, `http` only via explicit opt-in env).

## Medium Priority (P2 - Fix Soon After Launch)

- [x] Large external payloads could bloat memory and runtime artifacts | Impact: instability and unbounded disk growth | Fix: added response-size cap, summary truncation, and metadata compaction.
- [x] Runtime artifact permissions were inconsistent | Impact: local data exposure risk on multi-user hosts | Fix: enforced `0700` runtime dirs and `0600` generated artifacts/logs.
- [x] Planner accepted malformed registry agents too loosely | Impact: runtime exceptions or uneven assignment quality under bad config | Fix: active-agent selection now validates required `id` and normalized active status.

## Low Priority (P3 - Technical Debt)

- [ ] Add fuzz/property tests for intake normalization and planner ranking | Impact: lower confidence on pathological marketplace payloads | Fix: add randomized fixture corpus and deterministic regression snapshots.
- [ ] Add end-to-end CI smoke for shell+python runtime bundle | Impact: regressions can slip between script-level checks | Fix: add CI job that runs sync -> intake -> planner -> loop dry run.

## Security Assessment

- Fixed:
  - Removed shared temp-file usage from control loop.
  - Enforced loop mutual exclusion with lock file.
  - Enforced strict feed URL scheme policy and explicit insecure-http opt-in.
  - Enforced restrictive file permissions for runtime outputs/logs.
- Remaining:
  - Secret rotation lifecycle still depends on manual operator process.
  - Paid rails are not yet fully credentialed in production, so end-to-end settlement security cannot be validated.

## Performance Assessment

- Fixed:
  - Added bounded intake response size and bounded summary/metadata persistence.
  - Kept planner assignment cap configurable (`KYO_SWARM_MAX_ASSIGNMENTS`) with sane limits.
- Remaining:
  - No sustained multi-day load benchmark on mixed live sources.
  - No explicit p95/p99 latency/error budget dashboards published for loop stages.

## Observability Assessment

- Fixed:
  - Loop now emits explicit skip reason when lock prevents overlap.
  - Degraded-state error composition now includes gateway failure reasons.
  - Feed-sync summary exposes URL validity in addition to URL presence.
- Remaining:
  - No single consolidated SLO dashboard for intake/planner/dispatch success ratios.
  - Alerting/notification policy for repeated degraded cycles is still manual.

## Recommended Architecture Changes

- Treat marketplaces as lead/intake channels only; keep settlement proof on machine-pay rails.
- Add a payout receipt normalizer that writes a canonical "fee realized" ledger entry for every completed mission.
- Add automated degraded-cycle alerting with escalation thresholds (for example: 3 consecutive degraded ticks).

## Test Coverage Gaps

- Current checks completed in this pass:
  - shell syntax check for `kyoshin-autonomy-loop.sh`
  - python compile checks for sync/intake/planner scripts
  - end-to-end local smoke run for `sync -> intake -> planner`
  - runtime permission assertions on generated artifacts
- Missing:
  - unit tests for URL scheme enforcement and response-size caps
  - deterministic regression tests for metadata compaction behavior
  - integration test for lock-busy skip behavior in loop script

## Action Plan

1. Enable paid live feed URLs and API keys for prioritized rails (`x402`, then marketplace channels).
2. Add automated alerting for consecutive degraded cycles and stalled assignment output.
3. Add CI runtime smoke job covering sync/intake/planner and lock behavior.
4. Run 24h continuous proof window, publish artifacts, then scale to 30-day proof window.
