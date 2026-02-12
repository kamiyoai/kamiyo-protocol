# @kamiyo/kamiyo-hive

Private reputation proofs for AI agents on Solana.

## Overview

Agents prove reputation thresholds using zero-knowledge proofs without revealing their transaction history or identity. High reputation unlocks private payment rails through ShadowWire and Blindfold.

**Core value**: Trust without identity. Services know an agent is reputable without knowing which agent.

## Installation

```bash
pnpm add @kamiyo/kamiyo-hive
```

## Quick Start

```typescript
import {
  HiveClient,
  ReputationProver,
  generateOwnerSecret,
  generateAgentId,
} from '@kamiyo/kamiyo-hive';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

const client = new HiveClient(provider);
const prover = new ReputationProver('/path/to/circuits/build/hive');
```

## Usage

### 1. Register Agent

```typescript
// Generate identity (keep these secret)
const ownerSecret = generateOwnerSecret();
const agentId = await generateAgentId(wallet.publicKey.toBytes(), 0);
const regSecret = generateOwnerSecret();

// Create commitment (public)
const commitment = await prover.generateIdentityCommitment(
  ownerSecret, agentId, regSecret
);

// Register on-chain with stake
await client.registerAgent(keypair, commitment, new BN(100_000_000));
```

### 2. Build Reputation

Agent completes escrow agreements through KAMIYO Protocol. Each successful completion improves reputation score.

```typescript
// Reputation is computed from on-chain escrow history
const reputation = await client.getAgentReputation(commitment);
// { score: 92, transactionCount: 127, successRate: 0.92 }
```

### 3. Generate Reputation Proof

```typescript
const registry = await client.getRegistry();
const tree = await client.getMerkleTree();
const { proof: merklePath, pathIndices } = await tree.generateProof(commitment);

// Generate ZK proof
const proof = await prover.proveReputationThreshold({
  ownerSecret,
  agentId,
  registrationSecret: regSecret,
  merklePath,
  pathIndices,
  agentsRoot: registry.agentsRoot,
  reputationScore: 92,        // Private - not revealed
  transactionCount: 127,      // Private - not revealed
  minReputation: 85,          // Public threshold
  minTransactions: 50,        // Public threshold
  epoch: registry.epoch,
});

// proof.publicInputs: { minReputation: 85, minTransactions: 50, nullifier: ... }
// proof.proof: Groth16 proof bytes
```

### 4. Verify Proof

```typescript
// Anyone can verify without learning agent identity
const isValid = await client.verifyReputationProof(proof, {
  minReputation: 85,
  minTransactions: 50,
});
// true - agent meets threshold
// Verifier doesn't know: which agent, actual score, transaction history
```

### 5. Unlock Private Payments

```typescript
import { ShadowWireClient } from '@kamiyo/radr';
import { BlindfoldClient } from '@kamiyo/blindfold';

// Option A: ShadowWire private transfer
const shadowWire = new ShadowWireClient();
await shadowWire.privateTransfer({
  amount: 500,
  token: 'USDC',
  recipient: serviceProvider,
  reputationProof: proof,
});

// Option B: Blindfold privacy card
const blindfold = new BlindfoldClient();
const card = await blindfold.requestCard({
  reputationProof: proof,
  requestedTier: 'premium',
});
```

## API Reference

### HiveClient

```typescript
// Registration
registerAgent(payer: Keypair, commitment: bigint, stake: BN): Promise<string>
getRegistry(): Promise<Registry>
getMerkleTree(): Promise<MerkleTree>

// Reputation
getAgentReputation(commitment: bigint): Promise<ReputationData>
updateAgentsRoot(admin: Keypair, newRoot: bigint): Promise<string>

// Verification
verifyReputationProof(proof: Proof, params: ThresholdParams): Promise<boolean>
```

### ReputationProver

```typescript
// Identity
generateIdentityCommitment(ownerSecret, agentId, regSecret): Promise<bigint>

// Proofs
proveReputationThreshold(inputs: ReputationInputs): Promise<Proof>
proveAgentIdentity(inputs: IdentityInputs): Promise<Proof>
```

## Circuits

| Circuit | Purpose | Public Inputs |
|---------|---------|---------------|
| `reputation_threshold` | Prove reputation ≥ threshold | min_rep, min_tx, nullifier |
| `agent_identity` | Prove registry membership | agents_root, nullifier, epoch |

## Payment Tiers

| Reputation | Rail | Daily Limit |
|------------|------|-------------|
| Any | Standard | $100 |
| ≥70% | ShadowWire basic | $500 |
| ≥85% | ShadowWire + Blindfold | $2,000 |
| ≥95% | Elite | $10,000 |

## Security

- **Nullifiers**: Prevent proof replay across epochs
- **Merkle proofs**: O(log n) membership verification
- **Poseidon hash**: Circuit-efficient, collision-resistant
- **Stake requirement**: Economic security for registration
- **Groth16**: Succinct proofs, fast verification

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint
```

## License

MIT
