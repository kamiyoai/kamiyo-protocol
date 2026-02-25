# Wallet Control Plane

API service for wallet-linked agents, end-user entities, and mandate lifecycle management.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/wallet-control-plane run build
pnpm --filter @kamiyo/wallet-control-plane run dev
```

Production start:

```bash
pnpm --filter @kamiyo/wallet-control-plane start
```

## Environment

Copy `.env.example` to `.env`.

Required:

- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `PORT`
