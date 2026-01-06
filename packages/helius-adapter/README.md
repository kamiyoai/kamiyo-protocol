# @kamiyo/helius-adapter

Production-ready Helius RPC adapter for KAMIYO Protocol. Provides connection pooling, rate limiting, priority fee estimation, transaction parsing, and real-time webhook handling.

## Installation

```bash
npm install @kamiyo/helius-adapter @solana/web3.js
```

## Features

- **Connection Pooling** - Automatic failover with health checks
- **Rate Limiting** - Token bucket algorithm prevents API throttling
- **Priority Fees** - Helius-powered fee estimation with strategy selection
- **Transaction Parsing** - Parse escrow transactions from Helius Enhanced API
- **Webhooks** - Real-time event handling with signature verification
- **TypeScript** - Full type definitions for all operations

## Quick Start

```typescript
import { KamiyoHeliusClient } from '@kamiyo/helius-adapter';

const client = new KamiyoHeliusClient({
    apiKey: process.env.HELIUS_API_KEY,
    cluster: 'mainnet-beta'
});

await client.init();

// Derive escrow PDA
const { pda } = client.deriveEscrowPDA('transaction-123');

// Get escrow state
const state = await client.getEscrowState(pda);
console.log('Escrow status:', state?.status);
console.log('Quality score:', state?.qualityScore);

// Get priority fee for operation
const fee = await client.getOperationFee('RESOLVE_DISPUTE', pda, 'urgent');
console.log('Priority fee:', fee.priorityFee, 'micro-lamports/CU');
console.log('Total fee:', fee.totalFee, 'lamports');

// Subscribe to escrow changes
const subscription = await client.subscribeToEscrow(pda, {
    onStateChange: (state) => {
        console.log('Escrow updated:', state.status);
    },
    onError: (error) => {
        console.error('Subscription error:', error);
    }
});

// Cleanup
await subscription.unsubscribe();
await client.shutdown();
```

## Configuration

```typescript
interface HeliusConfig {
    apiKey: string;              // Helius API key (required)
    cluster?: 'mainnet-beta' | 'devnet';  // Default: 'mainnet-beta'
    commitment?: Commitment;     // Default: 'confirmed'
    maxRetries?: number;         // Default: 3
    retryDelayMs?: number;       // Default: 1000
    rateLimitRps?: number;       // Default: 25
    enableWebsocket?: boolean;   // Default: true
}
```

## Priority Fee Strategies

| Strategy | Multiplier | Max Fee | Use Case |
|----------|------------|---------|----------|
| economy  | 0.5x       | 10,000  | Non-urgent operations |
| standard | 1.0x       | 50,000  | Default operations |
| fast     | 1.5x       | 100,000 | Time-sensitive |
| urgent   | 2.5x       | 500,000 | Dispute resolution |
| critical | 5.0x       | 1,000,000 | Fund releases |

```typescript
// Get fee for specific strategy
const fee = await client.getOperationFee('RELEASE_FUNDS', escrowPda, 'critical');

// Get all strategy fees
const allFees = await client.feeCalculator.getAllStrategyFees([escrowPda]);
console.log(allFees);
// { economy: 2500, standard: 5000, fast: 7500, urgent: 12500, critical: 25000 }
```

## Webhook Handler

Process escrow events in real-time via Helius webhooks:

```typescript
import { createVerifiedWebhookHandler } from '@kamiyo/helius-adapter/webhooks';

// Express/Next.js handler
const handler = createVerifiedWebhookHandler(
    process.env.WEBHOOK_SECRET,
    {
        onEscrowCreated: async (event) => {
            console.log('Escrow created:', event.escrowPda);
            console.log('Agent:', event.agent);
            console.log('Amount:', event.amount);
        },

        onDisputeInitiated: async (event) => {
            console.log('Dispute initiated:', event.escrowPda);
            // Trigger oracle assessment
            await initiateOracleReview(event.escrowId);
        },

        onDisputeResolved: async (event) => {
            console.log('Quality score:', event.qualityScore);
            console.log('Refund amount:', event.refundAmount);
            // Update agent reputation
            await updateReputation(event.agent, event.qualityScore);
        },

        onFundsReleased: async (event) => {
            console.log('Funds released:', event.amount);
            // Notify parties
            await notifyParties(event);
        },

        onError: (error, payload) => {
            console.error('Webhook error:', error);
        }
    }
);

// Use with Express
app.post('/webhooks/kamiyo', handler);
```

## Transaction Parsing

Parse escrow transactions from Helius Enhanced API:

```typescript
import {
    parseTransaction,
    groupByEscrow,
    calculateEscrowLifecycle
} from '@kamiyo/helius-adapter';

// Fetch enhanced transactions
const txs = await client.fetchEnhancedTransactions([
    'signature1',
    'signature2'
]);

// Parse into structured data
const parsed = txs.map(parseTransaction);

// Group by escrow
const grouped = groupByEscrow(parsed);

// Calculate lifecycle
for (const [pda, transactions] of grouped) {
    const lifecycle = calculateEscrowLifecycle(transactions);
    console.log(`Escrow ${pda}:`);
    console.log(`  Duration: ${lifecycle.duration}s`);
    console.log(`  Was disputed: ${lifecycle.wasDisputed}`);
    console.log(`  Quality score: ${lifecycle.finalQualityScore}`);
}
```

## Protocol Statistics

```typescript
const stats = await client.getProtocolStats(100);

console.log('Total escrows:', stats.totalEscrows);
console.log('Active:', stats.activeEscrows);
console.log('Disputed:', stats.disputedEscrows);
console.log('Resolved:', stats.resolvedEscrows);
console.log('Avg quality:', stats.averageQualityScore);
console.log('Total volume:', stats.totalVolume, 'lamports');
```

## Connection Pool Stats

Monitor connection health:

```typescript
const poolStats = client.getPoolStats();

console.log('Connections:', poolStats.total);
console.log('Healthy:', poolStats.healthy);
console.log('Avg latency:', poolStats.avgLatency, 'ms');

for (const conn of poolStats.connections) {
    console.log(`  ${conn.endpoint}: ${conn.healthy ? 'OK' : 'FAIL'}`);
}
```

## Error Handling

```typescript
import {
    HeliusAdapterError,
    ConnectionError,
    RateLimitError,
    ParseError
} from '@kamiyo/helius-adapter';

try {
    const state = await client.getEscrowState(pda);
} catch (error) {
    if (error instanceof RateLimitError) {
        console.log('Rate limited, waiting...');
        await delay(error.retryAfterMs);
    } else if (error instanceof ConnectionError) {
        console.log('Connection failed:', error.message);
    } else if (error instanceof ParseError) {
        console.log('Parse error:', error.message);
    } else if (error instanceof HeliusAdapterError) {
        console.log('Adapter error:', error.code, error.message);
    }
}
```

## Helius Webhook Setup

1. Go to [Helius Dashboard](https://dev.helius.xyz/webhooks)
2. Create new webhook
3. Set webhook URL to your endpoint
4. Select "Enhanced Transactions" type
5. Add KAMIYO program ID: `E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n`
6. Copy webhook secret for signature verification

## API Reference

### KamiyoHeliusClient

| Method | Description |
|--------|-------------|
| `init()` | Initialize connection pool |
| `getConnection()` | Get current active connection |
| `deriveEscrowPDA(txId)` | Derive escrow PDA from transaction ID |
| `deriveReputationPDA(entity)` | Derive reputation PDA |
| `getEscrowState(pda)` | Fetch escrow account state |
| `getEscrowStates(pdas)` | Batch fetch multiple escrows |
| `getRecentTransactions(filter?)` | Get recent program transactions |
| `getTransaction(signature)` | Get single transaction |
| `getEscrowHistory(txId)` | Get escrow transaction history |
| `getPriorityFee(accounts)` | Get fee estimate |
| `getOperationFee(op, pda, strategy)` | Calculate operation fee |
| `subscribeToEscrow(pda, options)` | Subscribe to state changes |
| `unsubscribeAll()` | Remove all subscriptions |
| `getProtocolStats(sampleSize)` | Get protocol statistics |
| `getPoolStats()` | Get connection pool stats |
| `getRateLimiterStats()` | Get rate limiter stats |
| `shutdown()` | Cleanup and close connections |

## License

MIT
