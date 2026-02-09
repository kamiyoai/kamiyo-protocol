# Observatory

Helius-backed ingestion + derived views for Kamiyo escrows and disputes.

## Endpoints

- `GET /health`
- `GET /stats`
- `GET /events?escrowPda=...&sessionId=...&limit=...` (also accepts `transactionId` as an alias)
- `GET /escrows?status=...&updatedSince=...&limit=...`
- `GET /escrows/:pda`
- `GET /escrows/by-session/:sessionId` (also available as `/escrows/by-transaction/:transactionId` for compatibility)
- `POST /webhooks/kamiyo` (Helius enhanced webhooks)
- `POST /backfill/transactions` (admin-only)

## Config (env)

- `PORT` (default `8787`)
- `MAX_BODY_BYTES` (default `5000000`)
- `OBS_DB_PATH` (default `data/observatory/observatory.db`)
- `HELIUS_WEBHOOK_SECRET` (optional; enables signature verification)
- `OBS_ADMIN_SECRET` (optional; enables backfill endpoint)
- `HELIUS_API_KEY` (optional; if set, backfill uses Helius enhanced transactions)
- `SOLANA_RPC_URL` (optional; used for RPC backfill when `HELIUS_API_KEY` is not set)
- `OBS_CLUSTER` (`mainnet-beta` or `devnet`, default `mainnet-beta`)
- `ESCROW_PROGRAM_ID` (optional; used for parsing)
- `OBS_PROGRAM_ID` (optional; overrides `ESCROW_PROGRAM_ID`)

## Backfill

`POST /backfill/transactions` fetches transactions and re-ingests them through the same parsing path as webhooks.

It prefers Helius enhanced transactions when `HELIUS_API_KEY` is set; otherwise it falls back to Solana RPC (`SOLANA_RPC_URL` or the cluster default RPC).

Requirements:

- `OBS_ADMIN_SECRET` must be set
- request header: `Authorization: Bearer <OBS_ADMIN_SECRET>`

Body:

```json
{ "signatures": ["<txSig1>", "<txSig2>"] }
```
