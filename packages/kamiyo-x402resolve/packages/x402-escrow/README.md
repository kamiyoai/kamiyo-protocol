# x402 Escrow Program

Solana smart contract for automated dispute resolution in AI agent payments.

## Overview

Time-locked PDA escrow with automated refunds based on oracle quality assessment.

## Features

- Time-locked escrow (configurable dispute period)
- Auto-release after time-lock expires
- Instant dispute resolution with proportional refunds
- On-chain Ed25519 signature verification
- Quality-based refund scaling (0-100%)
- PDA accounts (no admin keys)

## Architecture

```
┌─────────────┐
│   Agent A   │ Pays 0.01 SOL
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│   Escrow PDA (On-Chain)     │
│   - Amount: 0.01 SOL        │
│   - Status: Active          │
│   - Expires: 24h            │
│   - Transaction ID          │
└─────────────────────────────┘
       │
       ├─── Happy Path (No Dispute)
       │    └──> Auto-release after 24h → API gets 100%
       │
       └─── Dispute Path
            ├──> Agent disputes
            ├──> Verifier Oracle calculates quality: 65/100
            ├──> Refund: 35% | Payment: 65%
            └──> Split executed on-chain
```

## Instructions

### 1. `initialize_escrow`

Create new escrow account with time-lock.

**Accounts:**
- `escrow` (PDA, init) - Escrow state account
- `agent` (signer, mut) - Agent paying
- `api` - API wallet address
- `system_program` - System program

**Args:**
- `amount: u64` - Amount to escrow (lamports)
- `time_lock: i64` - Duration before auto-release (seconds)
- `transaction_id: String` - Unique transaction ID

**Example:**
```rust
// Escrow 0.01 SOL for 24 hours
initialize_escrow(
    amount: 10_000_000,  // 0.01 SOL
    time_lock: 86400,    // 24 hours
    transaction_id: "tx_abc123"
)
```

### 2. `release_funds`

Release funds to API (happy path).

**Accounts:**
- `escrow` (PDA, mut) - Escrow state account
- `agent` (signer, mut) - Agent wallet
- `api` (mut) - API wallet
- `system_program` - System program

**Auth:**
- Agent can call anytime (explicit release)
- Anyone can call after `expires_at` (auto-release)

### 3. `mark_disputed`

Mark escrow as disputed (agent initiates).

**Accounts:**
- `escrow` (PDA, mut) - Escrow state account
- `agent` (signer) - Agent wallet

**Auth:**
- Only agent can call
- Escrow must be `Active`

### 4. `resolve_dispute`

Resolve dispute with verifier oracle signature.

**Accounts:**
- `escrow` (PDA, mut) - Escrow state account
- `agent` (mut) - Agent wallet (receives refund)
- `api` (mut) - API wallet (receives payment)
- `verifier` - Verifier oracle public key
- `system_program` - System program

**Args:**
- `quality_score: u8` - Quality score from verifier (0-100)
- `refund_percentage: u8` - Refund percentage (0-100)
- `signature: [u8; 64]` - Ed25519 signature from verifier

**Example:**
```rust
// Quality score: 65/100 → Refund: 35%
resolve_dispute(
    quality_score: 65,
    refund_percentage: 35,
    signature: [/* 64 bytes */]
)

// Result:
// - Agent receives: 0.0035 SOL (35%)
// - API receives: 0.0065 SOL (65%)
```

## State

### `Escrow` Account

```rust
pub struct Escrow {
    pub agent: Pubkey,              // Agent wallet
    pub api: Pubkey,                // API wallet
    pub amount: u64,                // Escrowed amount (lamports)
    pub status: EscrowStatus,       // Current status
    pub created_at: i64,            // Creation timestamp
    pub expires_at: i64,            // Auto-release timestamp
    pub transaction_id: String,     // Unique transaction ID
    pub bump: u8,                   // PDA bump seed
    pub quality_score: Option<u8>,  // Quality score (if disputed)
    pub refund_percentage: Option<u8>,  // Refund % (if disputed)
}
```

### `EscrowStatus` Enum

```rust
pub enum EscrowStatus {
    Active,      // Payment locked, awaiting resolution
    Released,    // Funds released to API (happy path)
    Disputed,    // Agent disputed quality
    Resolved,    // Dispute resolved with refund split
}
```

## PDA Seeds

Escrow accounts are PDAs derived from:
```rust
seeds = [b"escrow", transaction_id.as_bytes()]
```

This ensures one escrow per transaction ID and allows deterministic address lookup.

## Security

### Signature Verification

The `resolve_dispute` instruction validates Ed25519 signatures from the x402 Verifier Oracle:

```rust
// Message format: "{transaction_id}:{quality_score}"
let message = format!("{}:{}", escrow.transaction_id, quality_score);

// Verify signature with verifier public key
// (Production: use ed25519_dalek crate)
```

### Authorization

- **Agent** can call `mark_disputed` and `release_funds`
- **Anyone** can call `release_funds` after `expires_at` (auto-release)
- **Only** valid verifier signatures can execute `resolve_dispute`

### Time-Lock

Auto-release prevents indefinite escrow:
- Default: 24 hours
- After expiration: anyone can trigger release
- Agent receives nothing if no dispute filed

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

## Deploy

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
```

## Integration with TypeScript SDK

```typescript
import { KamiyoClient } from '@kamiyo/x402-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const client = new KamiyoClient({
  apiUrl: 'https://api.kamiyo.ai',
  chain: 'solana',
  enablex402Resolve: true,
  walletPublicKey: agentWallet.publicKey,
  rpcUrl: 'https://api.devnet.solana.com'
});

// Payment creates escrow on-chain
const payment = await client.pay({
  amount: 0.01,
  recipient: apiWallet.toBase58(),
  enableEscrow: true
});

// Dispute triggers resolve_dispute instruction
const dispute = await client.fileDispute({
  transactionId: payment.transactionId,
  reason: 'Incomplete data',
  originalQuery: 'Get all Uniswap exploits',
  dataReceived: data,
  expectedCriteria: ['comprehensive', 'verified']
});
```

## Flow Diagram

### Happy Path (No Dispute)

```
Agent → initialize_escrow(0.01 SOL, 24h)
         ↓
      [Escrow PDA]
         ↓
      24 hours pass
         ↓
      release_funds()
         ↓
      API receives 0.01 SOL
```

### Dispute Path

```
Agent → initialize_escrow(0.01 SOL, 24h)
         ↓
      [Escrow PDA]
         ↓
      Agent receives poor data
         ↓
      mark_disputed()
         ↓
      Agent calls x402 Verifier Oracle
         ↓
      Oracle returns: quality=65, refund=35%, signature
         ↓
      resolve_dispute(65, 35, signature)
         ↓
      Split: Agent=0.0035 SOL, API=0.0065 SOL
```

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 6000 | `InvalidStatus` | Escrow status doesn't allow this operation |
| 6001 | `Unauthorized` | Caller not authorized |
| 6002 | `InvalidQualityScore` | Quality score must be 0-100 |
| 6003 | `InvalidRefundPercentage` | Refund % must be 0-100 |
| 6004 | `InvalidSignature` | Verifier signature validation failed |

## Future Enhancements

- [ ] Multi-signature verifiers (3+ oracles vote)
- [ ] Staking mechanism for verifiers
- [ ] Appeal system with escalation
- [ ] SPL Token support (USDC, USDT)
- [ ] Batch dispute resolution
- [ ] On-chain verifier registry

## License

MIT
