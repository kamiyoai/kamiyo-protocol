import { Connection, Keypair, PublicKey, TransactionInstruction, Transaction } from '@solana/web3.js';
import * as crypto from 'crypto';

const COMMITMENT_DOMAIN = new TextEncoder().encode('kamiyo-escrow-v1:commit');
const COMMIT_PHASE_DURATION = 300;
const REVEAL_PHASE_DURATION = 1800;
const MIN_CONSENSUS_ORACLES = 3;
const MAX_SCORE_DEVIATION = 15;

export interface OracleSubmission {
  oracle: string;
  qualityScore: number;
}

export interface ConsensusResult {
  medianScore: number;
  refundPercentage: number;
  outliers: string[];
  validCount: number;
}

export function computeCommitmentHash(
  sessionId: Uint8Array,
  oracle: PublicKey,
  qualityScore: number,
  salt: Uint8Array
): Uint8Array {
  const oracleBytes = oracle.toBytes();
  const data = Buffer.concat([
    Buffer.from(COMMITMENT_DOMAIN),
    Buffer.from([sessionId.length]),
    Buffer.from(sessionId),
    Buffer.from([oracleBytes.length]),
    Buffer.from(oracleBytes),
    Buffer.from([qualityScore]),
    Buffer.from([salt.length]),
    Buffer.from(salt),
  ]);
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
}

export function generateSalt(): Uint8Array {
  return crypto.randomBytes(32);
}

export function calculateRefundPercentage(qualityScore: number): number {
  if (qualityScore <= 49) return 100;
  if (qualityScore <= 64) return 75;
  if (qualityScore <= 79) return 35;
  return 0;
}

export function calculateMedian(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

export function calculateConsensus(submissions: OracleSubmission[]): ConsensusResult {
  if (submissions.length < MIN_CONSENSUS_ORACLES) {
    throw new Error(`Need at least ${MIN_CONSENSUS_ORACLES} oracle submissions`);
  }

  for (const s of submissions) {
    if (!Number.isInteger(s.qualityScore) || s.qualityScore < 0 || s.qualityScore > 100) {
      throw new Error('Quality scores must be integers in [0, 100]');
    }
  }

  const scores = submissions.map((s) => s.qualityScore);
  const median = calculateMedian(scores);
  const outliers: string[] = [];
  let validCount = 0;

  for (const sub of submissions) {
    if (Math.abs(sub.qualityScore - median) > MAX_SCORE_DEVIATION) {
      outliers.push(sub.oracle);
    } else {
      validCount++;
    }
  }

  return {
    medianScore: median,
    refundPercentage: calculateRefundPercentage(median),
    outliers,
    validCount,
  };
}

export function getCommitPhaseEnd(): Date {
  return new Date(Date.now() + COMMIT_PHASE_DURATION * 1000);
}

export function getRevealPhaseEnd(): Date {
  return new Date(Date.now() + (COMMIT_PHASE_DURATION + REVEAL_PHASE_DURATION) * 1000);
}

export function isInCommitPhase(commitEndsAt: Date): boolean {
  return Date.now() < commitEndsAt.getTime();
}

export function isInRevealPhase(commitEndsAt: Date, revealEndsAt: Date): boolean {
  const now = Date.now();
  return now >= commitEndsAt.getTime() && now < revealEndsAt.getTime();
}

export function isReadyForFinalization(revealEndsAt: Date): boolean {
  return Date.now() >= revealEndsAt.getTime();
}

async function sendAndConfirmWithTimeout(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
  opts: { commitment?: 'processed' | 'confirmed' | 'finalized'; timeoutMs?: number } = {}
): Promise<string> {
  const commitment = opts.commitment || 'confirmed';
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const raw = tx.serialize();

  const sendPromise = (async () => {
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: commitment });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, commitment);
    return sig;
  })();

  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<string>((_, reject) => {
    timer = setTimeout(() => reject(new Error('RPC timeout')), timeoutMs);
  });

  try {
    const sig = await Promise.race([sendPromise, timeoutPromise]);
    return sig as string;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function markDisputedOnChain(
  connection: Connection,
  facilitatorKeypair: Keypair,
  escrowPda: PublicKey,
  programId: PublicKey
): Promise<string> {
  const discriminator = Buffer.from([136, 86, 152, 120, 3, 21, 223, 251]);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: facilitatorKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmWithTimeout(connection, tx, [facilitatorKeypair], { commitment: 'confirmed', timeoutMs: 20_000 });
}

export async function finalizeDisputeOnChain(
  connection: Connection,
  facilitatorKeypair: Keypair,
  escrowPda: PublicKey,
  userWallet: PublicKey,
  treasuryWallet: PublicKey,
  programId: PublicKey
): Promise<string> {
  const discriminator = Buffer.from([190, 211, 17, 122, 247, 157, 27, 223]);
  const [oracleConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('oracle_config')], programId);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: userWallet, isSigner: false, isWritable: true },
      { pubkey: treasuryWallet, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: oracleConfigPda, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmWithTimeout(connection, tx, [facilitatorKeypair], { commitment: 'confirmed', timeoutMs: 25_000 });
}

export { COMMIT_PHASE_DURATION, REVEAL_PHASE_DURATION, MIN_CONSENSUS_ORACLES, MAX_SCORE_DEVIATION };
