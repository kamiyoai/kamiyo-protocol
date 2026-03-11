# Wallet Control Plane

Control surface for Kizuna mandates, linked wallets, enterprise funding limits, and crypto-fast collateral checks.

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

## Kizuna role

This service is responsible for:

- agent onboarding state
- wallet-linked end-user controls
- mandate lifecycle and normalized mandate limits
- enterprise funding constraints
- collateral-aware control-plane reads used by the crypto-fast lane
