# Meishi Compliance Service

Compliance auditing runtime for Meishi passports with optional DKG publishing and realtime alerting.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/meishi-compliance run build
pnpm --filter @kamiyo/meishi-compliance run dev
```

Production start:

```bash
pnpm --filter @kamiyo/meishi-compliance start
```

## Environment

Copy `.env.example` to `.env`.

Most deployments require:

- `SOLANA_RPC_URL`
- `COMPLIANCE_API_KEY`
- `MEISHI_PROGRAM_ID`
- `PORT`
