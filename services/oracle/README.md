# Oracle Service

Hyperliquid oracle worker for periodic updates and dispute auto-resolution.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/oracle-service run build
pnpm --filter @kamiyo/oracle-service run dev
```

Production start:

```bash
pnpm --filter @kamiyo/oracle-service start
```

## Environment

Copy `.env.example` to `.env`.

Required:

- `ORACLE_PRIVATE_KEY`

Common optional overrides:

- `RPC_URL`
- `UPDATE_INTERVAL`
- `DISPUTE_INTERVAL`
- `TRUSTED_ORACLES`
- `REQUIRED_SIGNATURES`
- `PORT`
