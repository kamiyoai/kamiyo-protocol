# KAMIYO Singularity Incident Runbook

## Severity
- SEV-0: fee misrouting, exploit, oracle manipulation with incorrect market settlement
- SEV-1: market creation/trading/resolution outage, dispute workflow unavailable
- SEV-2: partial degradation, delayed resolution, non-critical UI/API failures

## First 5 Minutes
1. Confirm blast radius:
   - affected markets
   - affected wallets
   - affected instructions
   - affected metric families (`/metrics` scrape snapshot)
2. Freeze risk paths if needed:
   - disable new market creation UI
   - disable order placement UI
3. Capture evidence:
   - transaction signatures
   - program logs
   - vault balances and account snapshots
   - adapter counters and gauges at incident time

## Metric-Driven Triage
- If `polymarket_circuit_breaker_open == 1`:
  - verify upstream CLI/API availability with `/api/agents/polymarket/health`
  - confirm stale fallback is serving (`polymarket_cli_stale_fallback_total` increasing)
  - if breaker remains open past 10m, treat as SEV-1
- If adapter failure ratio breaches critical threshold:
  - compare `polymarket_cli_failures_total` and `polymarket_cli_requests_total` over 10m
  - inspect subprocess timeout/failure logs for CLI invocation path
  - reduce refresh load by increasing `AGENT_OPPORTUNITY_REFRESH_MS` temporarily
- If refresh success timestamp is stale:
  - inspect `agent_opportunity_refresh_total{status="error"}`
  - verify snapshot persistence path is writable
  - run a forced single-agent refresh on a known active agent and capture errors
- If rate-limit spikes:
  - inspect wallet/IP distribution for concentration
  - confirm signature auth middleware is active on Polymarket routes
  - apply temporary tighter limit window only if abuse confirmed

## Containment
- For fee anomalies:
  - block additional settlements at application layer until verified
  - verify protocol fee vault owner and mint constraints on chain
- For oracle anomalies:
  - halt market resolution path
  - route affected markets into dispute escalation

## Recovery
1. Patch and verify with reproducible test cases.
2. Re-run unit and integration suites.
3. Dry-run against devnet scenarios matching incident signatures.
4. Resume functionality in staged order:
   - read-only -> create market -> trade -> resolve
5. Verify metric normalization after recovery:
   - circuit breaker gauge returns to `0`
   - stale-fallback ratio returns below warning threshold
   - refresh success timestamp updates within expected interval

## Postmortem (within 48h)
- Root cause
- Detection gap
- Code fix
- Monitoring rule added
- Test added to prevent recurrence
- User-facing impact statement
- Alert threshold tuning notes (false positives vs. missed detections)
