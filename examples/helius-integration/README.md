# KAMIYO + Helius Integration

Use Helius Enhanced APIs for faster escrow verification and real-time transaction monitoring.

## Why Helius?

- **Enhanced Transaction API** - Parse escrow transactions without manual log parsing
- **Webhooks** - Real-time notifications on escrow state changes
- **Priority Fees** - Optimal fee estimation for time-sensitive settlements
- **DAS API** - Agent identity metadata from compressed NFTs

## Setup

```bash
npm install @kamiyo/sdk helius-sdk
```

## Quick Start

```typescript
import { KamiyoClient } from '@kamiyo/sdk';
import { Helius } from 'helius-sdk';

const helius = new Helius('your-api-key');
const kamiyo = new KamiyoClient({
  connection: helius.connection,
  wallet: yourWallet
});

// Create escrow with Helius priority fees
const feeEstimate = await helius.rpc.getPriorityFeeEstimate({
  accountKeys: [escrowPda.toBase58()],
  options: { recommended: true }
});

const agreement = await kamiyo.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,
  priorityFee: feeEstimate.priorityFeeEstimate
});
```

## Webhook Integration

Monitor escrow events in real-time:

```typescript
// Configure webhook at https://dev.helius.xyz/webhooks
// Webhook URL: https://your-api.com/webhooks/kamiyo

// Webhook handler
app.post('/webhooks/kamiyo', (req, res) => {
  const { type, events } = req.body;

  for (const event of events) {
    if (event.type === 'KAMIYO_ESCROW') {
      const { escrowId, status, qualityScore } = parseKamiyoEvent(event);

      if (status === 'DISPUTED') {
        // Trigger oracle assessment
        await initiateOracleReview(escrowId);
      }

      if (status === 'RESOLVED') {
        // Update agent reputation
        await updateAgentReputation(event.accounts);
      }
    }
  }

  res.status(200).send('OK');
});
```

## Enhanced Transaction Parsing

```typescript
import { parseKamiyoTransaction } from './parser';

// Fetch transaction with Helius enhanced API
const tx = await helius.rpc.getTransaction(signature, {
  commitment: 'confirmed'
});

// Parse KAMIYO-specific data
const escrowData = parseKamiyoTransaction(tx);
console.log({
  escrowId: escrowData.id,
  amount: escrowData.amount,
  status: escrowData.status,
  qualityScore: escrowData.qualityScore,
  refundAmount: escrowData.refundAmount
});
```

## Files

- `index.ts` - Main client with Helius integration
- `webhooks.ts` - Webhook handler for escrow events
- `parser.ts` - Transaction parsing utilities
- `priority-fees.ts` - Fee estimation helpers

## Environment Variables

```
HELIUS_API_KEY=your-helius-api-key
KAMIYO_PROGRAM_ID=E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n
```

## Links

- [Helius Documentation](https://docs.helius.dev)
- [KAMIYO SDK Documentation](/docs)
- [Webhook Setup Guide](https://docs.helius.dev/webhooks)
