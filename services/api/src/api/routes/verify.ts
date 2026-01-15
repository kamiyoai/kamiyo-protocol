import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  blacklist,
  verifyExclusionProof,
  bytesToField,
  SMT_DEPTH,
} from '../../blacklist';
import { logger } from '../../logger';

const router: IRouter = Router();

const TIER_THRESHOLDS = { basic: 0, standard: 70, premium: 85, elite: 95 } as const;
const TIER_LIMITS = { basic: 100, standard: 500, premium: 2000, elite: 10000 } as const;

type Tier = keyof typeof TIER_THRESHOLDS;

function getTierFromThreshold(threshold: number): Tier {
  if (threshold >= 95) return 'elite';
  if (threshold >= 85) return 'premium';
  if (threshold >= 70) return 'standard';
  return 'basic';
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const VERIFIER_PROGRAM =
  process.env.VERIFIER_PROGRAM_ID || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
const TEST_MODE = process.env.TEST_MODE === 'true';

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

// POST /verify/reputation
router.post('/reputation', async (req: Request, res: Response) => {
  try {
    const { agent_pk, commitment, threshold, proof_bytes } = req.body;

    if (!agent_pk || !commitment || threshold === undefined || !proof_bytes) {
      res.status(400).json({
        verified: false,
        error: 'Missing required fields: agent_pk, commitment, threshold, proof_bytes',
      });
      return;
    }

    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(agent_pk);
    } catch {
      res.status(400).json({
        verified: false,
        error: 'Invalid agent_pk: must be valid base58 public key',
      });
      return;
    }

    if (threshold < 0 || threshold > 100) {
      res.status(400).json({
        verified: false,
        error: 'Invalid threshold: must be between 0 and 100',
      });
      return;
    }

    let proofBytes: Uint8Array;
    try {
      proofBytes = Uint8Array.from(Buffer.from(proof_bytes, 'base64'));
    } catch {
      res.status(400).json({
        verified: false,
        error: 'Invalid proof_bytes: must be valid base64',
      });
      return;
    }

    const verified = TEST_MODE
      ? true
      : await verifyProofOnChain(agentPubkey, commitment, threshold, proofBytes);

    if (!verified) {
      res.json({ verified: false, error: 'Proof verification failed' });
      return;
    }

    const tier = getTierFromThreshold(threshold);
    res.json({
      verified: true,
      tier,
      limit: TIER_LIMITS[tier],
    });
  } catch (err) {
    logger.error('Reputation verification error', { error: String(err) });
    res.status(500).json({
      verified: false,
      error: 'Internal verification error',
    });
  }
});

// POST /verify/exclusion
router.post('/exclusion', async (req: Request, res: Response) => {
  try {
    const { agent_pk, root, siblings } = req.body;

    if (!agent_pk || !root || !siblings) {
      res.status(400).json({
        not_blacklisted: false,
        error: 'Missing required fields: agent_pk, root, siblings',
      });
      return;
    }

    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(agent_pk);
    } catch {
      res.status(400).json({
        not_blacklisted: false,
        error: 'Invalid agent_pk: must be valid base58 public key',
      });
      return;
    }

    if (!Array.isArray(siblings) || siblings.length !== SMT_DEPTH) {
      res.status(400).json({
        not_blacklisted: false,
        error: `Invalid siblings: must be array of ${SMT_DEPTH} hex strings`,
      });
      return;
    }

    let rootBigint: bigint;
    try {
      rootBigint = BigInt('0x' + root.replace(/^0x/, ''));
    } catch {
      res.status(400).json({
        not_blacklisted: false,
        error: 'Invalid root: must be hex string',
      });
      return;
    }

    const expectedRoot = blacklist.getRoot();
    if (rootBigint !== expectedRoot) {
      res.status(400).json({
        not_blacklisted: false,
        error: `Root mismatch: expected ${expectedRoot.toString(16).padStart(64, '0')}`,
      });
      return;
    }

    let siblingsBigint: bigint[];
    try {
      siblingsBigint = siblings.map((s: string) => BigInt('0x' + s.replace(/^0x/, '')));
    } catch {
      res.status(400).json({
        not_blacklisted: false,
        error: 'Invalid siblings: each must be valid hex string',
      });
      return;
    }

    const key = bytesToField(agentPubkey.toBytes());
    const notBlacklisted = verifyExclusionProof(key, rootBigint, siblingsBigint);

    res.json({ not_blacklisted: notBlacklisted });
  } catch (err) {
    logger.error('Exclusion verification error', { error: String(err) });
    res.status(500).json({
      not_blacklisted: false,
      error: 'Internal verification error',
    });
  }
});

export default router;
