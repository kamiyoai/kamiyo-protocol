# Keiro API

Hono-based API service for Keiro domain entities, receipts, and reputation routes.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/keiro-api run build
pnpm --filter @kamiyo/keiro-api run dev
```

Production start:

```bash
pnpm --filter @kamiyo/keiro-api start
```

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`
- `PORT`
- `RECEIPT_SIGNING_KEY`
