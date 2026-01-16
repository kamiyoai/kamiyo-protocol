import { buildPoseidon } from 'circomlibjs';

const TREE_DEPTH = 20;
const ZERO_VALUE = BigInt(0);

type PoseidonFn = (inputs: bigint[]) => Uint8Array;

export interface MerkleProof {
  path: bigint[];
  indices: number[];
}

export class PoseidonMerkleTree {
  private poseidon: PoseidonFn | null = null;
  private poseidonF: any = null;
  private leaves: bigint[] = [];
  private zeros: bigint[] = [];
  private layers: bigint[][] = [];

  async init(): Promise<void> {
    const poseidon = await buildPoseidon();
    this.poseidon = (inputs: bigint[]) => poseidon(inputs);
    this.poseidonF = poseidon.F;
    this.zeros = this.computeZeros();
    this.layers = [[]];
    for (let i = 1; i <= TREE_DEPTH; i++) {
      this.layers.push([]);
    }
  }

  private hash(left: bigint, right: bigint): bigint {
    if (!this.poseidon || !this.poseidonF) {
      throw new Error('Tree not initialized');
    }
    const result = this.poseidon([left, right]);
    return this.poseidonF.toObject(result);
  }

  private computeZeros(): bigint[] {
    const zeros: bigint[] = [ZERO_VALUE];
    for (let i = 1; i <= TREE_DEPTH; i++) {
      zeros.push(this.hash(zeros[i - 1], zeros[i - 1]));
    }
    return zeros;
  }

  insert(commitment: bigint): number {
    const index = this.leaves.length;
    this.leaves.push(commitment);
    this.layers[0].push(commitment);
    this.updatePath(index);
    return index;
  }

  private updatePath(index: number): void {
    let currentIndex = index;
    let currentHash = this.leaves[index];

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.layers[level][siblingIndex] ?? this.zeros[level];

      const [left, right] = isRight ? [sibling, currentHash] : [currentHash, sibling];
      currentHash = this.hash(left, right);

      const parentIndex = Math.floor(currentIndex / 2);

      if (!this.layers[level + 1]) {
        this.layers[level + 1] = [];
      }
      this.layers[level + 1][parentIndex] = currentHash;

      currentIndex = parentIndex;
    }
  }

  getRoot(): bigint {
    if (this.leaves.length === 0) {
      return this.zeros[TREE_DEPTH];
    }
    return this.layers[TREE_DEPTH][0];
  }

  getProof(index: number): MerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds`);
    }

    const path: bigint[] = [];
    const indices: number[] = [];
    let currentIndex = index;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      const sibling = this.layers[level][siblingIndex] ?? this.zeros[level];

      path.push(sibling);
      indices.push(isRight ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { path, indices };
  }

  getProofByCommitment(commitment: bigint): MerkleProof {
    const index = this.leaves.findIndex((l) => l === commitment);
    if (index === -1) {
      throw new Error('Commitment not found in tree');
    }
    return this.getProof(index);
  }

  contains(commitment: bigint): boolean {
    return this.leaves.includes(commitment);
  }

  get size(): number {
    return this.leaves.length;
  }

  getLeaves(): bigint[] {
    return [...this.leaves];
  }
}

export function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

export function bytes32ToBigint(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result;
}

export async function createMerkleTree(): Promise<PoseidonMerkleTree> {
  const tree = new PoseidonMerkleTree();
  await tree.init();
  return tree;
}
