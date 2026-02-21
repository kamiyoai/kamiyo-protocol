# Event Horizon Gauntlet Challenge Runbook

## Objective

Run a deterministic Truth Court stress campaign, export telemetry, cryptographically attest artifacts, and verify reproducibility.

## 1. Prerequisites

- Node 18+ and `pnpm`
- Repo dependencies installed
- Optional for live mode: `XAI_API_KEY`
- Required for artifact signing:
  - `EVENT_HORIZON_GAUNTLET_SIGNER_SECRET_KEY` (base58 secret key), or
  - `AGENT_PRIVATE_KEY`, or
  - `AGENT_KEYPAIR_PATH`

## 2. Build and test

```bash
pnpm --filter @kamiyo/mcp-server run build
pnpm --filter @kamiyo/mcp-server run test:truth-court
pnpm --filter @kamiyo/mcp-server run test:truth-court:gauntlet
pnpm --filter @kamiyo/mcp-server run test:truth-court:attestation
```

## 3. Run deterministic strict-policy campaign

```bash
XAI_API_KEY=... \
pnpm --filter @kamiyo/mcp-server run demo:event-horizon:gauntlet -- --live --strict --rounds 24 --seed 424242 --counterfactuals 3 --scenario-mix habitat-power,launch-anomaly,surface-rover
```

Expected outputs:

- `headlineCard` and 5-post `threadPack`
- `summary.merkleRoot`
- `summary.cosmicTrustIndex`
- `prometheusMetrics`

If Grok is unavailable, use `--policy default` for offline/mock reproducibility.

## 4. Run signed campaign export

```bash
EVENT_HORIZON_GAUNTLET_SIGN=1 \
EVENT_HORIZON_GAUNTLET_SIGNER_SECRET_KEY=<base58-secret> \
pnpm --filter @kamiyo/mcp-server run demo:event-horizon:gauntlet -- --mock --policy default --rounds 24 --seed 424242 --export-dir output/event-horizon-gauntlet
```

Expected export files:

- `<timestamp>-<runId>.json`
- `<timestamp>-<runId>.txt`
- `<timestamp>-<runId>.md`
- `<timestamp>-<runId>.prom`
- `<timestamp>-<runId>.attestation.json`

## 5. Verify exported attestation

```bash
pnpm --filter @kamiyo/mcp-server run demo:event-horizon:gauntlet:verify -- --attestation output/event-horizon-gauntlet/<timestamp>-<runId>.attestation.json
```

Pass condition:

- `verification.success=true`
- all artifact checks have `verified=true`

## 6. Reproducibility challenge

Run the same command from Step 3 twice. Pass condition:

- identical `runId`
- identical `summary.merkleRoot`

Change only the seed and rerun. Pass condition:

- `runId` changes
- `summary.merkleRoot` changes

## 7. Production policy recommendation

- Use `policyMode=strict` for production
- Enforce signed exports in CI for published challenge artifacts
- Ingest `.prom` into Prometheus/Grafana and alert on:
  - `event_horizon_oracle_failure_rate`
  - `event_horizon_average_oracle_latency_ms`
  - `event_horizon_replay_integrity_rate`
