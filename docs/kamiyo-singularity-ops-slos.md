# KAMIYO Singularity SLOs

## SLO-1: Protocol Readiness
- Indicator: market + orderbook services return healthy readiness (RPC reachable, program IDs resolvable).
- Target: 99.5% over rolling 24h.
- Alert: 3 consecutive readiness failures.
- Probe automation: `.github/workflows/kamiyo-singularity-devnet-canary.yml` running `ops/kamiyo-singularity/devnet-canary.mjs` every 4 hours.

## SLO-2: Oracle Resolution Freshness
- Indicator: active markets with passed `resolution_deadline` are resolved within target window.
- Target: 95% resolved within 15 minutes after deadline.
- Alert: any market unresolved for > 60 minutes after deadline.

## SLO-3: Fee Flywheel Integrity
- Indicator: settled trades emit fee values and protocol fee vault balance delta matches expected fee accrual.
- Target: 100% of settled trades account for expected fee math.
- Alert: any mismatch between expected and observed vault deltas.

## SLO-4: Dispute Workflow Availability
- Indicator: dispute instructions and truth-court workflow available and executable.
- Target: 99.9% availability.
- Alert: dispute flow unavailable for > 5 minutes.

## SLO-5: Frontend Trade Path Availability
- Indicator: create market, place order, and portfolio pages function without fatal client/server errors.
- Target: 99.5% over rolling 24h.
- Alert: sustained error spike above threshold for 10 minutes.

## SLO-6: External Intel Adapter Reliability
- Indicator: Polymarket read path keeps serving data (fresh or bounded stale fallback) without sustained hard failures.
- Target: >= 99.0% successful responses over rolling 24h.
- Alert: adapter failure ratio above threshold for 10 minutes.

## Metric Alert Thresholds (Prometheus)

### API Adapter / External Intel
- `polymarket_cli_failures_total / polymarket_cli_requests_total`:
  - Warn at `> 0.10` for 5m.
  - Critical at `> 0.20` for 10m.
- `polymarket_cli_stale_fallback_total`:
  - Warn when fallback ratio `> 0.25` for 10m.
  - Critical when fallback ratio `> 0.50` for 10m.
- `polymarket_circuit_breaker_open`:
  - Warn when `== 1` for 2m.
  - Critical when `== 1` for 10m.
- Average CLI latency:
  - Compute as `rate(polymarket_cli_latency_ms_sum[5m]) / rate(polymarket_cli_latency_ms_count[5m])`.
  - Warn at `> 1200ms` for 10m.
  - Critical at `> 2500ms` for 10m.

### Agent Opportunity Snapshot Pipeline
- `agent_opportunity_refresh_total{status="error"} / agent_opportunity_refresh_total`:
  - Warn at `> 0.10` for 10m.
  - Critical at `> 0.25` for 10m.
- `agent_opportunity_last_refresh_success_timestamp_seconds` staleness:
  - Warn when no success for `> 2 * AGENT_OPPORTUNITY_REFRESH_MS`.
  - Critical when no success for `> 4 * AGENT_OPPORTUNITY_REFRESH_MS`.
- `agent_opportunity_snapshot_stale_served_total`:
  - Warn when stale-serving ratio `> 0.20` for 15m.
  - Critical when stale-serving ratio `> 0.40` for 15m.

### Access Control / Abuse Control
- `polymarket_route_rate_limit_total`:
  - Warn when `increase(...[5m]) > 100`.
  - Critical when `increase(...[5m]) > 300`.
  - If this triggers without traffic growth, treat as abuse or auth fan-out bug.

## Alert Ownership and Escalation
- SEV-2: warning-level thresholds breached.
- SEV-1: critical threshold for adapter reliability or snapshot refresh breached.
- SEV-0: combine critical threshold with fee integrity mismatch or settlement corruption.
