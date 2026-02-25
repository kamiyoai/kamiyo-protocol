# Companion API

Main HTTP service for companion endpoints, multi-agent orchestration, and protocol-facing runtime APIs.

## Run

```bash
pnpm install
pnpm --filter kamiyo-companion run build
pnpm --filter kamiyo-companion run dev
```

Production start:

```bash
pnpm --filter kamiyo-companion start
```

## Environment

Copy `.env.example` to `.env` and set values for your deployment profile.

At minimum for local startup, configure:

- `PORT` or `API_PORT`
- `SOLANA_RPC_URL`
- `JWT_SECRET`
- `API_SECRET`

This service has a large number of feature-gated integrations (LLM, social, DKG, marketplace, telemetry). The full env contract is listed in `.env.example`.
