# @kamiyo/blinks

Solana Actions (Blinks) for Kamiyo escrow protocol. Create escrows, release funds, and file disputes directly from X or any Blink-enabled wallet.

## Actions

| Action | URL | Description |
|--------|-----|-------------|
| Create Escrow | `/api/actions/create-escrow` | Lock SOL for a provider |
| Release Escrow | `/api/actions/release-escrow` | Release funds after delivery |
| File Dispute | `/api/actions/dispute` | File dispute for arbitration |
| Check Reputation | `/api/actions/reputation` | View on-chain reputation |

## Usage

### Share on X

Post a Blink URL to create an escrow directly from X timeline:

```
https://blinks.kamiyo.ai/api/actions/create-escrow?provider=8xYz...
```

### Embed in Website

```html
<a href="solana-action:https://blinks.kamiyo.ai/api/actions/create-escrow">
  Pay with Kamiyo
</a>
```

## Deploy

### Vercel

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

### Cloudflare Workers

```typescript
import { handleGet, handlePost, handleOptions, ActionType } from '@kamiyo/blinks';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop() as ActionType;

    if (request.method === 'OPTIONS') return handleOptions();
    if (request.method === 'GET') return handleGet(action, url);
    if (request.method === 'POST') {
      const body = await request.json();
      return handlePost(action, body, url);
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | mainnet | Solana RPC endpoint |
| `BLINKS_BASE_URL` | `https://blinks.kamiyo.ai` | Base URL for action links |

## License

MIT
