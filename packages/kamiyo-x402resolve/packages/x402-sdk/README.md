# @kamiyo/x402-sdk

TypeScript SDK for x402Resolve - Automated AI agent payment and dispute resolution on Solana.

## Installation

```bash
npm install @kamiyo/x402-sdk
```

## Quick Start

```typescript
import { KamiyoClient } from '@kamiyo/x402-sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');
const client = new KamiyoClient({
  apiUrl: 'https://api.example.com',
  chain: 'solana',
  rpcUrl: 'https://api.devnet.solana.com',
  walletPublicKey: wallet.publicKey,
  enablex402Resolve: true
});

// Pay for API access with escrow
const accessToken = await client.pay({
  amount: 0.001,
  recipient: apiProviderPubkey,
  enableEscrow: true
});

// File dispute if quality is poor
await client.fileDispute({
  transactionId: 'tx_123',
  reason: 'Low quality response',
  originalQuery: 'data request',
  dataReceived: { incomplete: true },
  expectedCriteria: ['complete_data', 'valid_format']
});
```

## Features

- **Escrow Management**: Create and manage payment escrows
- **Dispute Resolution**: File and resolve disputes with oracle verification
- **Reputation Tracking**: Track entity reputation and dispute history
- **Rate Limiting**: Built-in rate limit handling with verification tiers
- **Retry Logic**: Automatic retry with exponential backoff

## API Reference

See [docs](https://github.com/kamiyo-ai/x402resolve/tree/main/docs) for full API reference.

## License

MIT | KAMIYO
