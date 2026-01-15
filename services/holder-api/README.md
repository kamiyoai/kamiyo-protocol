# Holder API

Token-gated REST API for KAMIYO holders.

## Requirements

- Node.js 18+
- Solana RPC endpoint
- Anthropic API key (for chat)
- xAI API key (for X search/trends)

## Setup

```bash
pnpm install
cp .env.example .env
# Edit .env with your config
pnpm dev
```

## Authentication

1. Request challenge: `GET /api/auth/challenge?wallet=<pubkey>`
2. Sign challenge with wallet
3. Verify and get API key: `POST /api/auth/verify`
4. Use API key in `Authorization: Bearer <token>` header

## Endpoints

### Public

- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /api/auth/challenge` - Get signing challenge
- `POST /api/auth/verify` - Verify signature, get API key
- `GET /api/openapi.json` - OpenAPI spec

### Protected (Pro tier - 1M+ tokens)

- `POST /api/v1/chat` - Chat with memory and market signals
- `GET /api/v1/chat/history` - Get conversation history
- `DELETE /api/v1/chat/history` - Clear conversation history
- `GET /api/v1/tokens/:query` - Token lookup
- `GET /api/v1/tokens/:query/formatted` - Token lookup with formatted output
- `GET /api/v1/market` - Market context (BTC, ETH, trending, headlines)
- `GET /api/v1/market/kamiyo` - KAMIYO-specific data
- `POST /api/v1/reputation/proof` - Generate ZK reputation proof
- `POST /api/v1/reputation/verify` - Verify ZK proof

## Chat Features

- Conversation memory (per wallet)
- Real-time crypto context (BTC, ETH, KAMIYO prices)
- Proprietary market signals
- X/Twitter search via Grok
- Streaming support

## Rate Limits

- Pro tier: 60 req/min, 10,000 req/day

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SOLANA_RPC_URL | Yes | Solana RPC endpoint |
| ANTHROPIC_API_KEY | Yes | Anthropic API key for chat |
| XAI_API_KEY | No | xAI API key for X search |
| PORT | No | API port (default: 3001) |
| JWT_SECRET | No | JWT signing secret (auto-generated) |
| KAMIYO_MINT | No | Token mint address |
| PRO_MIN_TOKENS | No | Min tokens for pro tier (default: 1M) |
| SOLANA_KEYPAIR_PATH | No | Path to keypair for ZK proofs |
