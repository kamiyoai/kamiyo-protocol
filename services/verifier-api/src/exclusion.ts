import type { Context } from 'hono';
import { PublicKey, Connection } from '@solana/web3.js';
import { createHash } from 'crypto';

const SMT_DEPTH = 256;
const EMPTY_LEAF = 0n;

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

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const BLACKLIST_REGISTRY = process.env.BLACKLIST_REGISTRY_PDA;

async function fetchOnChainRoot(): Promise<bigint | null> {
  if (!BLACKLIST_REGISTRY) return null;

  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const pubkey = new PublicKey(BLACKLIST_REGISTRY);
    const account = await connection.getAccountInfo(pubkey);
    if (!account) return null;

    const rootBytes = account.data.slice(8, 40);
    return bytesToField(rootBytes);
  } catch {
    return null;
  }
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

    const onChainRoot = await fetchOnChainRoot();
    if (onChainRoot !== null && onChainRoot !== root) {
      return c.json<ExclusionResponse>({
        not_blacklisted: false,
        error: 'Root mismatch: provided root does not match on-chain registry',
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
  try {
    const root = await fetchOnChainRoot();
    if (root === null) {
      return c.json({ error: 'Blacklist registry not configured' }, 503);
    }
    return c.json({ root: root.toString(16) });
  } catch (err) {
    console.error('Blacklist root fetch error:', err);
    return c.json({ error: 'Failed to fetch blacklist root' }, 500);
  }
}
