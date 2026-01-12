import type { Context } from 'hono';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';

const SMT_DEPTH = 256;
const EMPTY_LEAF = 0n;

// Blacklist tree for proof generation
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
      siblings: siblings.map(s => s.toString(16).padStart(64, '0')),
      blacklisted,
    };
  }
}

// Global blacklist instance
const blacklist = new BlacklistTree();

// Load blacklisted agents from env on startup
function initBlacklist(): void {
  const blacklistedJson = process.env.BLACKLISTED_AGENTS;
  if (!blacklistedJson) return;

  try {
    const agents: string[] = JSON.parse(blacklistedJson);
    for (const agent of agents) {
      try {
        blacklist.add(new PublicKey(agent));
      } catch {
        console.warn(`Invalid blacklist entry: ${agent}`);
      }
    }
    console.log(`Loaded ${agents.length} blacklisted agents, root: ${blacklist.getRoot().toString(16)}`);
  } catch (err) {
    console.error('Failed to parse BLACKLISTED_AGENTS:', err);
  }
}

initBlacklist();

interface ExclusionRequest {
  agent_pk: string;
  root: string;
  siblings: string[];
}

interface ExclusionResponse {
  not_blacklisted: boolean;
  error?: string;
}

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

function verifyExclusionProof(
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

export async function verifyExclusion(c: Context): Promise<Response> {
  try {
    const body = await c.req.json<ExclusionRequest>();

    if (!body.agent_pk || !body.root || !body.siblings) {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: 'Missing required fields: agent_pk, root, siblings',
      }, 400);
    }

    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(body.agent_pk);
    } catch {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: 'Invalid agent_pk: must be valid base58 public key',
      }, 400);
    }

    if (!Array.isArray(body.siblings) || body.siblings.length !== SMT_DEPTH) {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: `Invalid siblings: must be array of ${SMT_DEPTH} hex strings`,
      }, 400);
    }

    let root: bigint;
    try {
      root = BigInt('0x' + body.root.replace(/^0x/, ''));
    } catch {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: 'Invalid root: must be hex string',
      }, 400);
    }

    const expectedRoot = blacklist.getRoot();
    if (root !== expectedRoot) {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: `Root mismatch: expected ${expectedRoot.toString(16).padStart(64, '0')}`,
      }, 400);
    }

    let siblings: bigint[];
    try {
      siblings = body.siblings.map((s) => BigInt('0x' + s.replace(/^0x/, '')));
    } catch {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: 'Invalid siblings: each must be valid hex string',
      }, 400);
    }

    const key = bytesToField(agentPubkey.toBytes());
    const notBlacklisted = verifyExclusionProof(key, root, siblings);

    return c.json<ExclusionResponse>({ not_blacklisted: notBlacklisted });
  } catch (err) {
    console.error('Exclusion verification error:', err);
    return c.json<ExclusionResponse>({
      not_blacklisted: false,
      error: 'Internal verification error',
    }, 500);
  }
}

export async function getBlacklistRoot(c: Context): Promise<Response> {
  return c.json({ root: blacklist.getRoot().toString(16).padStart(64, '0') });
}

export async function getExclusionProof(c: Context): Promise<Response> {
  const agentPk = c.req.param('agent_pk');

  if (!agentPk) {
    return c.json({ error: 'Missing agent_pk parameter' }, 400);
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(agentPk);
  } catch {
    return c.json({ error: 'Invalid agent_pk: must be valid base58 public key' }, 400);
  }

  const proof = blacklist.proof(pubkey);

  if (proof.blacklisted) {
    return c.json({
      error: 'Agent is blacklisted',
      blacklisted: true,
    }, 403);
  }

  return c.json({
    root: proof.root,
    siblings: proof.siblings,
    blacklisted: false,
  });
}
