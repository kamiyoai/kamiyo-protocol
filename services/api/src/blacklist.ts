import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { logger } from './logger';

const SMT_DEPTH = 256;
const EMPTY_LEAF = 0n;

function poseidon2Hash(inputs: bigint[]): bigint {
  const buffer = Buffer.alloc(inputs.length * 32);
  inputs.forEach((input, i) => {
    const hex = input.toString(16).padStart(64, '0');
    Buffer.from(hex, 'hex').copy(buffer, i * 32);
  });
  const hash = createHash('sha256').update(buffer).digest();
  return BigInt('0x' + hash.toString('hex'));
}

function hashPair(left: bigint, right: bigint): bigint {
  return poseidon2Hash([left, right]);
}

function getBit(key: bigint, position: number): boolean {
  return ((key >> BigInt(255 - position)) & 1n) === 1n;
}

function bytesToField(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error('Expected 32 bytes');
  }
  return BigInt('0x' + Buffer.from(bytes).toString('hex'));
}

class BlacklistTree {
  private entries = new Map<string, bigint>();
  private tree = new Map<string, bigint>();
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

  add(pubkey: PublicKey): void {
    const key = bytesToField(pubkey.toBytes());
    const keyStr = key.toString();
    if (this.entries.has(keyStr)) return;
    this.entries.set(keyStr, key);
    this.updateTree(key, true);
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

  contains(pubkey: PublicKey): boolean {
    const key = bytesToField(pubkey.toBytes());
    return this.entries.has(key.toString());
  }

  getRoot(): bigint {
    return this.root;
  }

  proof(pubkey: PublicKey): { root: string; siblings: string[]; blacklisted: boolean } {
    const key = bytesToField(pubkey.toBytes());
    const blacklisted = this.entries.has(key.toString());
    const siblings: bigint[] = [];

    for (let i = 0; i < SMT_DEPTH; i++) {
      const depth = SMT_DEPTH - 1 - i;
      const path = this.pathToString(key, depth);
      const bit = getBit(key, depth);
      const siblingPath = path + (bit ? '0' : '1');
      siblings.push(this.tree.get(siblingPath) ?? this.emptyHashes[i]);
    }

    return {
      root: this.root.toString(16).padStart(64, '0'),
      siblings: siblings.map((s) => s.toString(16).padStart(64, '0')),
      blacklisted,
    };
  }
}

export const blacklist = new BlacklistTree();

export function initBlacklist(): void {
  const blacklistedJson = process.env.BLACKLISTED_AGENTS;
  if (!blacklistedJson) return;

  try {
    const agents: string[] = JSON.parse(blacklistedJson);
    for (const agent of agents) {
      try {
        blacklist.add(new PublicKey(agent));
      } catch {
        logger.warn('Invalid blacklist entry', { agent });
      }
    }
    logger.info('Loaded blacklisted agents', {
      count: agents.length,
      root: blacklist.getRoot().toString(16),
    });
  } catch (err) {
    logger.error('Failed to parse BLACKLISTED_AGENTS', { error: String(err) });
  }
}

export function verifyExclusionProof(
  key: bigint,
  root: bigint,
  siblings: bigint[]
): boolean {
  if (siblings.length !== SMT_DEPTH) {
    return false;
  }

  let current = EMPTY_LEAF;

  for (let i = 0; i < SMT_DEPTH; i++) {
    const depth = SMT_DEPTH - 1 - i;
    const bit = getBit(key, depth);
    const sibling = siblings[i];
    current = bit ? hashPair(sibling, current) : hashPair(current, sibling);
  }

  return current === root;
}

export { bytesToField, SMT_DEPTH };
