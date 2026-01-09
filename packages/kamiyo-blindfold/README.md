# @kamiyo/blindfold

Blindfold Finance integration for KAMIYO Protocol. Routes escrow payments to privacy cards.

## Installation

```bash
npm install @kamiyo/blindfold
```

## Usage

### Basic Payment

```typescript
import { BlindfoldClient } from '@kamiyo/blindfold';

const client = new BlindfoldClient({
  baseUrl: 'https://blindfoldfinance.com',
});

// Create payment
const payment = await client.createPayment({
  amount: 50,
  currency: 'SOL',
  recipientEmail: 'user@example.com',
  useZkProof: true,
});

// Create holding wallet
const holding = await client.createHoldingWallet(
  payment.paymentId,
  '50000000000', // lamports
  'So11111111111111111111111111111111111111112'
);

// Send funds to holding.holdingWalletAddress
// Then trigger processing
await client.autoSplitAndExchange(payment.paymentId);
```

### Escrow Hook

Connect KAMIYO escrow releases to Blindfold:

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { EscrowToBlindoldHook } from '@kamiyo/blindfold';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const hook = new EscrowToBlindoldHook(connection);

// On escrow release
const result = await hook.onEscrowRelease(
  {
    escrowId: 'escrow-123',
    recipient: providerPublicKey,
    amount: new BN(0.5 * 1e9), // 0.5 SOL
    tokenMint: NATIVE_SOL_MINT,
    metadata: {
      blindfoldCard: true,
      recipientEmail: 'provider@example.com',
      requestedTier: 'premium',
    },
  },
  payerKeypair
);

// result.paymentId - Blindfold payment ID
// result.holdingWalletAddress - Where funds were sent
// result.tier - Card tier based on reputation
```

### Reputation-Gated Payments

```typescript
import { BlindfoldClient, getThresholdForTier } from '@kamiyo/blindfold';

const client = new BlindfoldClient();

// Create payment with reputation proof
const payment = await client.createPayment({
  amount: 1000,
  currency: 'SOL',
  recipientEmail: 'provider@example.com',
  useZkProof: true,
  agentPk: agent.publicKey.toBase58(),
  reputationCommitment: commitment.toString(),
  reputationProof: Buffer.from(proofBytes).toString('base64'),
  requestedTier: 'premium', // requires 85% reputation
});

// Get tier limits
const tier = client.getTierForThreshold(85);  // 'premium'
const limit = client.getLimitForTier(tier);   // 2000
```

### PDA Derivation

```typescript
import { derivePoolPDA, deriveUserBalancePDA, deriveProofPDA } from '@kamiyo/blindfold';

// Pool PDA for SOL
const [poolPDA] = derivePoolPDA('So11111111111111111111111111111111111111112');

// User balance PDA
const [balancePDA] = deriveUserBalancePDA(walletAddress, tokenMint);

// Proof PDA
const [proofPDA] = deriveProofPDA(nonce);
```

## Card Tiers

| Tier | Reputation | Limit |
|------|------------|-------|
| Basic | Any | $100 |
| Standard | 70%+ | $500 |
| Premium | 85%+ | $2,000 |
| Elite | 95%+ | $10,000 |

## Environment Variables

```bash
BLINDFOLD_API_URL=https://blindfoldfinance.com
BLINDFOLD_API_KEY=your_api_key  # optional
```

## API Reference

### BlindfoldClient

- `createPayment(request)` - Create payment request
- `createHoldingWallet(paymentId, amount, tokenMint)` - Create holding wallet
- `checkFunds(paymentId)` - Check if funds arrived
- `autoSplitAndExchange(paymentId)` - Trigger privacy processing
- `getPaymentStatus(paymentId)` - Get payment status
- `getTierForThreshold(threshold)` - Get card tier for reputation
- `getLimitForTier(tier)` - Get limit for card tier

### EscrowToBlindoldHook

- `onEscrowRelease(params, payer, reputationProof?)` - Process escrow release
- `waitForCompletion(paymentId, timeout?)` - Poll for completion
- `triggerProcessing(paymentId)` - Trigger processing after funds arrive

## License

MIT
