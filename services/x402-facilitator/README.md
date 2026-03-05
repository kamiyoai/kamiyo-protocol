# x402 Facilitator

Settlement and escrow facilitator service with verification, fee routing, and dispute endpoints.

## Run

```bash
pnpm install
pnpm --filter @kamiyo-org/x402-facilitator run build
pnpm --filter @kamiyo-org/x402-facilitator run dev
```

Production start:

```bash
pnpm --filter @kamiyo-org/x402-facilitator start
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

## Kizuna (Agent Credit Proxy)

Kizuna enables facilitator-fronted x402 settlement with post-settlement debt tracking and repayment from credits.

Enable it with:

- `KIZUNA_ENABLED=true`
- `KIZUNA_SHADOW_MODE=false` (optional; if true, verify keeps flowing even when underwriting denies)
- `KIZUNA_MAX_SINGLE_MICRO=10000000` (default 10 USDC)
- `KIZUNA_RESERVATION_TTL_MS=120000`
- `KIZUNA_INTERNAL_TOKEN=<shared internal bearer token>`
- `WALLET_CONTROL_PLANE_URL=<wallet-control-plane base URL>`
- `CREDITS_INTERNAL_URL=<companion API base URL or /api/credits URL>`
- `KIZUNA_ENTERPRISE_REQUIRE_PREFUND=true`
- `KIZUNA_SECURED_ONLY=false`
- `KIZUNA_FASTPATH_LTV_CAP_BPS=4000`
- `KIZUNA_FASTPATH_MIN_HEALTH_FACTOR=1.8`

### Kizuna account APIs

- `POST /kizuna/accounts/onboard`
  - body: `{ agentId, payerWallet, repayWallet, networks?, passportAddress? }`
- `GET /kizuna/accounts/:agentId`
- `GET /kizuna/accounts/:agentId/transactions`
- `POST /kizuna/accounts/:agentId/repay`
  - body: `{ source: "credits", amountMicro, referenceId }`

### Kizuna enterprise funding APIs

- `POST /kizuna/funding/:agentId/deposit-intent`
  - body: `{ lane?: "enterprise", poolId?, amountMicro }`
- `POST /kizuna/funding/:agentId/confirm`
  - body: `{ lane?: "enterprise", poolId?, amountMicro, referenceId, txHash? }`
- `GET /kizuna/funding/:agentId`
  - query: `lane=enterprise`, `poolId?`, `limit?`
- `POST /kizuna/funding/:agentId/withdraw`
  - body: `{ lane?: "enterprise", poolId?, amountMicro, referenceId, txHash? }`

### x402 extension payload

Set `paymentRequirements.extra.kizuna`:

```json
{
  "mode": "credit",
  "agentId": "<agent id>",
  "repayWallet": "<credits wallet>"
}
```

When active, verify/settle responses include:

```json
{
  "extensions": {
    "kizuna": {
      "approved": true,
      "decisionId": "<id>",
      "approvedMicro": "1000000",
      "availableMicro": "3000000",
      "lockedMicro": "1000000",
      "fundingMode": "prefunded",
      "outstandingMicro": "0",
      "debtId": "<optional on settle>"
    }
  }
}
```

### Repayment failure runbook

If repayment fails:

1. Check internal debit response (`INSUFFICIENT_BALANCE` vs auth vs transport failure).
2. Retry with the same `referenceId` to preserve idempotency.
3. If debit succeeded but facilitator repayment write failed, retry same `referenceId`; both debit and repayment writes are idempotent and should reconcile.
