# @kamiyo/x402-client

x402 payment client with Kamiyo escrow protection and SLA enforcement.

## Overview

This package extends the [x402 protocol](https://www.x402.org/) with Kamiyo's escrow-backed dispute resolution. When an API fails to meet service expectations, agents can automatically file disputes and receive graduated refunds based on oracle-assessed quality scores.

## Installation

```bash
npm install @kamiyo/x402-client @solana/web3.js
```

## Usage

### Basic Request with Payment

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createX402KamiyoClient } from '@kamiyo/x402-client';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* agent keypair */);
const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

const client = createX402KamiyoClient(connection, wallet, programId, {
  maxPricePerRequest: 0.01, // Max 0.01 SOL per request
  qualityThreshold: 70,      // Auto-dispute if quality < 70
});

// Request with automatic payment handling
const response = await client.request<{ data: string }>('https://api.example.com/data');

if (response.success) {
  console.log(response.data);
}
```

### Request with SLA Enforcement

```typescript
const response = await client.request('https://api.example.com/data', {
  useEscrow: true,
  sla: {
    maxLatencyMs: 500,
    minQualityScore: 80,
    customValidator: (data) => {
      const records = (data as any).records || [];
      return {
        passed: records.length >= 10,
        qualityScore: Math.min(100, records.length * 10),
        violations: records.length < 10 ? ['Insufficient records'] : [],
        metrics: { recordCount: records.length },
      };
    },
  },
});

if (response.slaResult && !response.slaResult.passed) {
  console.log('SLA violated:', response.slaResult.violations);
  // Dispute is automatically filed if escrow was used
}
```

### Manual Escrow Creation

```typescript
const paymentResult = await client.createEscrow(
  providerPublicKey,
  0.01 * LAMPORTS_PER_SOL,
  'tx-12345'
);

if (paymentResult.success) {
  console.log('Escrow PDA:', paymentResult.escrowPda?.toBase58());
}
```

### Manual Dispute

```typescript
const disputeResult = await client.dispute({
  escrowPda: escrowPublicKey,
  reason: 'API returned incomplete data',
  evidence: {
    expectedSla: { maxLatencyMs: 500 },
    actualMetrics: { latencyMs: 2500 },
    violations: ['Latency exceeded 5x threshold'],
  },
});

if (disputeResult.success) {
  console.log(`Quality score: ${disputeResult.qualityScore}`);
  console.log(`Refund: ${disputeResult.refundPercentage}%`);
}
```

### Facilitator Preference and Fallback

Agents can prefer Kamiyo services while keeping x402 interoperability by configuring an ordered fallback list.

```typescript
import { createPayAIFacilitator } from '@kamiyo/x402-client';

const facilitator = createPayAIFacilitator('0xYourMerchantWallet', {
  facilitatorUrl: 'https://x402.kamiyo.ai', // primary
  facilitatorUrls: [
    'https://facilitator.payai.network', // first fallback
    'https://another-x402-facilitator.example', // optional additional fallback
  ],
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | Connection | required | Solana RPC connection |
| `wallet` | Keypair | required | Agent keypair for signing |
| `programId` | PublicKey | required | Kamiyo program ID |
| `qualityThreshold` | number | 70 | Auto-dispute if quality below this |
| `maxPricePerRequest` | number | 0.1 | Max SOL per request |
| `defaultTimeLock` | number | 3600 | Escrow time lock in seconds |
| `enableSlaMonitoring` | boolean | true | Enable SLA validation |

## Quality-Based Refunds

Disputes are resolved by oracle consensus with graduated refunds:

| Quality Score | Service Level | Refund |
|--------------|---------------|--------|
| 80-100 | Good | 0% |
| 65-79 | Average | 35% |
| 50-64 | Below Average | 75% |
| 0-49 | Poor | 100% |

## x402 Protocol Compatibility

This client implements the [x402 specification](https://github.com/coinbase/x402):

- Parses `402 Payment Required` responses
- Supports `X-Payment` header format
- Compatible with x402 facilitators
- Adds `X-Kamiyo-*` headers for escrow integration

## Authorize-Once Sessions (Solana)

KAMIYO supports an authorize-once session scheme so buyers don't need to sign every request.

1. Buyer approves a USDC delegate allowance (one-time tx)
2. Buyer signs a session challenge (one-time signature)
3. Client uses `paymentHeader: session:<network>:<token>.<nonce>` on each request

### Embeddable Widget

Sellers can surface the flow directly on a webpage:

```html
<div id="x402-session"></div>
<script type="module">
  import { createKamiyoX402SessionWidget } from '@kamiyo/x402-client';

  const widget = createKamiyoX402SessionWidget('#x402-session', {
    facilitatorUrl: 'https://x402.kamiyo.ai',
    merchantWallet: 'YOUR_SOLANA_WALLET',
    defaultMaxTotalUsdc: '5',
    defaultSessionDays: 7,
    onAuthorized: ({ token, paymentHeader, expiresAt }) => {
      console.log('session token:', token);
      console.log('base header:', paymentHeader);
      console.log('expires:', new Date(expiresAt).toISOString());
    },
  });
```

Or as a custom element:

```html
<kamiyo-x402-session
  facilitator-url="https://x402.kamiyo.ai"
  merchant-wallet="YOUR_SOLANA_WALLET"
  default-max-total-usdc="5"
  default-session-days="7"
></kamiyo-x402-session>

<script>
  document
    .querySelector('kamiyo-x402-session')
    .addEventListener('kamiyo-x402-session-authorized', (e) => {
      console.log('authorized:', e.detail);
    });
```

## Server Integration

For servers accepting Kamiyo-protected payments, use `@kamiyo/middleware`:

```typescript
import { x402KamiyoMiddleware } from '@kamiyo/middleware';

app.use('/api', x402KamiyoMiddleware({
  connection,
  programId,
  price: 0.001,
  providerWallet: providerPublicKey,
  requireEscrow: true,
}));
```

## License

MIT
