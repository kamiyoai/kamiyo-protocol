# Observatory

Helius-backed ingestion + derived views for Kamiyo escrows and disputes.

## Endpoints

- `GET /health`
- `GET /stats`
- `GET /events?escrowPda=...&transactionId=...&limit=...`
- `GET /escrows?status=...&updatedSince=...&limit=...`
- `GET /escrows/:pda`
- `GET /escrows/by-transaction/:transactionId`
- `POST /webhooks/kamiyo` (Helius enhanced webhooks)
- `POST /backfill/transactions` (admin-only)

## Config (env)

- `PORT` (default `8787`)
- `MAX_BODY_BYTES` (default `5000000`)
- `OBS_DB_PATH` (default `data/observatory/observatory.db`)
- `HELIUS_WEBHOOK_SECRET` (optional; enables signature verification)
- `OBS_ADMIN_SECRET` (optional; enables backfill endpoint)
- `HELIUS_API_KEY` (optional; required for backfill)
- `OBS_CLUSTER` (`mainnet-beta` or `devnet`, default `mainnet-beta`)
- `ESCROW_PROGRAM_ID` (optional; used for parsing)
- `OBS_PROGRAM_ID` (optional; overrides `ESCROW_PROGRAM_ID`)

## Backfill

`POST /backfill/transactions` fetches enhanced transactions from Helius and re-ingests them through the same parsing path as webhooks.

Requirements:

- `OBS_ADMIN_SECRET` must be set
- request header: `Authorization: Bearer <OBS_ADMIN_SECRET>`
- `HELIUS_API_KEY` must be set

Body:

```json
{ "signatures": ["<txSig1>", "<txSig2>"] }
```

