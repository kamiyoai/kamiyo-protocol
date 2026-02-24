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
