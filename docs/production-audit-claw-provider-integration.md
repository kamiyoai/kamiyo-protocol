# Production Audit: Claw Provider Integration (OpenClaw, NanoClaw, IronClaw)

## Executive Summary
The trust-layer core and MCP truth-court integration now accept OpenClaw/NanoClaw/IronClaw, but API swarm execution and NIKA ACP still had provider lock-in paths that prevented end-to-end adoption. This sprint removes those runtime bottlenecks by introducing OpenAI-compatible claw provider routing, hardened fallback behavior, and consistent capability checks. The stack is now materially closer to production readiness for multi-provider trust execution, with remaining gaps concentrated in legacy Anthropic-only modules outside swarm/ACP.

## Critical Issues (P0 - Block Release)
- [x] Swarm task executor accepted only Anthropic/OpenAI credentials | Impact: claw providers could not execute paid swarm work | Fix: added OpenClaw/NanoClaw/IronClaw provider support with base URL + model resolution and sequential fallback.
- [x] Hive task routes reported provider errors for only Anthropic/OpenAI | Impact: operators received misleading diagnostics and false-negative availability checks | Fix: centralized provider-availability checks and unified actionable error message.

## High Priority (P1 - Fix Before Launch)
- [x] Swarm DAG planner could not call claw models | Impact: planning quality and reliability depended on two providers only | Fix: added OpenClaw/NanoClaw/IronClaw planning backends with ordered fallback.
- [x] NIKA ACP offering validation ignored claw providers | Impact: ACP jobs incorrectly rejected despite valid claw configuration | Fix: ACP validation now accepts OpenClaw/NanoClaw/IronClaw provider credentials.

## Medium Priority (P2 - Fix Soon After Launch)
- [x] ACP LLM call path had no OpenAI-compatible claw routing | Impact: integration required Anthropic/OpenAI even when claw infra was available | Fix: added provider selection + endpoint normalization for claw APIs, with Anthropic fallback.
- [ ] Core NIKA content-generation modules are still Anthropic-first and not claw-native | Impact: non-ACP flows still have provider concentration risk | Fix: migrate `nika-agent`, topic/orchestration pipelines, and quality gate to shared provider abstraction.

## Low Priority (P3 - Technical Debt)
- [ ] Add contract tests for provider failover order and degraded-mode behavior across API + NIKA | Impact: fallback regressions may pass unit tests undetected | Fix: add deterministic provider simulation tests and CI matrix for provider combinations.

## Security Assessment
- Added explicit credential gating for claw providers (`API_KEY + BASE_URL`) to prevent half-configured runtime states.
- Endpoint normalization enforces `/v1` API paths and avoids malformed URL composition in ACP and swarm executor/planner.
- Failure aggregation in task execution now preserves provider context without leaking secrets.

## Performance Assessment
- Swarm fallback remains sequential by design to avoid duplicate paid calls and race-driven overspend.
- Planner fallback attempts additional providers only after upstream failure; no extra overhead on healthy primary.
- Cost accounting remains conservative and unchanged for OpenAI-compatible execution path.

## Observability Assessment
- Error surfaces now communicate exact missing credential classes for swarm task execution readiness.
- Remaining gap: no per-provider metrics (latency/error rate) in swarm/ACP flows; add tagged counters/histograms.

## Recommended Architecture Changes
- Introduce a shared `LLMProviderRouter` package used by API swarm, NIKA ACP, and NIKA core posting flows.
- Add per-provider policy controls: preferred order, max retries, circuit-breaker cooldown.
- Externalize model defaults to env/config schema with validation and redaction parity.

## Test Coverage Gaps
- Missing unit tests for:
  - claw provider env parsing (all permutations),
  - fallback ordering when primary provider fails,
  - malformed base URL handling,
  - multi-provider error aggregation formatting.

## Action Plan
1. Keep current fixes as baseline and monitor runtime error distribution by provider.
2. Add provider-tagged metrics for swarm executor/planner and ACP LLM calls.
3. Expand NIKA non-ACP modules to the same provider router.
4. Add explicit failover tests in `services/api` and `services/nika`.
