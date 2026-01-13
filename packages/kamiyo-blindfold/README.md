# @kamiyo/blindfold

Blindfold Finance integration for KAMIYO. Routes escrow releases to privacy cards.

## Install

```bash
npm install @kamiyo/blindfold
```

## Usage

### Payment Flow

```typescript
import { BlindfoldClient } from '@kamiyo/blindfold';

const client = new BlindfoldClient();

const payment = await client.createPayment({
  amount: 50,
  currency: 'SOL',
  recipientEmail: 'user@example.com',
  useZkProof: true,
});

const holding = await client.createHoldingWallet(
  payment.paymentId,
  '50000000000',
  'So11111111111111111111111111111111111111112'
);

// Transfer funds to holding.holdingWalletAddress, then:
await client.autoSplitAndExchange(payment.paymentId);
```

### Escrow Hook

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { EscrowToBlindoldHook, NATIVE_SOL_MINT } from '@kamiyo/blindfold';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const hook = new EscrowToBlindoldHook(connection);

const result = await hook.onEscrowRelease(
  {
    escrowId: 'escrow-123',
    recipient: providerPublicKey,
    amount: new BN(0.5 * 1e9),
    tokenMint: NATIVE_SOL_MINT,
    metadata: {
      blindfoldCard: true,
      recipientEmail: 'provider@example.com',
      requestedTier: 'premium',
    },
  },
  payerKeypair
);
```

### Reputation-Gated Payments

```typescript
const payment = await client.createPayment({
  amount: 1000,
  currency: 'SOL',
  recipientEmail: 'provider@example.com',
  useZkProof: true,
  agentPk: agent.publicKey.toBase58(),
  reputationCommitment: commitment.toString(),
  reputationProof: Buffer.from(proofBytes).toString('base64'),
  requestedTier: 'premium',
});

const tier = client.getTierForThreshold(85);  // 'premium'
const limit = client.getLimitForTier(tier);   // 2000
```

### PDA Derivation

```typescript
import { derivePoolPDA, deriveUserBalancePDA, deriveProofPDA } from '@kamiyo/blindfold';

const [poolPDA] = derivePoolPDA('So11111111111111111111111111111111111111112');
const [balancePDA] = deriveUserBalancePDA(walletAddress, tokenMint);
const [proofPDA] = deriveProofPDA(nonce);
```

## Card Tiers

| Tier | Reputation | Limit |
|------|------------|-------|
| basic | any | $100 |
| standard | 70%+ | $500 |
| premium | 85%+ | $2,000 |
| elite | 95%+ | $10,000 |

## Environment

```bash
BLINDFOLD_API_URL=https://blindfoldfinance.com
BLINDFOLD_API_KEY=your_api_key
```

## License

MIT
