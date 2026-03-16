# x402 Facilitator

Primary Kizuna protocol edge for verification, settlement, funding locks, collateralized approvals, and repayment state.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/x402-facilitator run build
pnpm --filter @kamiyo/x402-facilitator run dev
```

Production start:

```bash
pnpm --filter @kamiyo/x402-facilitator start
```

## Environment

Copy `.env.example` to `.env`.

Required:

- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `FACILITATOR_PRIVATE_KEY`
- `TREASURY_WALLET`
- `PORT`

Optional Base settlement:

- `BASE_RPC_URL`
- `BASE_FACILITATOR_KEY`
- `BASE_TREASURY_ADDRESS`

## Kizuna

Kizuna enables controlled x402 settlement with lane-aware reservations, exact billable settlement accounting, and either prefunded or collateralized safety rails.

Enable it with:

- `KIZUNA_ENABLED=true`
- `KIZUNA_SHADOW_MODE=false`
- `KIZUNA_MAX_SINGLE_MICRO=10000000`
- `KIZUNA_RESERVATION_TTL_MS=120000`
- `KIZUNA_INTERNAL_TOKEN=<shared internal bearer token>`
- `WALLET_CONTROL_PLANE_URL=<wallet-control-plane base URL>`
- `CREDITS_INTERNAL_URL=<companion API base URL or /api/credits URL>`
- `KIZUNA_ENTERPRISE_REQUIRE_PREFUND=true`
- `KIZUNA_SECURED_ONLY=false`
- `KIZUNA_FASTPATH_LTV_CAP_BPS=4000`
- `KIZUNA_FASTPATH_MIN_HEALTH_FACTOR=1.8`

### Account APIs

- `POST /kizuna/accounts/onboard`
- `GET /kizuna/accounts/:agentId`
- `GET /kizuna/accounts/:agentId/transactions`
- `POST /kizuna/accounts/:agentId/repay`

### Enterprise funding APIs

- `POST /kizuna/funding/:agentId/deposit-intent`
- `POST /kizuna/funding/:agentId/confirm`
- `GET /kizuna/funding/:agentId`
- `POST /kizuna/funding/:agentId/withdraw`

### x402 extension payload

Set `paymentRequirements.extra.kizuna`:

```json
{
  "mode": "credit",
  "agentId": "<agent id>",
  "repayWallet": "<credits wallet>"
}
```

When active, verify and settle responses include Kizuna extension metadata for approval, funding mode, available balance, and debt state.

### Repayment runbook

1. Check whether the failure is auth, balance, or transport.
2. Retry with the same `referenceId` to preserve idempotency.
3. If the debit succeeded but facilitator write failed, retry the same request until records reconcile.

## FairScale trust sync

The facilitator can push Kizuna trust events to FairScale from an internal outbox. Supported event types:

- `collateral_deposited`
- `collateral_withdrawn`
- `settlement_confirmed`
- `repayment_received`

Enable delivery with:

- `FAIRSCALE_TRUST_EVENTS_URL=https://fairscale.example/kizuna/trust-events`
- `FAIRSCALE_TRUST_EVENTS_KEY=<shared bearer-style key sent in the configured header>`
- `FAIRSCALE_TRUST_EVENTS_KEY_HEADER=x-kizuna-key`
- `FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE=disabled|hmac-sha256-body`
- `FAIRSCALE_TRUST_EVENTS_SIGNATURE_HEADER=x-kizuna-signature`
- `FAIRSCALE_TRUST_EVENTS_HMAC_SECRET=<required when signature mode is hmac-sha256-body>`
- `FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD=signature`

Optional tuning:

- `FAIRSCALE_TRUST_EVENTS_BATCH_SIZE`
- `FAIRSCALE_TRUST_EVENTS_FLUSH_INTERVAL_MS`
- `FAIRSCALE_TRUST_EVENTS_TIMEOUT_MS`
- `FAIRSCALE_TRUST_EVENTS_LEASE_MS`
- `FAIRSCALE_TRUST_EVENTS_MAX_RETRY_MS`

### Internal inspection and flush

These routes are internal-only and require `Authorization: Bearer $KIZUNA_INTERNAL_TOKEN`:

- `GET /kizuna/fairscale/trust-sync`
- `POST /kizuna/fairscale/trust-sync/flush`
- `POST /kizuna/fairscale/trust-sync/requeue`

The status endpoint returns the current FairScale config snapshot, queue totals, and recent outbox rows. The flush endpoint forces one immediate delivery pass and then returns the updated queue snapshot.

### Partner test flow

```bash
export FACILITATOR_BASE_URL=https://facilitator.example
export INTERNAL_TOKEN=replace-me

curl -sS \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  "$FACILITATOR_BASE_URL/kizuna/fairscale/trust-sync?limit=10"

curl -sS -X POST \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  "$FACILITATOR_BASE_URL/kizuna/fairscale/trust-sync/requeue?failedOnly=true&limit=50&recent=10"

curl -sS -X POST \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  "$FACILITATOR_BASE_URL/kizuna/fairscale/trust-sync/flush?limit=10"
```

Use `requeue` when rows are stuck behind retry backoff and you want to force them eligible for immediate delivery. `failedOnly=true` limits that reset to rows that already have retry history.
