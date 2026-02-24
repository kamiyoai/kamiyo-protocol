# KAMIYO Singularity x Polymarket CLI Integration (Agent Intel)

## Objective
Reuse the useful parts of [`polymarket-cli`](https://github.com/Polymarket/polymarket-cli) for agentic market intelligence without importing Polygon trading risk into the core Solana settlement path.

## What We Can Reuse Immediately

1. Read-only market discovery
- `markets list`
- `markets search`
- `status`

2. Read-only microstructure data
- `clob book`
- `clob midpoint`
- `clob spread`

3. Agent-compatible JSON output contract
- CLI already supports machine JSON output (`-o json`), which makes it script-safe for agent loops.

## What We Should Not Reuse Directly (Yet)

1. Key management model
- `polymarket-cli` stores private keys in local config for EVM signing.
- We should not mix this with KAMIYO stake-backed Solana agent keys.

2. Direct order execution
- `clob create-order` / `market-order` are execution paths on Polygon.
- For Singularity, this should remain external strategy input, not protocol execution.

3. Approval/bridge/CTF flows
- Useful for Polygon-native operations, but not protocol-critical for Singularity Phase 1/2.

## Implemented Integration in KEIRO API

A new adapter service wraps `polymarket-cli` with:
- bounded subprocess execution
- timeout enforcement
- JSON parse validation
- numeric normalization for market metadata
- TTL cache with stale-on-error fallback
- circuit breaker for repeated upstream failures

New agent-facing endpoints:

1. `GET /api/agents/polymarket/health`
- checks external CLI/API availability.

2. `GET /api/agents/polymarket/markets?limit=10&active=true`
- returns normalized external market snapshots.

3. `GET /api/agents/polymarket/search?q=<query>&limit=10`
- returns normalized search results.

4. `GET /api/agents/polymarket/orderbook/:tokenId`
- returns external CLOB orderbook depth for execution context.

5. `GET /api/agents/:id/polymarket/opportunities?limit=10&q=<optional>`
- ranks external markets against agent skill profile.
- scoring factors: skill overlap + liquidity + volume + active status.
- without `q`, this uses precomputed snapshots refreshed on a scheduler (default every 5 minutes).
- with `q`, this runs a direct query against external search.

All Polymarket-backed endpoints require signed Solana auth:
- `Authorization: Solana <pubkey>:<signature>:<timestamp>`
- signature message: `keiro-auth:<timestamp>`

## Safety and Operational Constraints

1. Read-only default
- no authenticated trading or key handling is exposed in this integration layer.

2. CLI dependency boundary
- binary path is configurable through `POLYMARKET_CLI_BIN`.
- failures degrade gracefully as service unavailability (`503`) instead of crashing API.
- transient failures can still return cached data for continuity.

3. No shell interpolation
- command invocation uses argument arrays, preventing command injection from query strings.

## Runtime Controls

- `POLYMARKET_CLI_BIN`: override CLI executable path/name
- `POLYMARKET_CACHE_TTL_MS`: fresh cache TTL
- `POLYMARKET_STALE_TTL_MS`: stale fallback window
- `POLYMARKET_BREAKER_FAILURE_THRESHOLD`: circuit breaker failure threshold
- `POLYMARKET_BREAKER_COOLDOWN_MS`: circuit breaker open duration
- `AGENT_OPPORTUNITY_REFRESH_MS`: scheduled snapshot refresh interval
- `AGENT_OPPORTUNITY_MARKET_LIMIT`: markets fetched per refresh cycle
- `AGENT_OPPORTUNITY_PER_AGENT_LIMIT`: top opportunities stored per agent
- `AGENT_OPPORTUNITY_STORE_PATH`: snapshot persistence file path
- `METRICS_BEARER_TOKEN`: optional bearer token guard for `/metrics`

## Observability Surface

`GET /metrics` exposes Prometheus text metrics for:
- adapter request/failure/cache/stale-fallback counters
- circuit-breaker state and open transitions
- adapter latency sum/count
- route-level rate-limit blocks
- snapshot refresh duration and success/error counters
- last successful refresh timestamp and stale snapshot serves

This endpoint is intended for infra scraping and alerting, not end-user traffic.

## Production Next Step

If we want execution integration later, do it as a separate service with:
- dedicated EVM wallet isolation
- policy engine + budget limits
- signed audit receipts to KAMIYO trust-layer evidence records
- explicit cross-chain risk controls
