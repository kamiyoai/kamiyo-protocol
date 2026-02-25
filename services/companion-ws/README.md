# Companion WS

Lightweight WebSocket event fanout service with optional authenticated ingest endpoint.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/companion-ws start
```

## Endpoints

- `GET /health`
- `POST /ingest` (requires `INGEST_API_KEY`)
- WebSocket stream on the same port

## Environment

Copy `.env.example` to `.env` and configure values before startup.
