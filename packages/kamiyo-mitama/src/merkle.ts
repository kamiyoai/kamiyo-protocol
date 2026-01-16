/*
 * Merkle Tree implementation for Agent Collaboration
 *
 * Uses Poseidon hash for circuit compatibility.
 * Fixed depth of 20 supports up to ~1M agents.
 */

import { buildPoseidon, Poseidon } from 'circomlibjs';

const TREE_DEPTH = 20;
const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

let poseidonInstance: Poseidon | null = null;

async function getPoseidon(): Promise<Poseidon> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

async function poseidonHash2(left: bigint, right: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon([left % FIELD_MODULUS, right % FIELD_MODULUS]);
  return poseidon.F.toObject(hash);
}

function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

/**
 * Merkle tree for agent identity commitments.
 * Uses Poseidon hash for ZK circuit compatibility.
 */
export class MerkleTree {
  private depth: number;
  private leaves: bigint[];
  private nodes: Map<string, bigint>; // level:index -> hash
  private zeroHashes: bigint[]; // Zero hashes for empty nodes

  constructor(depth: number = TREE_DEPTH) {
    this.depth = depth;
    this.leaves = [];
    this.nodes = new Map();
    this.zeroHashes = [];
  }

  /**
   * Initialize the tree and compute zero hashes.
   * Must be called before other operations.
   */
  async initialize(): Promise<void> {
    // Compute zero hashes for empty nodes at each level
    this.zeroHashes = new Array(this.depth + 1);
    this.zeroHashes[0] = BigInt(0);

    for (let i = 1; i <= this.depth; i++) {
      this.zeroHashes[i] = await poseidonHash2(
        this.zeroHashes[i - 1],
        this.zeroHashes[i - 1]
      );
    }
  }

  /**
   * Get the current root of the tree.
   */
  async getRoot(): Promise<Uint8Array> {
    if (this.leaves.length === 0) {
      return bigintToBytes32(this.zeroHashes[this.depth]);
    }

    let level = this.leaves.slice();

    for (let d = 0; d < this.depth; d++) {
      const nextLevel: bigint[] = [];

      for (let i = 0; i < Math.ceil(level.length / 2); i++) {
        const left = level[2 * i];
        const right = 2 * i + 1 < level.length ? level[2 * i + 1] : this.zeroHashes[d];
        nextLevel.push(await poseidonHash2(left, right));
      }

      // Pad with zero hashes if needed
      const expectedSize = Math.ceil(Math.pow(2, this.depth - d - 1));
      while (nextLevel.length < expectedSize) {
        nextLevel.push(this.zeroHashes[d + 1]);
      }

      level = nextLevel;
    }

    return bigintToBytes32(level[0]);
  }

  /**
   * Add a leaf (identity commitment) to the tree.
   * Returns the index of the added leaf.
   */
  async addLeaf(commitment: Uint8Array): Promise<number> {
    const index = this.leaves.length;
    if (index >= Math.pow(2, this.depth)) {
      throw new Error('Tree is full');
    }

    this.leaves.push(bytesToBigint(commitment));
    return index;
  }

  /**
   * Generate a Merkle proof for a leaf at the given index.
   * Returns the proof path and indices (0 = left, 1 = right).
   */
  async generateProof(index: number): Promise<{
    proof: Uint8Array[];
    pathIndices: number[];
  }> {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error('Invalid leaf index');
    }

    const proof: Uint8Array[] = [];
    const pathIndices: number[] = [];

    let currentIndex = index;
    let level = this.leaves.slice();

    for (let d = 0; d < this.depth; d++) {
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);

      // Get sibling
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      const sibling = siblingIndex < level.length ? level[siblingIndex] : this.zeroHashes[d];
      proof.push(bigintToBytes32(sibling));

      // Move to next level
      const nextLevel: bigint[] = [];
      for (let i = 0; i < Math.ceil(level.length / 2); i++) {
        const left = level[2 * i];
        const right = 2 * i + 1 < level.length ? level[2 * i + 1] : this.zeroHashes[d];
        nextLevel.push(await poseidonHash2(left, right));
      }

      level = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { proof, pathIndices };
  }

  /**
   * Verify a Merkle proof.
   */
  async verifyProof(
    leaf: Uint8Array,
    proof: Uint8Array[],
    pathIndices: number[],
    root: Uint8Array
  ): Promise<boolean> {
    if (proof.length !== this.depth || pathIndices.length !== this.depth) {
      return false;
    }

    let current = bytesToBigint(leaf);

    for (let i = 0; i < this.depth; i++) {
      const sibling = bytesToBigint(proof[i]);
      const isRight = pathIndices[i] === 1;

      if (isRight) {
        current = await poseidonHash2(sibling, current);
      } else {
        current = await poseidonHash2(current, sibling);
      }
    }

    return current === bytesToBigint(root);
  }

  /**
   * Get the number of leaves in the tree.
   */
  getLeafCount(): number {
    return this.leaves.length;
  }

  /**
   * Get a leaf at the given index.
   */
  getLeaf(index: number): Uint8Array | null {
    if (index < 0 || index >= this.leaves.length) {
      return null;
    }
    return bigintToBytes32(this.leaves[index]);
  }

  /**
   * Serialize the tree state for storage.
   */
  serialize(): string {
    return JSON.stringify({
      depth: this.depth,
      leaves: this.leaves.map(l => l.toString()),
    });
  }

  /**
   * Deserialize tree state from storage.
   */
  static async deserialize(data: string): Promise<MerkleTree> {
    const parsed = JSON.parse(data);
    const tree = new MerkleTree(parsed.depth);
    await tree.initialize();
    tree.leaves = parsed.leaves.map((l: string) => BigInt(l));
    return tree;
  }
}

/**
 * Create and initialize a new Merkle tree.
 */
export async function createMerkleTree(depth: number = TREE_DEPTH): Promise<MerkleTree> {
  const tree = new MerkleTree(depth);
  await tree.initialize();
  return tree;
}
