# @kamiyo/tars-adapter

TARS (Trustless Agent & Reputation Standard) adapter for KAMIYO protocol. Provides bidirectional integration between KAMIYO's dispute resolution system and Amiko's TARS reputation protocol.

## Features

- **Reputation Bridge**: Sync reputation between KAMIYO (0-100 scale) and TARS (1-5 stars)
- **Job-Escrow Linking**: Link TARS jobs to KAMIYO escrows for unified tracking
- **Auto-Feedback**: Automatically submit TARS feedback when KAMIYO disputes resolve
- **Unified Middleware**: Combined x402 payment middleware supporting both protocols
- **Combined Facilitator**: Single facilitator service for TARS + KAMIYO payments

## Installation

```bash
pnpm add @kamiyo/tars-adapter
```

## Usage

### Reputation Conversion

```typescript
import {
  tarsToKamiyoReputation,
  kamiyoToTarsRating,
  aggregateCombinedReputation,
} from '@kamiyo/tars-adapter';

// TARS 4.5 stars -> KAMIYO 88 reputation
const kamiyoRep = tarsToKamiyoReputation(4.5);

// KAMIYO quality 85 -> TARS 5 stars
const tarsRating = kamiyoToTarsRating(85);

// Combined reputation (70% KAMIYO, 30% TARS)
const combined = aggregateCombinedReputation(80, 60);
```

### TarsBridge

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createTarsBridge } from '@kamiyo/tars-adapter';

const connection = new Connection('https://api.devnet.solana.com');
const bridge = createTarsBridge({
  connection,
  config: {
    mode: 'unified',
    autoSubmitFeedback: true,
  },
});

// Get combined reputation
const reputation = await bridge.getCombinedReputation(agentWallet);

// Submit feedback from dispute outcome
await bridge.submitFeedbackFromDispute(
  escrowPda,
  qualityScore, // 0-100
  clientKeypair,
);
```

### Unified Middleware

```typescript
import express from 'express';
import { kamiyoTarsMiddleware } from '@kamiyo/tars-adapter';

const app = express();

app.use(
  '/api/paid',
  kamiyoTarsMiddleware({
    payTo: 'AgentWalletAddress',
    tarsEnabled: true,
    kamiyoEscrowEnabled: true,
    minReputation: 50,
    price: '$0.01',
    network: 'solana-devnet',
  }),
);
```

### UnifiedFacilitator

```typescript
import { createUnifiedFacilitator } from '@kamiyo/tars-adapter';

const facilitator = createUnifiedFacilitator({
  connection,
  payer: payerKeypair,
});

// Prepare transaction with TARS job registration
const { transaction, tarsJobPda } = await facilitator.prepare({
  paymentRequirements,
  walletAddress: clientWallet,
  enableTrustless: true,
});

// Settle payment
const result = await facilitator.settle(request);
console.log('TARS Job ID:', result.tarsJobId);
```

## Configuration

```typescript
interface TarsAdapterConfig {
  tarsProgramId?: PublicKey;
  mode: 'tars-only' | 'kamiyo-only' | 'unified';
  syncReputation: boolean;
  reputationWeight: {
    kamiyo: number; // default: 0.7
    tars: number; // default: 0.3
  };
  autoSubmitFeedback: boolean;
  feedbackDelay: number;
  linkJobsToEscrows: boolean;
}
```

## Reputation Mapping

### TARS -> KAMIYO

| TARS Rating | KAMIYO Score |
| ----------- | ------------ |
| 1 star      | 0            |
| 2 stars     | 25           |
| 3 stars     | 50           |
| 4 stars     | 75           |
| 5 stars     | 100          |

### KAMIYO -> TARS

| Quality Score | TARS Rating |
| ------------- | ----------- |
| 80-100        | 5 stars     |
| 65-79         | 4 stars     |
| 50-64         | 3 stars     |
| 25-49         | 2 stars     |
| 0-24          | 1 star      |

## Program IDs

- **TARS**: `GPd4z3N25UfjrkgfgSxsjoyG7gwYF8Fo7Emvp9TKsDeW`
- **KAMIYO**: `3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr`

## License

MIT
