# Production Audit: Kyoshin Execution Stack

## Executive Summary
Kyoshin is currently structured as a social/LLM runtime with autonomy features bolted on, not as a profit-seeking execution engine. The service mixes unrelated concerns (X posting, mention replies, ACP generation, placeholder protocol tools, and partial autonomy dispatch), which creates high operational risk and poor unit economics. In its current form, it cannot reliably enforce spend discipline or guarantee positive-margin swarm execution.

## Critical Issues (P0 - Block Release)
- [ ] Runtime depends on paid inference paths (`@anthropic-ai/*`) in core flows | Unbounded inference spend risk | Remove inference dependency from execution hot path.
- [ ] No hard profitability gate before dispatching autonomous work | Negative-margin jobs can execute repeatedly | Add explicit margin policy (`expected - fees - reserve >= min_margin`).
- [ ] Placeholder protocol tools return "would do" instead of real execution | False confidence, no real revenue routing | Replace placeholders with real signed transaction paths.
- [ ] No end-to-end treasury safety policy for routing funds | Potential over-routing / liquidity starvation | Enforce reserve floors, daily caps, per-tx caps, and breaker-based halts.

## High Priority (P1 - Fix Before Launch)
- [ ] Monolithic process combines social posting and execution mission logic | Blast radius too high | Isolate Kyoshin into dedicated execution runtime.
- [ ] Legacy/OpenClaw hooks and ACP seller paths are not tied to strict PnL controls | Cost leakage | Gate all job execution by policy and record per-job realized economics.
- [ ] No deterministic self-improvement loop for execution policy | Drift without measurable optimization | Add performance scoring and priority adaptation from realized outcomes.
- [ ] Existing deploy spec is optimized for social mode, not execution mode | Wrong defaults in production | Update env/deploy with execution-only defaults.

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Inconsistent observability naming and mixed metrics domains | Hard to operate and alert | Standardize metrics around jobs, margins, route success, and treasury.
- [ ] Legacy modules inflate build/runtime surface | Maintenance burden | Remove stale files from active compilation path.
- [ ] Incomplete source rollback strategy for underperforming feeds | Slow losses | Persist source-level rollback policy and enforce cooldown windows.

## Low Priority (P3 - Technical Debt)
- [ ] Legacy social/ACP generation modules remain as historical code | Confusion for future maintainers | Move to archival path or separate package.
- [ ] Dist artifacts checked in for stale logic | Drift between source and runtime | Regenerate only from active source.

## Security Assessment
- Execution service currently lacks a single policy authority for treasury operations.
- Service must enforce allowlisted staking pool destinations and reject arbitrary routing targets.
- API endpoints must be token-gated for administrative actions.
- Key material loading must be explicit, validated, and fail-fast.

## Performance Assessment
- Existing architecture performs unnecessary work unrelated to revenue execution.
- No guaranteed cap on expensive operations per cycle.
- No explicit scheduling budget guard to prevent cascading retries.

## Observability Assessment
- Existing metrics are broad but not operator-actionable for economic control.
- Missing first-class metrics for:
  - accepted vs rejected opportunities
  - expected vs realized margin
  - source-level profitability
  - circuit-open / rollback state
  - staking route success and latency

## Recommended Architecture Changes
1. Replace Kyoshin runtime with deterministic execution engine.
2. Make economic policy first-class and mandatory before every job and transfer.
3. Persist runtime state in SQLite with auditable receipts.
4. Add source-level circuit breaker + weekly rollback policy.
5. Add automatic but bounded routing to staking pool with reserve protection.
6. Remove LLM from hot path entirely; keep zero inference API usage in execution mode.

## Test Coverage Gaps
- Missing tests for profitability gates and budget rejection.
- Missing tests for circuit breaker state transitions.
- Missing tests for rollback source disablement.
- Missing tests for auto-route cap enforcement.

## Action Plan
1. Rewrite `services/kyoshin` around execution-only runtime.
2. Import and adapt proven swarm economics modules (opportunity intake, job execution, circuit, rollback, performance scoring).
3. Integrate staking routing and claims tooling with strict treasury guardrails.
4. Replace package/runtime dependencies to remove inference providers.
5. Add focused tests and verify build/test in CI-equivalent local run.
