import { PublicKey } from '@solana/web3.js';
import { poseidon2Hash, bytesToField } from '../utils';

const SMT_DEPTH = 256;
const EMPTY_LEAF = 0n;

function hashPair(left: bigint, right: bigint): bigint {
  return poseidon2Hash([left, right]);
}

function getBit(key: bigint, position: number): boolean {
  return ((key >> BigInt(255 - position)) & 1n) === 1n;
}

export interface BlacklistEntry {
  key: bigint;
  addedAt: number;
  reason?: string;
}

export interface MerkleProof {
  root: bigint;
  key: bigint;
  siblings: bigint[];
  exists: boolean;
}

export class Blacklist {
  private entries = new Map<string, BlacklistEntry>();
  private tree = new Map<string, bigint>(); // path -> hash
  private root: bigint;
  private emptyHashes: bigint[];

  constructor() {
    this.emptyHashes = this.computeEmptyHashes();
    this.root = this.emptyHashes[SMT_DEPTH];
  }

  private computeEmptyHashes(): bigint[] {
    const hashes: bigint[] = [EMPTY_LEAF];
    for (let i = 0; i < SMT_DEPTH; i++) {
      hashes.push(hashPair(hashes[i], hashes[i]));
    }
    return hashes;
  }

  private pathToString(key: bigint, depth: number): string {
    let path = '';
    for (let i = 0; i < depth; i++) {
      path += getBit(key, i) ? '1' : '0';
    }
    return path;
  }

  add(agent: PublicKey, reason?: string): void {
    const key = bytesToField(agent.toBytes());
    const keyStr = key.toString();

    if (this.entries.has(keyStr)) return;

    this.entries.set(keyStr, { key, addedAt: Math.floor(Date.now() / 1000), reason });
    this.updateTree(key, true);
  }

  remove(agent: PublicKey): boolean {
    const key = bytesToField(agent.toBytes());
    const keyStr = key.toString();

    if (!this.entries.has(keyStr)) return false;

    this.entries.delete(keyStr);
    this.updateTree(key, false);
    return true;
  }

  private updateTree(key: bigint, insert: boolean): void {
    const value = insert ? poseidon2Hash([key]) : EMPTY_LEAF;
    let current = value;

    for (let depth = SMT_DEPTH - 1; depth >= 0; depth--) {
      const path = this.pathToString(key, depth);
      const bit = getBit(key, depth);
      const siblingPath = path + (bit ? '0' : '1');
      const sibling = this.tree.get(siblingPath) ?? this.emptyHashes[SMT_DEPTH - 1 - depth];

      current = bit ? hashPair(sibling, current) : hashPair(current, sibling);
      this.tree.set(path, current);
    }

    this.root = current;
  }

  contains(agent: PublicKey): boolean {
    const key = bytesToField(agent.toBytes());
    return this.entries.has(key.toString());
  }

  getRoot(): bigint {
    return this.root;
  }

  size(): number {
    return this.entries.size;
  }

  list(): BlacklistEntry[] {
    return Array.from(this.entries.values());
  }

  proof(agent: PublicKey): MerkleProof {
    const key = bytesToField(agent.toBytes());
    const exists = this.entries.has(key.toString());
    const siblings: bigint[] = [];

    // Build siblings from leaf to root (matching verify order)
    for (let i = 0; i < SMT_DEPTH; i++) {
      const depth = SMT_DEPTH - 1 - i;
      const path = this.pathToString(key, depth);
      const bit = getBit(key, depth);
      const siblingPath = path + (bit ? '0' : '1');
      siblings.push(this.tree.get(siblingPath) ?? this.emptyHashes[i]);
    }

    return { root: this.root, key, siblings, exists };
  }

  exclusionProof(agent: PublicKey): MerkleProof {
    const p = this.proof(agent);
    if (p.exists) throw new Error('agent is blacklisted');
    return p;
  }

  static verify(proof: MerkleProof, expectExists: boolean): boolean {
    const value = expectExists ? poseidon2Hash([proof.key]) : EMPTY_LEAF;
    let current = value;

    for (let i = 0; i < SMT_DEPTH; i++) {
      const depth = SMT_DEPTH - 1 - i;
      const bit = getBit(proof.key, depth);
      const sibling = proof.siblings[i];
      current = bit ? hashPair(sibling, current) : hashPair(current, sibling);
    }

    return current === proof.root;
  }

  export(): { root: string; entries: Array<{ key: string; addedAt: number; reason?: string }> } {
    return {
      root: this.root.toString(16),
      entries: this.list().map(e => ({ key: e.key.toString(16), addedAt: e.addedAt, reason: e.reason })),
    };
  }

  static import(data: { root: string; entries: Array<{ key: string; addedAt: number; reason?: string }> }): Blacklist {
    const bl = new Blacklist();
    for (const e of data.entries) {
      const key = BigInt('0x' + e.key);
      bl.entries.set(key.toString(), { key, addedAt: e.addedAt, reason: e.reason });
      bl.updateTree(key, true);
    }
    if (bl.root.toString(16) !== data.root) {
      throw new Error('root mismatch after import');
    }
    return bl;
  }
}
