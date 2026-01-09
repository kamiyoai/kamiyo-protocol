# ZK Primitives

SDK for privacy-preserving reputation proofs, blacklist exclusion, and private voting.

## Shield

Agent credentials with ZK reputation proofs and blacklist exclusion.

### Basic Usage

```typescript
import { Shield } from '@kamiyo/sdk';
import { PublicKey } from '@solana/web3.js';

const agentPubkey = new PublicKey('...');
const shield = new Shield(agentPubkey);

// Set reputation data
shield.setRep({
  successful: 95,
  total: 100,
  disputesWon: 2,
  disputesLost: 1,
});

// Check threshold without revealing exact score
shield.meetsThreshold(80);  // true
shield.successRate();       // 95

// Generate commitment (hides actual stats)
const commitment = shield.commitment();
// 0x1a2b3c... (Poseidon2 hash of stats + blinding)
```

### Credential Issuance

```typescript
// Issue time-limited credential
const blacklistRoot = Shield.emptySmtRoot();
const credential = shield.issue(blacklistRoot, 86400); // 24h TTL

// Credential contains:
// - agentPk: agent's public key (field element)
// - repCommitment: Poseidon2 hash of reputation stats
// - blacklistRoot: current SMT root
// - issuedAt / expiresAt: validity window

// Verify credential
shield.valid();  // true if not expired
```

### Blacklist Exclusion Proofs

Prove an agent is NOT on the blacklist without revealing the full list.

```typescript
// Generate exclusion proof (agent not in SMT)
const siblings = Shield.emptySmtSiblings();  // 256-level tree
const exclusionProof = Shield.exclusionProof(
  blacklistRoot,
  agentPkField,
  siblings
);

// Proof contains:
// - root: SMT root hash
// - key: agent's public key
// - siblings: merkle path (256 siblings)
```

### ZK Proof Generation

```typescript
// Prepare prover inputs for Noir circuit
const proof = shield.prove(80);  // threshold = 80%

// Returns:
// {
//   reputation: {
//     commitment: 0x...,
//     threshold: 80,
//     meets: true,
//     proverInput: {
//       successful: 95,
//       total: 100,
//       disputesWon: 2,
//       disputesLost: 1,
//       blinding: 0x...,
//       agentPk: 0x...,
//       threshold: 80,
//     }
//   },
//   exclusion: null  // or SmtProof if provided
// }
```

### Fetch from Chain

```typescript
const shield = await Shield.fetch(connection, agentPubkey, programId);
// Automatically loads reputation from on-chain PDA
```

## Private Reputation

Prove reputation meets threshold without revealing exact score.

```typescript
import { PrivateReputation, verifyOnChain } from '@kamiyo/sdk';

const rep = new PrivateReputation(agentPubkey);

rep.setStats({
  successfulAgreements: 95,
  totalAgreements: 100,
  disputesWon: 2,
  disputesLost: 1,
});

// Prepare threshold proof
const result = rep.prepareProof(80);
// {
//   meets: true,
//   commitment: 0x...,
//   publicInputs: { agentPk, commitment, threshold }
// }

// Get prover inputs for Noir circuit
const proverInput = rep.getProverInput(80);
// Pass to Noir prover to generate ZK proof
```

### On-Chain Verification

```typescript
// After generating proof with Noir
const proofBytes = await generateNoirProof(proverInput);

const valid = await verifyOnChain(
  connection,
  verifierProgramId,
  proofBytes,
  result.publicInputs
);
```

## Private Voting

Commit-reveal voting with ZK proofs. Used for oracle dispute resolution.

```typescript
import { Voting, serializeVote, voteInstruction } from '@kamiyo/sdk';

const voting = new Voting();

// Create proposal
const proposalId = BigInt('0x123...');
const proposal = voting.create(
  proposalId,
  ['approve', 'reject'],
  300,  // 5 min commit phase
  300   // 5 min reveal phase
);

// Vote (generates commitment)
const { vote, commitment } = voting.vote(proposalId, 0, oraclePubkey);
// vote.choice = 0 (approve)
// commitment = Poseidon2(choice, blinding, proposal, voter)

// Commit on-chain
voting.commit(proposalId, voterField, commitment);

// After commit phase ends, reveal
voting.reveal(proposalId, vote);

// Tally results
const result = voting.tally(proposalId);
// { counts: [3, 2], winner: 0, total: 5 }
```

### On-Chain Instructions

```typescript
// Build commit instruction
const ix = voteInstruction(programId, proposalPDA, voterPubkey, commitment);
```

### Aggregate Proofs

For batching multiple votes:

```typescript
const proverInput = voting.proverInput(proposalId);
// {
//   scores: [85, 90, 75, ...],
//   blindings: [0x..., 0x..., ...],
//   voters: [0x..., 0x..., ...],
//   numVotes: 5,
//   proposalId: 0x...,
//   root: 0x...,  // Merkle root of commitments
//   sum: 425
// }
```

## Cryptographic Primitives

### Poseidon2 Hash

```typescript
import { poseidon2Hash, generateBlinding } from '@kamiyo/sdk';

const hash = poseidon2Hash([field1, field2, field3]);
const blinding = generateBlinding();  // Random 254-bit field element
```

### Field Conversions

```typescript
import { bytesToField, fieldToBytes } from '@kamiyo/sdk';

// PublicKey → field element
const field = bytesToField(pubkey.toBytes());

// field element → 32 bytes
const bytes = fieldToBytes(field);
```

## Circuit Integration

The SDK prepares inputs for these Noir circuits:

| Circuit | SDK Class | Prover Input Method |
|---------|-----------|---------------------|
| `reputation-proof` | `Shield`, `PrivateReputation` | `proverInput(threshold)` |
| `smt-exclusion` | `Shield` | `exclusionProof()` |
| `oracle-vote` | `Voting` | `vote()` returns commitment |
| `aggregate-vote` | `Voting` | `proverInput(proposalId)` |

### Workflow

1. Use SDK to prepare prover inputs
2. Pass inputs to Noir prover (off-chain)
3. Get proof bytes back
4. Submit to on-chain verifier

```typescript
// 1. Prepare inputs
const shield = new Shield(agentPubkey);
shield.setRep(stats);
const { proverInput } = shield.prove(80).reputation;

// 2. Generate proof (off-chain, via Noir)
const proof = await noirProver.prove(proverInput);

// 3. Verify on-chain
await verifier.submitProof(proof, publicInputs);
```

## Security Notes

- Blinding factors are generated fresh each time (not reusable)
- Commitments are binding (can't change input after committing)
- SMT proofs require 256 siblings (sparse merkle tree)
- Poseidon2 is algebraic (ZK-friendly, ~8x faster than SHA256 in circuits)
- All field elements are BN254 scalars (254 bits)
