import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { poseidon2Hash, fieldToHex } from './utils';

const TREE_DEPTH = 256;

export interface SmtExclusionInput {
  root: bigint;
  oraclePk: bigint;
  siblings: bigint[];
}

export interface SmtExclusionProof {
  proof: Uint8Array;
  publicInputs: {
    root: bigint;
    oraclePk: bigint;
  };
}

export class SparseMerkleTree {
  private nodes: Map<string, bigint>;
  private root: bigint;

  constructor() {
    this.nodes = new Map();
    this.root = this.computeEmptyRoot();
  }

  private hashPair(left: bigint, right: bigint): bigint {
    return poseidon2Hash([left, right]);
  }

  private computeEmptyRoot(): bigint {
    let current = 0n;
    for (let i = 0; i < TREE_DEPTH; i++) {
      current = this.hashPair(current, current);
    }
    return current;
  }

  private getBit(key: bigint, position: number): boolean {
    return ((key >> BigInt(TREE_DEPTH - 1 - position)) & 1n) === 1n;
  }

  private getNodeKey(level: number, index: bigint): string {
    return `${level}:${index.toString(16)}`;
  }

  getRoot(): bigint {
    return this.root;
  }

  insert(key: bigint): void {
    let index = 0n;
    const nodePath: { level: number; index: bigint; isRight: boolean }[] = [];

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = this.getBit(key, level);
      nodePath.push({ level, index, isRight });
      index = index * 2n + (isRight ? 1n : 0n);
    }

    this.nodes.set(this.getNodeKey(TREE_DEPTH, index), 1n);

    for (let i = nodePath.length - 1; i >= 0; i--) {
      const { level, index: parentIndex } = nodePath[i];
      const leftChild = this.nodes.get(this.getNodeKey(level + 1, parentIndex * 2n)) || 0n;
      const rightChild = this.nodes.get(this.getNodeKey(level + 1, parentIndex * 2n + 1n)) || 0n;
      const hash = this.hashPair(leftChild, rightChild);
      this.nodes.set(this.getNodeKey(level, parentIndex), hash);

      if (level === 0) {
        this.root = hash;
      }
    }
  }

  contains(key: bigint): boolean {
    let index = 0n;
    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = this.getBit(key, level);
      index = index * 2n + (isRight ? 1n : 0n);
    }
    return (this.nodes.get(this.getNodeKey(TREE_DEPTH, index)) || 0n) !== 0n;
  }

  getSiblings(key: bigint): bigint[] {
    const siblings: bigint[] = new Array(TREE_DEPTH).fill(0n);
    let index = 0n;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = this.getBit(key, level);
      const siblingIndex = isRight ? index * 2n : index * 2n + 1n;
      siblings[level] = this.nodes.get(this.getNodeKey(level + 1, siblingIndex)) || 0n;
      index = index * 2n + (isRight ? 1n : 0n);
    }

    return siblings;
  }

  createExclusionInput(oraclePk: bigint): SmtExclusionInput {
    if (this.contains(oraclePk)) {
      throw new Error('Oracle is blacklisted');
    }

    return {
      root: this.root,
      oraclePk,
      siblings: this.getSiblings(oraclePk)
    };
  }
}

export class SmtExclusionProver {
  private circuitPath: string;
  private artifactsPath: string;

  constructor(circuitPath?: string) {
    this.circuitPath = circuitPath || path.join(__dirname, '../../circuits/smt-exclusion');
    this.artifactsPath = path.join(this.circuitPath, 'target');
  }

  async generateProof(input: SmtExclusionInput): Promise<SmtExclusionProof> {
    if (input.siblings.length !== TREE_DEPTH) {
      throw new Error(`Expected ${TREE_DEPTH} siblings`);
    }

    const siblingsArray = input.siblings.map(s => `"${fieldToHex(s)}"`).join(', ');
    const proverToml = `
root = "${fieldToHex(input.root)}"
oracle_pk = "${fieldToHex(input.oraclePk)}"
siblings = [${siblingsArray}]
`.trim();

    const proverPath = path.join(this.circuitPath, 'Prover.toml');
    fs.writeFileSync(proverPath, proverToml);

    try {
      execSync('nargo compile', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('nargo execute', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('sunspot prove', { cwd: this.circuitPath, stdio: 'pipe' });

      const proofPath = path.join(this.artifactsPath, 'proof');
      const proofBytes = fs.readFileSync(proofPath);

      return {
        proof: new Uint8Array(proofBytes),
        publicInputs: {
          root: input.root,
          oraclePk: input.oraclePk
        }
      };
    } finally {
      if (fs.existsSync(proverPath)) {
        fs.unlinkSync(proverPath);
      }
    }
  }

  formatForSolana(proof: SmtExclusionProof): Uint8Array {
    const publicInputs = Buffer.alloc(64);
    publicInputs.writeBigUInt64BE(proof.publicInputs.root, 0);
    publicInputs.writeBigUInt64BE(proof.publicInputs.oraclePk, 32);
    return new Uint8Array([...proof.proof, ...publicInputs]);
  }
}
