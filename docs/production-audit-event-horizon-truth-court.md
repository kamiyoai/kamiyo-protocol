# Production Audit: event-horizon-truth-court

**Audit Date**: 2026-02-21  
**Scope**: `packages/kamiyo-mcp/src/truth-court/*`, `packages/kamiyo-mcp/src/tools/truth-court.ts`, `packages/kamiyo-mcp/src/demo/event-horizon.ts`, `packages/kamiyo-mcp/tests/test-truth-court.ts`  
**Verdict**: SHIP WITH FIXES

## Executive Summary

The implementation is solid for an MVP trust-court flow, but it had replay-integrity and oracle-safety gaps that would matter in adversarial use. The core risks were committee-hash tampering not being explicitly verified, duplicate oracle identity collisions, and weak numeric guardrails in the Grok adapter. Those high-impact issues were fixed in this pass. Remaining work is mostly operational hardening (rate controls, artifact signing policy, and production observability).

### Critical Findings Count
| Severity | Count | Status |
|----------|-------|--------|
| Critical (P0) | 0 | ✅ |
| High (P1) | 4 | ✅ Fixed |
| Medium (P2) | 3 | ⚠️ Open |
| Low (P3) | 2 | 📝 Noted |

## Critical Issues (P0 - Block Release)

- [x] None found in scoped files.

## High Priority (P1 - Fix Before Launch)

- [x] Replay verification did not validate committee hash integrity | Impact: verdict bundle tampering could go undetected | Fix: added `confidence` to replay bundle and `committeeHashMatches` verification path in `packages/kamiyo-mcp/src/truth-court/engine.ts`.
- [x] Duplicate oracle names were allowed | Impact: replay digest collisions and ambiguous accountability | Fix: enforce unique oracle names in `TruthCourtEngine` constructor.
- [x] Grok numeric parsing allowed non-finite values | Impact: invalid confidence/factor values could bypass strict checks | Fix: replaced NaN-only checks with finite-number validation in `packages/kamiyo-mcp/src/truth-court/grok-oracle.ts`.
- [x] Transient xAI failures had no retry policy | Impact: unstable verdict generation under 429/5xx spikes | Fix: added bounded retry/backoff and prompt-size guardrails in `packages/kamiyo-mcp/src/truth-court/grok-oracle.ts`.

## Medium Priority (P2 - Fix Soon After Launch)

- [ ] No cryptographic signature on exported demo artifacts | Impact: artifact provenance is not tamper-evident outside chain anchoring | Fix: sign JSON/card exports and publish verification routine.
- [ ] No per-oracle runtime metrics exposed from truth-court engine | Impact: production debugging and SLO enforcement are weaker than needed | Fix: emit counters/timers per oracle call and rejection reason.
- [ ] No policy guard for minimum committee diversity by provider | Impact: local-only fallbacks may reduce adjudication trust in degraded mode | Fix: enforce provider diversity threshold when configured for production.

## Low Priority (P3 - Technical Debt)

- [ ] Demo scenarios are hardcoded in script | Impact: scenario expansion requires code edits | Fix: move presets to typed JSON/YAML config.
- [ ] MCP tool response payload can be large with full replay bundle | Impact: unnecessary transport overhead in some clients | Fix: add compact mode and artifact pointer support.

## Security Assessment

- Input validation is now strict for dispute parameters and Grok JSON fields.
- Replay verification now checks all critical integrity dimensions: case hash, evidence hash, feature hash, committee hash, missing/mismatched/unexpected oracles.
- Oracle identity collision vector is closed by constructor-time uniqueness checks.
- Remaining security concern is artifact authenticity outside on-chain anchoring.

## Performance Assessment

- Truth-court oracle calls execute concurrently and remain lightweight in local/mock mode.
- Retry logic is bounded and only used for transient xAI failures.
- Added prompt length cap to prevent runaway payload size and token cost.

## Observability Assessment

- Current implementation returns structured outcomes and slashing recommendations.
- Missing: explicit metrics/tracing hooks for latency distribution and error budgets.

## Recommended Architecture Changes

- Introduce signed artifact envelopes for off-chain publication.
- Add a small telemetry interface to `TruthCourtEngine` for provider-level metrics.
- Add configurable committee policy (`minProviders`, `requireXaiWhenLive`) for production modes.

## Test Coverage Gaps

- Add tests for retry/backoff branch behavior in Grok adapter (429/5xx simulation).
- Add tests for `unexpectedOracles` replay failure branch.
- Add test for prompt-size guardrail error path.

## Action Plan

### Immediate (completed in this pass)
1. Enforce oracle uniqueness.
2. Strengthen replay integrity checks (including committee hash).
3. Harden Grok adapter numeric validation and transient failure handling.
4. Extend tests to cover committee-hash tamper and duplicate oracle rejection.

### Short-term (next pass)
1. Add adapter retry-path tests and prompt-size guard tests.
2. Add optional artifact signing for demo exports.

### Medium-term
1. Add truth-court metrics export and production policy constraints.
