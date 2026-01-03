# Mitama Protocol Integration Guide

## Overview

Mitama Protocol provides trustless payment escrows for AI agent-to-API transactions on Solana. This guide covers integrating Mitama into your AI agent framework or API service.

**Program ID (Mainnet):** `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM`

## Quick Start

### For AI Agent Developers

```bash
npm install @mitama/sdk @solana/web3.js
```

```typescript
import { MitamaClient } from '@mitama/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* your agent keypair */);

const client = new MitamaClient({
  connection,
  wallet: {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => { tx.sign(wallet); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(wallet)); return txs; },
  }
});

// Create escrow before calling API
const signature = await client.createAgreement({
  provider: apiProviderPubkey,
  amount: 0.01 * 1e9, // 0.01 SOL in lamports
  timeLockSeconds: 3600,
  transactionId: `tx-${Date.now()}`,
});
```

### For API Providers

```bash
npm install @mitama/middleware express
```

```typescript
import express from 'express';
import { createMitamaMiddleware } from '@mitama/middleware';
import { PublicKey } from '@solana/web3.js';

const app = express();

app.use('/api', createMitamaMiddleware({
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  providerWallet: new PublicKey('YOUR_WALLET_ADDRESS'),
  priceInLamports: 10_000_000, // 0.01 SOL
  rateLimit: 100,
  rateLimitWindow: 60000,
}));

app.post('/api/data', (req, res) => {
  // Request already validated - escrow exists and is sufficient
  res.json({ data: 'protected response' });
});
```

## Package Reference

| Package | Description | Install |
|---------|-------------|---------|
| `@mitama/sdk` | Core SDK for escrow operations | `npm i @mitama/sdk` |
| `@mitama/middleware` | Express middleware for API protection | `npm i @mitama/middleware` |
| `@mitama/actions` | Standalone action functions | `npm i @mitama/actions` |
| `@mitama/langchain` | LangChain tool integration | `npm i @mitama/langchain` |

## Core Concepts

### Escrow Lifecycle

```
[Agent] --> initializeEscrow --> [ACTIVE]
                                    |
                    +---------------+---------------+
                    |               |               |
               releaseFunds    markDisputed    claimExpired
                    |               |               |
                [RELEASED]     [DISPUTED]      [EXPIRED]
                                    |
                            oracleResolution
                                    |
                              [RESOLVED]
```

### Escrow States

| State | Description | Next Actions |
|-------|-------------|--------------|
| `active` | Funds locked, awaiting service | `releaseFunds`, `markDisputed` |
| `released` | Funds sent to provider | Terminal |
| `disputed` | Awaiting oracle resolution | Oracle submission |
| `resolved` | Oracle determined split | Terminal |
| `expired` | Time lock passed | `claimExpired` |

## SDK Methods

### MitamaClient

```typescript
// Create escrow
await client.createAgreement({
  provider: PublicKey,
  amount: number,        // lamports
  timeLockSeconds: number,
  transactionId: string,
  tokenMint?: PublicKey, // Optional SPL token
});

// Release funds (agent satisfied)
await client.releaseFunds(transactionId, providerPubkey);

// Mark disputed (agent unsatisfied)
await client.markDisputed(transactionId);

// Get agreement status
const agreement = await client.getAgreement(agreementPDA);
```

### Middleware Options

```typescript
interface MitamaMiddlewareOptions {
  rpcUrl: string;
  providerWallet: PublicKey;
  priceInLamports: number;
  rateLimit?: number;        // requests per window (default: 100)
  rateLimitWindow?: number;  // ms (default: 60000)
}
```

## LangChain Integration

```typescript
import { createMitamaTools } from '@mitama/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

const tools = createMitamaTools({
  connection,
  wallet,
});

// Available tools:
// - mitama_create_agreement
// - mitama_release_funds
// - mitama_dispute_agreement
// - mitama_get_agreement_status
// - mitama_get_balance
```

## SPL Token Support

Mitama supports USDC and other SPL tokens:

```typescript
import { USDC_MINT } from '@mitama/sdk';

await client.createAgreement({
  provider: apiProvider,
  amount: 1_000_000, // 1 USDC (6 decimals)
  timeLockSeconds: 3600,
  transactionId: 'tx-123',
  tokenMint: USDC_MINT,
});
```

## Oracle Dispute Resolution

When an escrow is disputed, registered oracles evaluate service quality:

1. Agent calls `markDisputed()`
2. Oracles submit quality scores (0-100)
3. Protocol calculates weighted average
4. Funds split based on quality score

### Multi-Oracle Consensus

- Minimum 2 oracles required for resolution
- Maximum 15-point score deviation allowed
- Weighted voting based on oracle stake

## Error Handling

```typescript
import { MitamaError } from '@mitama/sdk';

try {
  await client.createAgreement(params);
} catch (error) {
  if (error instanceof MitamaError) {
    switch (error.code) {
      case 'InsufficientFunds':
        // Handle insufficient balance
        break;
      case 'InvalidStatus':
        // Escrow in wrong state
        break;
      case 'Unauthorized':
        // Wrong signer
        break;
    }
  }
}
```

## Security Considerations

1. **Never expose private keys** - Use environment variables or secure key management
2. **Validate escrow status** - Check `agreement.status` before proceeding
3. **Use appropriate time locks** - Minimum 1 hour recommended
4. **Monitor for disputes** - Set up alerts for disputed escrows

## Environment Variables

```bash
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional
MITAMA_PROGRAM_ID=8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
```

## Testing

Run integration tests on devnet:

```bash
# Use devnet
export SOLANA_RPC_URL=https://api.devnet.solana.com

# Run tests
cd packages/mitama-sdk
npm test
```

## Monitoring

Start the protocol monitor:

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/xxx \
npx ts-node scripts/monitor.ts
```

## Support

- GitHub Issues: https://github.com/mitama-labs/mitama/issues
- Documentation: https://docs.mitama.io
