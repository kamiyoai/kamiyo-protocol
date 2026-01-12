# TETSUO SDK

Zero-knowledge reputation proofs for AI agents. Prove tier membership without revealing actual scores.

## Installation

```bash
npm install @kamiyo/tetsuo
```

## Quick Start

```typescript
import { TetsuoProver, getTierThreshold, getQualifyingTier } from '@kamiyo/tetsuo';

const prover = new TetsuoProver();

// Generate commitment (do this once, store the secret)
const score = 85;
const commitment = await prover.generateCommitment(score);
// commitment.value - public, register on-chain
// commitment.secret - private, keep safe

// Generate proof for Gold tier (threshold 75)
const proof = await prover.generateProof({
  score,
  secret: commitment.secret,
  threshold: 75,
});

// Verify locally
const result = await prover.verifyProof(proof);
console.log(result.valid); // true
```

## API Reference

### TetsuoProver

Main class for proof generation and verification.

#### Constructor

```typescript
const prover = new TetsuoProver(config?: ProverConfig);
```

| Option | Type | Description |
|--------|------|-------------|
| `wasmPath` | `string` | Path to circuit WASM file |
| `zkeyPath` | `string` | Path to proving key |
| `vkeyPath` | `string` | Path to verification key |

If no paths provided, uses bundled artifacts.

#### Static Methods

```typescript
TetsuoProver.isAvailable(): boolean
```
Check if bundled circuit artifacts are available.

#### Instance Methods

##### generateCommitment

```typescript
async generateCommitment(score: number, secret?: bigint): Promise<Commitment>
```

Generate a Poseidon commitment for a score.

| Parameter | Type | Description |
|-----------|------|-------------|
| `score` | `number` | Reputation score (0-100) |
| `secret` | `bigint` | Optional secret (random if omitted) |

Returns:
```typescript
interface Commitment {
  value: bigint;   // Public commitment hash
  secret: bigint;  // Private secret (store securely)
}
```

##### generateProof

```typescript
async generateProof(input: ProofInput): Promise<GeneratedProof>
```

Generate a Groth16 proof that `score >= threshold`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input.score` | `number` | Actual score (0-100) |
| `input.secret` | `bigint` | Secret from commitment |
| `input.threshold` | `number` | Minimum score to prove |

Returns:
```typescript
interface GeneratedProof {
  commitment: string;           // Hex commitment
  a: [bigint, bigint];          // G1 point
  b: [[bigint, bigint], [bigint, bigint]];  // G2 point
  c: [bigint, bigint];          // G1 point
  publicInputs: bigint[];       // [threshold, commitment]
}
```

Throws if `score < threshold`.

##### verifyProof

```typescript
async verifyProof(proof: GeneratedProof): Promise<VerificationResult>
```

Verify a proof locally using snarkjs.

Returns:
```typescript
interface VerificationResult {
  valid: boolean;
  error?: string;
}
```

### Helper Functions

```typescript
// Get threshold for a tier level
getTierThreshold(tier: TierLevel): number

// Get highest qualifying tier for a score
getQualifyingTier(score: number): TierLevel

// Check if score qualifies for tier
qualifiesForTier(score: number, tier: TierLevel): boolean
```

### Tier System

| Level | Name | Threshold |
|-------|------|-----------|
| 0 | Default | 0 |
| 1 | Bronze | 25 |
| 2 | Silver | 50 |
| 3 | Gold | 75 |
| 4 | Platinum | 90 |

## On-Chain Verification

The generated proof can be submitted to the `ZKReputation` contract:

```solidity
function verifyTier(
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    uint256 threshold
) external;
```

### Contract Addresses

| Network | ZKReputation |
|---------|--------------|
| Sepolia | `0x0feb48737d7f47AF432a094E69e716c9E8fA8A22` |

### Example: Submit to Sepolia

```typescript
import { ethers } from 'ethers';
import { TetsuoProver } from '@kamiyo/tetsuo';

const prover = new TetsuoProver();
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const contract = new ethers.Contract(
  '0x0feb48737d7f47AF432a094E69e716c9E8fA8A22',
  ['function register(uint256)', 'function verifyTier(uint256[2],uint256[2][2],uint256[2],uint256)'],
  wallet
);

// Register commitment
const commitment = await prover.generateCommitment(85);
await contract.register(commitment.value);

// Generate and submit proof
const proof = await prover.generateProof({ score: 85, secret: commitment.secret, threshold: 75 });
await contract.verifyTier(proof.a, proof.b, proof.c, 75);
```

## Circuit Details

- **Curve**: BN254 (alt_bn128)
- **Proof System**: Groth16
- **Hash Function**: Poseidon
- **Public Inputs**: `[threshold, commitment]`
- **Private Inputs**: `[score, secret]`

Constraints:
1. `score >= threshold`
2. `commitment == Poseidon(score, secret)`

## Security Considerations

1. **Keep secrets safe**: The `secret` from `generateCommitment` must never be exposed. Anyone with the secret can generate proofs for that commitment.

2. **One commitment per agent**: Each agent should use a single commitment. Changing scores requires a new commitment and re-registration.

3. **Proof replay**: Proofs are bound to a specific commitment. The same proof cannot be used for different agents.

4. **Trusted setup**: The proving key was generated using a trusted setup ceremony. The toxic waste was discarded.

## License

BUSL-1.1
