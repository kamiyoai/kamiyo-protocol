# Kyoshin Autonomy Market Execution Plan (2026-02-20)

## Objective

Achieve `>=99%` autonomous Kyoshin operation by separating:

1. **Autonomous machine-pay revenue** (primary): deterministic APIs and x402 flows.
2. **Marketplace distribution** (secondary): lead-gen and customer acquisition.

Core rule: never make Kyoshin's solvency depend on third-party marketplace payout mechanics.

## Reality Check: Where Subagents Can Get Work and Paid

### Relevance AI Marketplace

- Relevance supports publishing AI Agents to its marketplace and has explicit monetization docs.
- Creators connect Stripe to get paid.
- Current submission rules include strict formatting constraints and explicitly disallow sub-agents in submissions.

Implication for Kyoshin:

- Use Relevance for distribution and paid installs/tasks.
- Keep actual execution and treasury routing in Kyoshin runtime, not in Relevance-only agent logic.

### Agent.ai

- Agent.ai supports publishing public agents and discovery.
- Agent.ai marketplace rewards are credits/points and are explicitly non-monetary.
- Agent.ai supports lead capture workflows (Lead Magnet) and external CRM push.

Implication for Kyoshin:

- Treat Agent.ai as top-of-funnel only.
- Route serious paid work off-platform into direct machine-pay/API contracts.

### Kore.ai Marketplace

- Kore provides an enterprise AI marketplace.
- Public marketplace listing/support appears to require direct contact with their team.

Implication for Kyoshin:

- Treat Kore as enterprise channel BD, not autonomous instant job liquidity.

## Fundry Launch Config Decision

## Data Source

Live Fundry MCP `list_configs` (queried 2026-02-20) exposes builder profiles:

- `community` (migration 50 SOL, curve ~x12.3, 97/3)
- `preseed` (80 SOL, ~x8, 66/33)
- `seriesa` (100 SOL, ~x8, 33/66)
- `toly` (180 SOL, ~x5, 20/80)
- `indie` (80 SOL, ~x15, 75/25)
- `kamiyo` (40 SOL, ~x5, 95/5)
- `origin` (70 SOL, ~x7, 50/50)

### Recommended Core Config

- **Core treasury lane:** `kamiyo`

Why:

- Lowest migration target among builder configs (40 SOL).
- Moderate curve profile (`~x5`) vs high-volatility growth curves.
- Fast cliff (`24 hours`) for faster treasury feedback loops.
- Keeps operations aligned with routing-first objective over hype-chasing volatility.

### Config Policy

- `kamiyo`: mandatory for Kyoshin core treasury agents.
- `community` or `origin`: optional growth experiments only.
- Explicitly block `monkes` configs for treasury-core agents.

## Execution Plan (Autonomy-First)

### Completed in Runtime

- Swarm opportunity intake from local/generic/marketplace feeds.
- Opportunity scoring + assignment into mission planner.
- Executable job runtime including x402 and marketplace lifecycle actions.
- Profitability guardrails (`min margin`, `expected revenue`, fee estimate).
- Per-agent performance scoring + priority auto-adjust state.
- Job execution persistence in DB + receipts.
- Routing integration from agent wallets into staking policy path.
- Swarm registry channel gating:
  - per-agent `jobSources` hard assignment gate
  - per-agent `marketplaceProfiles` state-weighted assignment (`approved` highest)
- Mission planner weighting by autonomy readiness (machine-pay channel readiness + listing status).
- Tick observations now include `channelCoverage` and `channelsByAgent`.
- Autonomous lead conversion worker:
  - discovery leads are converted into executable `direct`/`x402` opportunities.
- Revenue-lane accounting and reporting:
  - lane events persisted (`trading`, `x402`, `marketplace_direct`, `direct_api`, `internal`)
  - periodic revenue receipts from live DB state.
- Automatic margin circuit breaker:
  - per-agent/per-source negative-margin streak tracking
  - cooldown-based execution pause.
- 30-day autonomy SLO reporting:
  - decision-loop uptime, non-intervention rate, route success rate, MTTR
  - periodic SLO receipts.
- SLO degradation alerting with cooldown-based receipt emission.
- Source-quality feedback weighting:
  - assignment scoring now incorporates realized source performance.
- Lead conversion simulation mode:
  - converted leads can run dry-run only prior to live execution.
- Source-specific lead contract schema validation:
  - converted marketplace leads are validated before execution path generation.
- Weekly autonomous keep/scale/pause summary receipts.
- External SLO alert webhook delivery (optional) with timeout/cooldown controls.
- Signed SLO alert webhook delivery:
  - HMAC SHA-256 signature and timestamp headers for alert transport.
- Weekly negative-net rollback policy:
  - auto-disables weak source groups for cooldown windows when weekly net SOL breaches threshold.
- Regression coverage for autonomy hardening modules:
  - lead conversion, margin circuit breaker, rollback state transitions, and SLO math tests.
- External metrics export endpoint:
  - optional Prometheus-compatible HTTP metrics for autonomy and revenue health.
- High-cardinality soak test harness:
  - synthetic intake benchmark script for assignment throughput and latency evidence.
- Accelerated autonomy proof bundling:
  - `proof:24h` generates publish-ready JSON/Markdown/manifest artifacts from live runtime data.

### Next 14 Days

1. Run 30-day unattended benchmark and verify intervention rate against SLO targets (initial snapshot generated via `benchmark:autonomy`).
2. Keep metrics endpoint enabled in staging/prod and track trend stability across a full 30-day window.
3. Validate signed webhook replay protection in downstream alert receivers.
4. Publish rolling 24h proof bundles during the 30-day run to show real-time autonomy progress.

### Hard Acceptance Criteria

- `>=99%` ticks execute without manual action.
- `>=95%` positive-net jobs auto-route according to policy.
- Every financial action has receipt + tx signature traceability.
- Any marketplace outage degrades only distribution, not core earning loop.

## Repo Execution Updates Applied

- Updated Fundry config enums/tooling to include live config `origin`.
- Corrected builder/monkes config categorization to match live Fundry metadata.
- Added swarm registry fields for `jobSources` and per-marketplace listing state.
- Updated mission planning to include configured hiring channels for deal/executor agents.
- Captured a Fundry live config snapshot in `docs/FUNDRY_LIVE_CONFIG_SNAPSHOT_2026-02-20.json`.
- Added lead conversion, margin circuit breaker, revenue lane ledger, and SLO report modules.
- Added rollback policy module and source-disable execution gating.
- Extended operator config/env with conversion, contract validation, circuit, rollback, revenue, and SLO controls.
- Added source-feedback scoring, SLO alerting, and weekly autonomy summary emissions.
- Added HMAC-signed SLO webhook transport and regression tests for autonomy modules.
- Added `benchmark:autonomy` report script for executable 30-day proof tracking.
- Added `soak:swarm` synthetic benchmark script and captured baseline throughput report.
- Added optional Prometheus metrics endpoint for autonomy/revenue observability.
- Added `proof:24h` public proof bundle generation script and 24h runbook.

Touched code:

- `packages/kamiyo-sdk/src/fundry.ts`
- `packages/kamiyo-mcp/src/tools/fundry.ts`
- `services/kamiyo-operator/src/db.ts`
- `services/kamiyo-operator/src/config.ts`
- `services/kamiyo-operator/.env.example`
- `services/kamiyo-operator/src/index.ts`
- `services/kamiyo-operator/src/swarm/types.ts`
- `services/kamiyo-operator/src/swarm/registry.ts`
- `services/kamiyo-operator/src/swarm/planner.ts`
- `services/kamiyo-operator/src/swarm/opportunities.ts`
- `services/kamiyo-operator/src/swarm/revenue.ts`
- `services/kamiyo-operator/src/swarm/circuitBreaker.ts`
- `services/kamiyo-operator/src/swarm/slo.ts`
- `services/kamiyo-operator/src/swarm/rollback.ts`
- `services/kamiyo-operator/src/swarm/opportunities.test.ts`
- `services/kamiyo-operator/src/swarm/circuitBreaker.test.ts`
- `services/kamiyo-operator/src/swarm/rollback.test.ts`
- `services/kamiyo-operator/src/swarm/slo.test.ts`
- `docs/KYOSHIN_SWARM_REGISTRY_TEMPLATE.json`

## Sources

- [Relevance: Publish an AI Agent](https://relevanceai.com/docs/marketplace/publish-an-ai-agent)
- [Relevance: Getting Paid for Your Agents](https://relevanceai.com/docs/marketplace/getting-paid-for-your-agents)
- [Relevance: Agent Submission Guidelines](https://relevanceai.com/docs/marketplace/agent-submission-guidelines)
- [Agent.ai: Public Agent Policy](https://docs.agent.ai/public-agent-policy)
- [Agent.ai: Marketplace Rewards](https://docs.agent.ai/marketplace-rewards)
- [Agent.ai: Lead Magnet](https://docs.agent.ai/lead-magnet)
- [Kore.ai Marketplace FAQ](https://www.kore.ai/ai-marketplace-faq/)
- [Fundry MCP Endpoint](https://fundry.collaterize.com/api/mcp/mcp)
