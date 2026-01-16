# @kamiyo/kamiyo-mitama-merkle

Poseidon Merkle tree implementation for ZK membership proofs on the BN254 curve.

## Installation

```bash
pnpm add @kamiyo/kamiyo-mitama-merkle
```

## Usage

```typescript
import {
  createMerkleTree,
  PoseidonMerkleTree,
  MerkleProof,
  bigintToBytes32,
  bytes32ToBigint,
} from '@kamiyo/kamiyo-mitama-merkle';

// Create a new tree (depth 20, ~1M leaves)
const tree = await createMerkleTree();

// Insert commitments
const commitment = 123456789n;
const index = tree.insert(commitment);

// Get current root
const root = tree.getRoot();

// Generate membership proof
const proof: MerkleProof = tree.getProof(index);
// proof.path: bigint[] - sibling hashes at each level
// proof.indices: number[] - 0 = left, 1 = right

// Check membership
const exists = tree.contains(commitment);

// Get proof by commitment value
const proofByValue = tree.getProofByCommitment(commitment);
```

## API

### `createMerkleTree(): Promise<PoseidonMerkleTree>`

Creates and initializes a new Poseidon Merkle tree with depth 20.

### `PoseidonMerkleTree`

| Method | Returns | Description |
|--------|---------|-------------|
| `insert(commitment: bigint)` | `number` | Insert leaf, returns index |
| `getRoot()` | `bigint` | Current Merkle root |
| `getProof(index: number)` | `MerkleProof` | Generate membership proof |
| `getProofByCommitment(commitment: bigint)` | `MerkleProof` | Get proof by value |
| `contains(commitment: bigint)` | `boolean` | Check if leaf exists |
| `size` | `number` | Number of leaves |
| `getLeaves()` | `bigint[]` | All leaf values |

### `MerkleProof`

```typescript
interface MerkleProof {
  path: bigint[];    // Sibling hashes (length 20)
  indices: number[]; // Path direction (0=left, 1=right)
}
```

### Utilities

```typescript
// Convert bigint to 32-byte array (big-endian)
bigintToBytes32(n: bigint): Uint8Array

// Convert 32-byte array to bigint
bytes32ToBigint(bytes: Uint8Array): bigint
```

## Technical Details

- Hash function: Poseidon (circuit-efficient, collision-resistant)
- Curve: BN254 (alt_bn128)
- Tree depth: 20 levels (~1,048,576 max leaves)
- Zero value: 0n (used for empty siblings)

## License

MIT
