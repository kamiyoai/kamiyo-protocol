# SLA Enforcement Demo

Automatic quality-based refunds without manual disputes.

## What it shows

1. Escrow created with SLA parameters (quality threshold, max latency, min availability)
2. Agent delivers work
3. Quality assessment runs automatically
4. Refund calculated based on SLA breach severity:
   - Pass (>=80%): 0% refund
   - Minor breach (>=70%): 25% refund
   - Moderate breach (>=50%): 50% refund
   - Severe breach (>=30%): 75% refund
   - Critical breach (<30%): 100% refund

## Run

```bash
pnpm install
pnpm dev
```

## Live mode

```bash
export SOLANA_PRIVATE_KEY='[your key]'
export KAMIYO_NETWORK=devnet
pnpm dev
```
