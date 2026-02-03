# @kamiyo/eigenai

Escrow-protected AI inference on Solana. Pay only for quality responses.

## Installation

```bash
npm install @kamiyo/eigenai
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createKamiyoEigenAI, PROGRAM_IDS } from '@kamiyo/eigenai';

const client = createKamiyoEigenAI({
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  wallet: Keypair.fromSecretKey(/* your key */),
  programId: PROGRAM_IDS.MAINNET,
  eigenAiAuth: { type: 'apiKey', apiKey: 'your-eigenai-key' },
});

// Inference with escrow protection
const result = await client.inferenceWithEscrow(
  {
    model: 'gpt-oss-120b-f16',
    messages: [{ role: 'user', content: 'Hello' }],
    escrowAmount: 0.01,
  },
  userTokenAccount,
  treasury
);

if (result.success) {
  console.log(result.response);
  console.log(result.attestation);
}
```

## How It Works

1. **Create Escrow** - Lock SOL before the AI call
2. **Get Response** - EigenAI returns response + cryptographic attestation
3. **Settle** - Release funds if satisfied, or dispute with proof

## Authentication

### API Key

```typescript
eigenAiAuth: { type: 'apiKey', apiKey: 'your-key' }
```

### Wallet Grant (EigenArcade)

```typescript
eigenAiAuth: {
  type: 'grant',
  privateKey: new Uint8Array(32), // ETH private key
  walletAddress: '0x...',
}
```

## API

### `inferenceWithEscrow(params, userTokenAccount, treasury)`

Full escrow-protected inference flow.

```typescript
const result = await client.inferenceWithEscrow(
  {
    model: 'gpt-oss-120b-f16',
    messages: [{ role: 'user', content: 'Explain quantum computing' }],
    escrowAmount: 0.01,        // SOL to lock
    qualityThreshold: 70,      // Auto-release if 0
    temperature: 0.7,
    maxTokens: 4096,
    timeoutMs: 60000,
  },
  userTokenAccount,
  treasury
);
```

### `releaseEscrow(escrowId, rating)`

Manually release escrow with a rating (1-5).

```typescript
await client.releaseEscrow(escrowId, 5);
```

### `disputeWithAttestation(escrowId)`

Dispute a response using the stored attestation.

```typescript
await client.disputeWithAttestation(escrowId);
```

### `getDisputeEvidence(escrowId)`

Get evidence for dispute resolution.

```typescript
const evidence = client.getDisputeEvidence(escrowId);
// { attestation, prompt, output }
```

### `callEigenAI(params)`

Direct EigenAI call without escrow.

```typescript
const response = await client.callEigenAI({
  model: 'gpt-oss-120b-f16',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Quality Tiers

| Score | Tier | Refund |
|-------|------|--------|
| 80-100 | Excellent | 0% |
| 65-79 | Good | 35% |
| 50-64 | Poor | 75% |
| 0-49 | Failed | 100% |

## Configuration

```typescript
createKamiyoEigenAI({
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  eigenAiAuth: EigenAIAuthConfig,
  eigenAiBaseUrl?: string,          // Default: EigenCloud mainnet
  defaultEscrowAmount?: number,     // Default: 0.01 SOL
  defaultQualityThreshold?: number, // Default: 70
  defaultTimeLockSeconds?: number,  // Default: 3600
  defaultTimeoutMs?: number,        // Default: 60000
  debug?: boolean,
});
```

## Constants

```typescript
import { PROGRAM_IDS, KAMIYO_MINT, LIMITS } from '@kamiyo/eigenai';

PROGRAM_IDS.MAINNET  // FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u
PROGRAM_IDS.DEVNET   // EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT
KAMIYO_MINT          // Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

LIMITS.MIN_ESCROW_SOL        // 0.001
LIMITS.MAX_ESCROW_SOL        // 100
LIMITS.MAX_MESSAGES          // 100
LIMITS.MAX_MESSAGE_LENGTH    // 100000
LIMITS.SESSION_ID_LENGTH     // 32
```

## Models

- `gpt-oss-120b-f16` - OSS GPT 120B (default)
- `qwen3-32b-128k-bf16` - Qwen3 32B 128K context

## License

MIT
