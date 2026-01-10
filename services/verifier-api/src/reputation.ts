import type { Context } from 'hono';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

const TIER_THRESHOLDS = { basic: 0, standard: 70, premium: 85, elite: 95 } as const;
const TIER_LIMITS = { basic: 100, standard: 500, premium: 2000, elite: 10000 } as const;

type Tier = keyof typeof TIER_THRESHOLDS;

interface ReputationRequest {
  agent_pk: string;
  commitment: string;
  threshold: number;
  proof_bytes: string;
}

interface ReputationResponse {
  verified: boolean;
  tier?: string;
  limit?: number;
  error?: string;
}

function getTierFromThreshold(threshold: number): Tier {
  if (threshold >= 95) return 'elite';
  if (threshold >= 85) return 'premium';
  if (threshold >= 70) return 'standard';
  return 'basic';
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const VERIFIER_PROGRAM = process.env.VERIFIER_PROGRAM_ID || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';

export async function verifyReputation(c: Context): Promise<Response> {
  try {
    const body = await c.req.json<ReputationRequest>();

    if (!body.agent_pk || !body.commitment || body.threshold === undefined || !body.proof_bytes) {
      return c.json<ReputationResponse>({
        verified: false,
        error: 'Missing required fields: agent_pk, commitment, threshold, proof_bytes',
      }, 400);
    }

    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(body.agent_pk);
    } catch {
      return c.json<ReputationResponse>({
        verified: false,
        error: 'Invalid agent_pk: must be valid base58 public key',
      }, 400);
    }

    if (body.threshold < 0 || body.threshold > 100) {
      return c.json<ReputationResponse>({
        verified: false,
        error: 'Invalid threshold: must be between 0 and 100',
      }, 400);
    }

    let proofBytes: Uint8Array;
    try {
      proofBytes = Uint8Array.from(Buffer.from(body.proof_bytes, 'base64'));
    } catch {
      return c.json<ReputationResponse>({
        verified: false,
        error: 'Invalid proof_bytes: must be valid base64',
      }, 400);
    }

    const verified = await verifyProofOnChain(
      agentPubkey,
      body.commitment,
      body.threshold,
      proofBytes
    );

    if (!verified) {
      return c.json<ReputationResponse>({
        verified: false,
        error: 'Proof verification failed',
      });
    }

    const tier = getTierFromThreshold(body.threshold);
    return c.json<ReputationResponse>({
      verified: true,
      tier,
      limit: TIER_LIMITS[tier],
    });
  } catch (err) {
    console.error('Reputation verification error:', err);
    return c.json<ReputationResponse>({
      verified: false,
      error: 'Internal verification error',
    }, 500);
  }
}

async function verifyProofOnChain(
  agentPk: PublicKey,
  commitment: string,
  threshold: number,
  proof: Uint8Array
): Promise<boolean> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const verifierProgram = new PublicKey(VERIFIER_PROGRAM);

  const agentPkBigint = BigInt('0x' + Buffer.from(agentPk.toBytes()).toString('hex'));
  const commitmentBigint = BigInt('0x' + commitment);

  const threshBuf = Buffer.alloc(8);
  threshBuf.writeBigUInt64LE(BigInt(threshold));

  const agentBuf = Buffer.alloc(32);
  const agentHex = agentPkBigint.toString(16).padStart(64, '0');
  Buffer.from(agentHex, 'hex').copy(agentBuf);

  const commitBuf = Buffer.alloc(32);
  const commitHex = commitmentBigint.toString(16).padStart(64, '0');
  Buffer.from(commitHex, 'hex').copy(commitBuf);

  const data = Buffer.concat([
    Buffer.from([0x02]),
    Buffer.from(proof),
    agentBuf,
    commitBuf,
    threshBuf,
  ]);

  const ix = new TransactionInstruction({
    keys: [],
    programId: verifierProgram,
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = verifierProgram;

  const sim = await connection.simulateTransaction(tx);
  return sim.value.err === null;
}
