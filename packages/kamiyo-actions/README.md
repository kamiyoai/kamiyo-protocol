# @kamiyo/actions

Plug-and-play actions for Kamiyo Protocol. Simple, standalone functions for integrating agent payments into any framework.

## Installation

```bash
npm install @kamiyo/actions
```

## Quick Start

```typescript
import { createEscrow, releaseFunds, disputeEscrow } from '@kamiyo/actions';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const keypair = Keypair.fromSecretKey(/* your secret key */);

// 1. Create payment escrow
const escrow = await createEscrow(
  { connection, keypair },
  {
    provider: 'ProviderWalletAddress',
    amount: 0.1,  // SOL
    timeLockSeconds: 86400,  // 24 hours
    transactionId: 'order-123'
  }
);
console.log('Escrow created:', escrow.escrowAddress);

// 2a. Release funds (service delivered)
await releaseFunds(
  { connection, keypair },
  { transactionId: 'order-123', provider: 'ProviderWalletAddress' }
);

// 2b. OR dispute (service not delivered)
await disputeEscrow(
  { connection, keypair },
  { transactionId: 'order-123' }
);
```

## Actions

### createEscrow

Create a payment escrow with a service provider.

```typescript
const result = await createEscrow(config, {
  provider: string,        // Provider wallet address
  amount: number,          // Amount in SOL
  timeLockSeconds: number, // Lock duration
  transactionId: string    // Unique ID
});
// Returns: { signature, escrowAddress, transactionId }
```

### releaseFunds

Release escrowed funds to provider.

```typescript
const result = await releaseFunds(config, {
  transactionId: string,
  provider: string
});
// Returns: { signature, transactionId }
```

### disputeEscrow

Dispute for oracle arbitration.

```typescript
const result = await disputeEscrow(config, {
  transactionId: string
});
// Returns: { signature, transactionId }
```

### getEscrowStatus

Check escrow state.

```typescript
const status = await getEscrowStatus(config, {
  transactionId: string,
  agent?: string  // Optional: check another agent's escrow
});
// Returns: { address, agent, provider, amount, status, createdAt, expiresAt }
```

### getBalance

Get wallet SOL balance.

```typescript
const balance = await getBalance(config);
// Returns: number (SOL)
```

## Integration Examples

### With OpenAI Function Calling

```typescript
const functions = [
  {
    name: 'create_payment',
    description: 'Create a payment escrow with a provider',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        amount: { type: 'number' },
        transactionId: { type: 'string' }
      }
    }
  }
];

// In your function handler:
if (name === 'create_payment') {
  return await createEscrow(config, {
    ...args,
    timeLockSeconds: 86400
  });
}
```

### With AutoGPT / AgentGPT

```typescript
const tools = {
  create_escrow: async (args) => createEscrow(config, args),
  release_funds: async (args) => releaseFunds(config, args),
  dispute: async (args) => disputeEscrow(config, args),
};
```

## License

MIT
