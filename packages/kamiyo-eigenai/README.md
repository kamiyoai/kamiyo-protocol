# @kamiyo/eigenai

Escrow-protected AI inference on Solana.

```bash
npm install @kamiyo/eigenai
```

## Usage

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createKamiyoEigenAI, PROGRAM_IDS } from '@kamiyo/eigenai';

const client = createKamiyoEigenAI({
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  wallet: Keypair.fromSecretKey(/* your key */),
  programId: PROGRAM_IDS.MAINNET,
  eigenAiAuth: { type: 'apiKey', apiKey: 'your-eigenai-key' },
});

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
}
```

## Flow

1. Lock SOL in escrow
2. EigenAI returns response + attestation
3. Release funds or dispute

## Auth

```typescript
// API Key
eigenAiAuth: { type: 'apiKey', apiKey: 'key' }

// Wallet Grant
eigenAiAuth: { type: 'grant', privateKey: Uint8Array(32), walletAddress: '0x...' }
```

## API

```typescript
// Escrow-protected inference
client.inferenceWithEscrow(params, userTokenAccount, treasury)

// Release with rating (1-5)
client.releaseEscrow(escrowId, 5)

// Dispute
client.disputeWithAttestation(escrowId)

// Get dispute evidence
client.getDisputeEvidence(escrowId) // { attestation, prompt, output }

// Direct call (no escrow)
client.callEigenAI(params)
```

## Quality Tiers

| Score | Refund |
|-------|--------|
| 80+ | 0% |
| 65-79 | 35% |
| 50-64 | 75% |
| <50 | 100% |

## Config

```typescript
createKamiyoEigenAI({
  connection,
  wallet,
  programId,
  eigenAiAuth,
  defaultEscrowAmount: 0.01,     // SOL
  defaultQualityThreshold: 70,
  defaultTimeoutMs: 60000,
  debug: false,
})
```

## Constants

```typescript
PROGRAM_IDS.MAINNET  // FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u
PROGRAM_IDS.DEVNET   // EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT
KAMIYO_MINT          // Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

LIMITS.MIN_ESCROW_SOL     // 0.001
LIMITS.MAX_ESCROW_SOL     // 100
LIMITS.MAX_MESSAGES       // 100
LIMITS.SESSION_ID_LENGTH  // 32
```

## Models

- `gpt-oss-120b-f16`
- `qwen3-32b-128k-bf16`

## License

MIT
