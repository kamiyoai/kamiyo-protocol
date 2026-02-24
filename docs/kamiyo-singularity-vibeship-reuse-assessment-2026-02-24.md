# Vibeship Reuse Assessment (2026-02-24)

Repository reviewed:
- `https://github.com/vibeforge1111/vibeship-spark-intelligence`

## Verdict
- **No direct code reuse** for on-chain market or Solana execution paths.
- **High-value process reuse** for operations discipline, observability contracts, and incident management.

## Why No Direct Code Reuse
- Stack mismatch: Python local-intelligence runtime vs Solana Anchor/Rust + Next.js dApp.
- Domain mismatch: advisory/learning pipeline vs escrowed prediction market settlement and oracle resolution.
- Security model mismatch: local companion runtime assumptions do not map to adversarial on-chain execution.

## What Is Reusable
1. SLO framing
- Reused concept from `docs/observability/SLOS.md`.
- Adapted into Singularity-specific SLOs (market readiness, oracle freshness, fee-vault health).

2. Health contract split (liveness vs readiness)
- Reused concept from `docs/observability/HEALTH_CONTRACT.md`.
- Adapted for market/orderbook/operator health probes.

3. Incident response cadence
- Reused concept from `docs/observability/ONCALL_AND_INCIDENTS.md`.
- Adapted to dispute escalation, oracle inconsistency, and fee routing incidents.

## Files Added In kamiyo-protocol
- `docs/kamiyo-singularity-ops-slos.md`
- `docs/kamiyo-singularity-health-contract.md`
- `docs/kamiyo-singularity-incident-runbook.md`

## Not Adopted (Intentionally)
- Spark runtime (`sparkd.py`, `spark_watchdog.py`, `spark_scheduler.py`) 
- Advisory/memory pipeline modules in `lib/`
- Integration adapters that target Spark-specific local stores and workflows

## Net Impact
- No protocol risk introduced from third-party runtime code.
- Operational maturity improved through documented SLO/health/incident standards.
