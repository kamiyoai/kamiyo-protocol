# x402 Facilitator

Settlement and escrow facilitator service with verification, fee routing, and dispute endpoints.

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
