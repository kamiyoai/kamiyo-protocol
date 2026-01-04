# @kamiyo/middleware

HTTP 402 Payment Required middleware with Solana Actions (Blinks) integration for agentic payments.

## Installation

```bash
npm install @kamiyo/middleware
```

## Features

- **HTTP 402 Compliant**: Implements RFC 9110 Section 15.5.3
- **Solana Actions**: Full Blinks support for discoverable payment links
- **Escrow Protection**: Kamiyo dispute resolution for quality guarantees
- **SPL Token Support**: SOL, USDC, USDT payments
- **Agent-Ready**: Programmatic payment discovery and execution

## Quick Start

### Basic HTTP 402 Middleware

```typescript
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { KamiyoPaymentMiddleware } from '@kamiyo/middleware';

const app = express();
const connection = new Connection('https://api.mainnet-beta.solana.com');

app.use('/api/premium', KamiyoPaymentMiddleware({
  realm: 'my-api',
  programId: new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),
  connection,
  price: 0.001,
  qualityGuarantee: true
}));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'protected content' });
});
```

### Solana Actions (Blinks) Integration

```typescript
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { createActionsRouter } from '@kamiyo/middleware';

const app = express();

// Mount Solana Actions endpoints
app.use(createActionsRouter({
  baseUrl: 'https://api.example.com',
  programId: new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  providerWallet: new PublicKey('YOUR_WALLET'),
  title: 'Premium API Access',
  description: 'Pay-per-use AI inference API',
  pricing: [
    { id: 'basic', label: 'Single Request', amount: 0.001, currency: 'SOL' },
    { id: 'pro', label: '100 Requests', amount: 0.05, currency: 'SOL' },
    { id: 'usdc', label: 'Single Request', amount: 0.10, currency: 'USDC' },
  ],
  escrowRequired: true,
  defaultTimeLock: 86400, // 24 hours
}));

app.listen(3000);
```

This creates the following endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /actions.json` | Solana Actions rules file |
| `GET /api/actions/pay` | Payment action metadata |
| `POST /api/actions/pay/:tierId` | Create payment transaction |
| `GET /api/actions/escrow` | Escrow action metadata |
| `POST /api/actions/escrow/:tierId` | Create escrow transaction |

### Agent Integration (SDK)

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { X402Client } from '@kamiyo/sdk';

const client = new X402Client({
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  wallet: Keypair.generate(),
  programId: new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),
  qualityThreshold: 70,
  maxPricePerRequest: 0.1,
});

// Auto-discover and pay for API access
const response = await client.request('https://api.example.com/premium/inference', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Hello' }),
  useEscrow: true,
});

if (response.success) {
  console.log(response.data);
}
```

## API Reference

### KamiyoPaymentMiddleware(options)

Express middleware for HTTP 402 payment verification.

| Option | Type | Description |
|--------|------|-------------|
| `realm` | string | API realm identifier |
| `programId` | PublicKey | Kamiyo program ID |
| `connection` | Connection | Solana RPC connection |
| `price` | number | Price in SOL |
| `qualityGuarantee` | boolean | Enable dispute protection |

### createActionsRouter(config)

Creates Express router with Solana Actions endpoints.

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | string | Base URL for action endpoints |
| `programId` | PublicKey | Kamiyo program ID |
| `connection` | Connection | Solana RPC connection |
| `providerWallet` | PublicKey | Wallet to receive payments |
| `title` | string | Action title |
| `description` | string | Action description |
| `pricing` | PricingTier[] | Available pricing options |
| `escrowRequired` | boolean | Require escrow for protection |
| `defaultTimeLock` | number | Default escrow time lock (seconds) |

### PricingTier

```typescript
interface PricingTier {
  id: string;           // Tier identifier
  label: string;        // Display label
  amount: number;       // Price amount
  currency: 'SOL' | 'USDC' | 'USDT';
  description?: string; // What the tier provides
}
```

## Solana Actions Flow

```
Agent                              API Provider
  │                                     │
  │  1. GET /actions.json               │
  ├────────────────────────────────────►│
  │     (discover payment options)      │
  │◄────────────────────────────────────┤
  │                                     │
  │  2. POST /api/actions/pay/:tier     │
  ├────────────────────────────────────►│
  │     (get unsigned transaction)      │
  │◄────────────────────────────────────┤
  │                                     │
  │  3. Sign & submit transaction       │
  ├────────────────────────────────────►│ Solana
  │                                     │
  │  4. Request API with payment proof  │
  ├────────────────────────────────────►│
  │     X-Payment-Proof: <escrow>       │
  │◄────────────────────────────────────┤
  │     (protected content)             │
```

## License

BUSL-1.1
