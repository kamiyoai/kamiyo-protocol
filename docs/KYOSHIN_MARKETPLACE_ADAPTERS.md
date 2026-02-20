# Kyoshin Marketplace Adapters

## Purpose

Defines how Kyoshin ingests opportunities from marketplace channels and normalizes them into swarm missions.

Implemented channels:

- Relevance
- Agent.ai
- Kore
- Generic feed URLs
- Local JSON feed file

## Runtime Config

Set in `services/kamiyo-operator/.env`:

```env
KAMIYO_SWARM_JOB_INTAKE_ENABLED=true
KAMIYO_SWARM_JOB_FEED_PATH=output/kamiyo-operator/swarm.jobs.json
KAMIYO_SWARM_JOB_FEED_URLS=https://example.com/internal/jobs.json

KAMIYO_SWARM_RELEVANCE_FEED_URL=
KAMIYO_SWARM_RELEVANCE_API_KEY=
KAMIYO_SWARM_RELEVANCE_AUTH_HEADER=authorization

KAMIYO_SWARM_AGENTAI_FEED_URL=
KAMIYO_SWARM_AGENTAI_API_KEY=
KAMIYO_SWARM_AGENTAI_AUTH_HEADER=authorization

KAMIYO_SWARM_KORE_FEED_URL=
KAMIYO_SWARM_KORE_API_KEY=
KAMIYO_SWARM_KORE_AUTH_HEADER=authorization

KAMIYO_SWARM_LEAD_CONVERSION_ENABLED=true
KAMIYO_SWARM_LEAD_CONVERSION_MAX_PER_TICK=4
KAMIYO_SWARM_LEAD_CONVERSION_DEFAULT_PAYOUT_USD=12
KAMIYO_SWARM_LEAD_CONVERSION_REQUIRE_ENDPOINT=true
KAMIYO_SWARM_LEAD_CONVERSION_SIMULATE_ONLY=false
KAMIYO_SWARM_LEAD_CONVERSION_MIN_CONFIDENCE=0.6
KAMIYO_SWARM_LEAD_CONTRACT_VALIDATION_ENABLED=true
KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS=168
KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES=3
KAMIYO_SWARM_ROLLBACK_ENABLED=true
KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS=24
KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS=7
KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER=-0.02
KAMIYO_SWARM_ROLLBACK_COOLDOWN_HOURS=24
```

Auth behavior:

- If auth header is `authorization` and key has no `Bearer` prefix, runtime prefixes `Bearer ` automatically.
- Any custom auth header name is supported.

## Normalization Rules

All sources are normalized to a canonical opportunity object with:

- `id`, `source`, `title`, `summary`, `url`
- `confidence`, `roleHints`, `tags`
- `payoutUsd`/`payoutSolEstimate`
- `createdAt`, `expiresAt`, `metadata`

Source-specific behavior:

- Relevance:
  - treated as potentially executable when endpoint appears API-like
  - otherwise treated as lead/discovery
- Agent.ai and Kore:
  - treated as lead/discovery by default unless feed includes explicit executable API endpoint metadata

## Execution Behavior

- Opportunities tagged as discovery leads (`metadata.executionMode=lead`) are mission-assigned but not auto-executed.
- Executable opportunities are run under job execution policy:
  - direct HTTP execution
  - x402 execution for `source=x402` with price/facilitator policy limits
- Lead conversion worker (optional):
  - converts lead opportunities into executable `direct`/`x402` opportunities
  - conversion can require explicit endpoint metadata or fallback to available action URL.
  - source-specific lead contract schema validation gates conversion when enabled.
  - simulation mode supports dry-run-only converted opportunities before live execution.
- Rollback source gating:
  - active rollback state disables configured weak sources during intake and execution windows.

## Registry Gating

Swarm assignment now respects per-agent channel config in the swarm registry:

- `jobSources`: hard gate for which opportunity sources an agent can receive.
- `marketplaceProfiles[].state`: scoring weight for marketplace opportunities.

Marketplace state impact:

- `approved` > `submitted` > `draft` > `not_listed` > `rejected`

This means an agent not configured for a source will not be assigned that source's opportunities, and approved listings are prioritized automatically.

## Source Feedback

Assignment scoring also applies source-quality weighting derived from recent realized performance:

- stronger recent source yield/success => higher assignment weight
- weak sources with enough samples => lower assignment weight
- weighting window and sample floor are controlled by:
  - `KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS`
  - `KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES`

Rollback policy can auto-disable weak sources when weekly net SOL degrades below threshold:

- `KAMIYO_SWARM_ROLLBACK_ENABLED`
- `KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS`
- `KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER`
- `KAMIYO_SWARM_ROLLBACK_COOLDOWN_HOURS`

## Receipts

Each tick writes:

- `swarm-opportunity-intake` receipt
- `swarm-job-execution` receipt (for executed/attempted jobs)
- `swarm-performance` receipt (priority updates)
- `swarm-margin-circuit` receipt (circuit-breaker state/events)
- `swarm-rollback-policy` receipt (weekly negative-net source throttling decisions)
- `swarm-revenue-report` receipt (lane-level net SOL accounting)
- `swarm-autonomy-slo` receipt (30-day autonomy metrics)
- `swarm-autonomy-alert` receipt (including signed webhook delivery metadata when configured)

## Next Extension

To support richer marketplace APIs, add source-specific adapter enrichers in:

- `services/kamiyo-operator/src/swarm/opportunities.ts`

and extend execution handlers in:

- `services/kamiyo-operator/src/swarm/jobs.ts`
