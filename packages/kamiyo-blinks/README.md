# @kamiyo/blinks

Solana Actions (Blinks) for Kamiyo escrow protocol. Create escrows, release funds, file disputes, and check reputation directly from X or any Blink-enabled wallet.

## Actions

| Action | Endpoint | Description |
|--------|----------|-------------|
| Create Escrow | `/api/actions/create-escrow` | Lock SOL for a provider with configurable timelock |
| Release Escrow | `/api/actions/release-escrow` | Release funds after successful delivery |
| File Dispute | `/api/actions/dispute` | File dispute for oracle arbitration |
| Check Reputation | `/api/actions/reputation` | View on-chain trust score and history |

## Features

- **Quick Amount Buttons** - 0.1, 0.5, 1, 5 SOL presets when provider is known
- **Configurable Timelock** - 1 hour, 24 hours, 7 days, or 30 days
- **Action Chaining** - After creating escrow, see release/dispute options
- **Dispute Reasons** - Select from common reasons or specify custom
- **Reputation Display** - Trust score, dispute rate, stake amount

## Usage

### Share on X

Post a Blink URL with provider pre-filled:

```
https://blinks.kamiyo.ai/api/actions/create-escrow?provider=8xYz...
```

Users see quick amount buttons: `0.1 SOL | 0.5 SOL | 1 SOL | 5 SOL | Custom`

### Check Reputation

```
https://blinks.kamiyo.ai/api/actions/reputation?address=8xYz...
```

Displays: `8xYz... - 92% Trust | 150 escrows | 2% disputed | 0.5 SOL staked`

### Embed in Website

```html
<a href="solana-action:https://blinks.kamiyo.ai/api/actions/create-escrow?provider=YOUR_ADDRESS">
  Pay with Kamiyo Escrow
</a>
```

## Deploy

### Vercel (App Router)

```typescript
// app/api/actions/[action]/route.ts
import { handleGet, handlePost, handleOptions, ActionType } from '@kamiyo/blinks';

export async function GET(req: Request, { params }: { params: { action: string } }) {
  return handleGet(params.action as ActionType, new URL(req.url));
}

export async function POST(req: Request, { params }: { params: { action: string } }) {
  const body = await req.json();
  return handlePost(params.action as ActionType, body, new URL(req.url));
}

export const OPTIONS = handleOptions;
```

```typescript
// app/actions.json/route.ts
import { actionsManifest, CORS_HEADERS } from '@kamiyo/blinks';

export async function GET() {
  return new Response(JSON.stringify(actionsManifest), { headers: CORS_HEADERS });
}
```

### Cloudflare Workers

```typescript
import { handleRequest } from '@kamiyo/blinks';

export default {
  fetch: handleRequest,
};
```

### Standalone Server

```typescript
import { handleRequest } from '@kamiyo/blinks';

Bun.serve({
  port: 3000,
  fetch: handleRequest,
});
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `BLINKS_BASE_URL` | `https://blinks.kamiyo.ai` | Base URL for action links |

## URL Parameters

### Create Escrow

| Parameter | Required | Description |
|-----------|----------|-------------|
| `provider` | Yes | Provider wallet address |
| `amount` | Yes | Amount in SOL |
| `timelock` | No | `1h`, `24h`, `7d`, or `30d` (default: `24h`) |

### Release Escrow

| Parameter | Required | Description |
|-----------|----------|-------------|
| `escrowId` | Yes | Escrow ID from creation |
| `provider` | Yes | Provider wallet address |

### File Dispute

| Parameter | Required | Description |
|-----------|----------|-------------|
| `escrowId` | Yes | Escrow ID to dispute |
| `reason` | No | `no_delivery`, `poor_quality`, `incomplete`, `misrepresented`, `other` |

### Check Reputation

| Parameter | Required | Description |
|-----------|----------|-------------|
| `address` | Yes | Wallet address to lookup |

## License

MIT
