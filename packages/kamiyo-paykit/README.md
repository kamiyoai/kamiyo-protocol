# @kamiyo/paykit

Payment toolkit for autonomous AI agents.

## Why

Autonomous agents need to transact. This package provides:

- **x402 Payments** - Pay for APIs automatically when HTTP 402 is returned
- **Escrow** - Lock funds until work is delivered and verified
- **Quality Assessment** - Auto-check response quality against expectations
- **Disputes** - File disputes when quality is below threshold
- **Reputation** - Check provider trustworthiness before transacting
- **Job Tracking** - Track in-progress jobs with their escrow state

## Install

```bash
npm install @kamiyo/paykit
```

## Quick Start

```typescript
import { createPaykit } from '@kamiyo/paykit';
import { Connection, Keypair } from '@solana/web3.js';

const paykit = createPaykit({
  keypair: Keypair.fromSecretKey(/* your key */),
  connection: new Connection('https://api.mainnet-beta.solana.com'),
});

// Fetch from x402 endpoint - payment handled automatically
const result = await paykit.fetch('https://api.example.com/premium-data', {
  maxPriceUsd: 0.01,
  expectedFields: ['price', 'volume', 'timestamp'],
  minQuality: 80,
});

if (result.success) {
  console.log('Data:', result.data);
  console.log('Paid:', result.paid ? `$${result.payment?.amountUsd}` : 'Free');
  console.log('Quality:', result.quality?.score);
}
```

## Environment Variables

```bash
AGENT_PRIVATE_KEY=<base58>           # Required for createPaykitFromEnv
SOLANA_RPC_URL=https://...           # Defaults to mainnet
KAMIYO_PROGRAM_ID=8sUnNU...          # Defaults to production
MAX_PRICE_USD=1.0                    # Max per-request spend
```

## API

### `createPaykit(config)`

Create a wallet with explicit configuration.

```typescript
const paykit = createPaykit({
  keypair: myKeypair,
  connection: myConnection,
  maxPriceUsd: 0.50,              // Max $0.50 per request
  autoDisputeThreshold: 30,       // Auto-dispute below 30% quality
  defaultTimeLockSeconds: 604800, // 7-day escrow lock
});
```

### `createPaykitFromEnv()`

Create a wallet from environment variables.

```typescript
const paykit = createPaykitFromEnv();
```

### `paykit.fetch(url, options)`

Fetch data from an x402 endpoint with automatic payment.

```typescript
const result = await paykit.fetch('https://api.example.com/data', {
  maxPriceUsd: 0.01,           // Override max price
  expectedFields: ['id', 'name'], // For quality assessment
  minQuality: 70,              // Minimum acceptable quality
  method: 'POST',
  body: { query: 'value' },
  headers: { 'X-Custom': 'header' },
  timeoutMs: 5000,
});
```

### `paykit.createEscrow(options)`

Create an escrow for a job.

```typescript
const result = await paykit.createEscrow({
  amountSol: 0.1,
  jobId: 'job-123',
  timeLockSeconds: 604800, // 7 days
  qualityThreshold: 70,
});

if (result.success) {
  console.log('Escrow:', result.escrowAddress);
}
```

### `paykit.getEscrowStatus(address)`

Check escrow state.

```typescript
const state = await paykit.getEscrowStatus(escrowAddress);
// state.status: 'pending' | 'funded' | 'released' | 'disputed' | 'resolved' | 'expired'
```

### `paykit.fileDispute(options)`

File a dispute for poor quality.

```typescript
const result = await paykit.fileDispute({
  escrowAddress: '...',
  qualityScore: 25,
  evidence: 'Response missing required fields: price, volume',
  requestedRefundPercent: 75,
});
```

### `paykit.getReputation(address)`

Check provider reputation before transacting.

```typescript
const rep = await paykit.getReputation(providerAddress);
// rep.tier: 'trusted' | 'standard' | 'caution' | 'avoid'
// rep.score: 0-1000
// rep.disputeRate: percentage
```

### Job Tracking

```typescript
// Track a job
paykit.trackJob({
  jobId: 'job-123',
  description: 'Build escrow integration',
  requester: 'BuyerWallet...',
  amountSol: 0.1,
  status: 'accepted',
});

// Update status
paykit.updateJob('job-123', { status: 'in_progress' });

// Get active jobs
const jobs = paykit.getActiveJobs();
```

## Integration Examples

### OpenClaw Agent

```typescript
// In your OpenClaw skill
import { createPaykitFromEnv } from '@kamiyo/paykit';

const paykit = createPaykitFromEnv();

export async function handlePremiumDataRequest(query: string) {
  const result = await paykit.fetch(`https://api.premium.com/search?q=${query}`, {
    maxPriceUsd: 0.05,
    expectedFields: ['results', 'total'],
  });

  if (!result.success) {
    return `Failed: ${result.error}`;
  }

  return `Found ${result.data.total} results. Cost: $${result.payment?.amountUsd || 0}`;
}
```

### Moltbook Job Agent

```typescript
import { createPaykit } from '@kamiyo/paykit';

const paykit = createPaykit({ keypair, connection });

// Accept a job
async function acceptJob(job: MoltbookJob) {
  // Create escrow
  const escrow = await paykit.createEscrow({
    amountSol: job.price,
    jobId: job.id,
  });

  if (!escrow.success) {
    return { accepted: false, reason: escrow.error };
  }

  // Track job
  paykit.trackJob({
    jobId: job.id,
    description: job.description,
    requester: job.poster,
    amountSol: job.price,
    escrowAddress: escrow.escrowAddress,
    status: 'accepted',
  });

  return { accepted: true, escrowAddress: escrow.escrowAddress };
}
```

## License

MIT
