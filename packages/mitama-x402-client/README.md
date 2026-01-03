# @mitama/x402-client

x402 payment client with Mitama escrow protection and SLA enforcement.

## Overview

This package extends the [x402 protocol](https://www.x402.org/) with Mitama's escrow-backed dispute resolution. When an API fails to meet service expectations, agents can automatically file disputes and receive graduated refunds based on oracle-assessed quality scores.

## Installation

```bash
npm install @mitama/x402-client @solana/web3.js
```

## Usage

### Basic Request with Payment

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createX402MitamaClient } from '@mitama/x402-client';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* agent keypair */);
const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

const client = createX402MitamaClient(connection, wallet, programId, {
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

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | Connection | required | Solana RPC connection |
| `wallet` | Keypair | required | Agent keypair for signing |
| `programId` | PublicKey | required | Mitama program ID |
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
- Adds `X-Mitama-*` headers for escrow integration

## Server Integration

For servers accepting Mitama-protected payments, use `@mitama/middleware`:

```typescript
import { x402MitamaMiddleware } from '@mitama/middleware';

app.use('/api', x402MitamaMiddleware({
  connection,
  programId,
  price: 0.001,
  providerWallet: providerPublicKey,
  requireEscrow: true,
}));
```

## License

MIT
